"""
/api/explain — NVIDIA Llama 70B primary, Gemini 2.5 Flash fallback.
Cached in Supabase explanations table. Streams response token by token.
"""
import json
import httpx  # type: ignore
from fastapi import APIRouter, HTTPException, Depends  # type: ignore
from fastapi.responses import StreamingResponse  # type: ignore
from pydantic import BaseModel  # type: ignore
from core.config import NVIDIA_API_KEY, GEMINI_API_KEY  # type: ignore
from core.auth import get_current_user_id  # type: ignore
from core.supabase import get_explanation, upsert_explanation  # type: ignore

router = APIRouter()

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL    = "meta/llama-3.1-70b-instruct"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL    = "gemini-2.5-flash"

RELATION_LABELS = {
    "calls": "Calls into",
    "called_by": "Called by",
    "imports": "Imports",
}


class ConnectedFile(BaseModel):
    file_path: str
    snippet: str
    relation: str


class ExplainRequest(BaseModel):
    code: str
    language: str
    file_path: str
    repository_id: str
    connected_files: list[ConnectedFile] = []


def _build_prompt(req: ExplainRequest) -> str:
    context_section = ""
    if req.connected_files:
        parts = []
        for cf in req.connected_files:
            label = RELATION_LABELS.get(cf.relation, cf.relation)
            parts.append(f"### {label}: {cf.file_path}\n```\n{cf.snippet}\n```")
        context_section = "\n\nConnected context from related files:\n\n" + "\n\n".join(parts)

    return f"""You are a senior software engineer explaining code to a developer reading an unfamiliar codebase.

File: {req.file_path}
Language: {req.language}

Full file code:
```{req.language}
{req.code}
```
{context_section}

Write a clear explanation of this file's role in the system. Cover:
- The overall purpose and responsibility of this file
- The flow of execution through it (what happens, in what order)
- How it connects to the related files shown above, if relevant

Use plain markdown with short paragraphs. Write like you're walking a colleague through this file in a code review."""


async def _stream_nvidia(prompt: str):
    """Yields text chunks from NVIDIA NIM streaming API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{NVIDIA_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": NVIDIA_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 4096,
                "temperature": 0.3,
                "stream": True,
            },
        ) as res:
            res.raise_for_status()
            async for line in res.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    text = chunk["choices"][0]["delta"].get("content", "")
                    if text:
                        yield text
                except Exception:
                    continue


async def _stream_gemini(prompt: str):
    """Yields text chunks from Gemini streaming API."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{GEMINI_BASE_URL}/{GEMINI_MODEL}:streamGenerateContent?key={GEMINI_API_KEY}&alt=sse",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": 4096, "temperature": 0.3},
            },
        ) as res:
            res.raise_for_status()
            async for line in res.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    text = chunk["candidates"][0]["content"]["parts"][0].get("text", "")
                    if text:
                        yield text
                except Exception:
                    continue


@router.post("/explain")
async def explain(payload: ExplainRequest, user_id: str = Depends(get_current_user_id)):
    # Check Supabase cache first — if cached, stream it instantly as a single chunk
    cached = await get_explanation(user_id, payload.repository_id, payload.file_path)
    if cached:
        async def cached_stream():
            # Send cached flag so frontend knows, then the content
            yield f"data: {json.dumps({'cached': True})}\n\n"
            yield f"data: {json.dumps({'text': cached})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(
            cached_stream(),
            media_type="text/event-stream",
            headers={
                "X-Accel-Buffering": "no",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
            }
        )

    if not NVIDIA_API_KEY and not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="No AI API keys configured.")

    prompt = _build_prompt(payload)

    async def generate():
        full_text = []
        provider_worked = False

        # Try NVIDIA first
        if NVIDIA_API_KEY:
            try:
                async for chunk in _stream_nvidia(prompt):
                    full_text.append(chunk)
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
                provider_worked = True
            except Exception as e:
                print(f"[explain] NVIDIA streaming failed ({e}), falling back to Gemini...")
                full_text = []  # reset — don't cache partial output

        # Fallback to Gemini
        if not provider_worked and GEMINI_API_KEY:
            try:
                async for chunk in _stream_gemini(prompt):
                    full_text.append(chunk)
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
                provider_worked = True
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        if provider_worked and full_text:
            complete = "".join(full_text)
            try:
                await upsert_explanation(user_id, payload.repository_id, payload.file_path, complete)
            except Exception as e:
                print(f"[explain] Failed to cache explanation: {e}")

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        }
    )