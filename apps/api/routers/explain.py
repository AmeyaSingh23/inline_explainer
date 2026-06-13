"""
/api/explain — NVIDIA Llama 70B primary, Gemini 2.5 Flash fallback.
Whole-file, flow-aware explanation with 1-hop cross-file context.
Cached in Supabase explanations table, keyed by (repository_id, file_path).
"""
import httpx  # type: ignore
from fastapi import APIRouter, HTTPException, Depends  # type: ignore
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


class ExplainResponse(BaseModel):
    explanation: str
    model_used: str
    cached: bool


def _build_prompt(req: ExplainRequest) -> str:
    context_section = ""
    if req.connected_files:
        parts = []
        for cf in req.connected_files:
            label = RELATION_LABELS.get(cf.relation, cf.relation)
            parts.append(
                f"### {label}: {cf.file_path}\n```\n{cf.snippet}\n```"
            )
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
- How it connects to the related files shown above, if relevant — what calls into it, what it calls out to, what it imports and why

Use plain markdown with short paragraphs. Headers are fine if the file has distinct sections. Write like you're walking a colleague through this file in a code review, focusing on the "why" and the "how it fits together", not a line-by-line narration."""


async def _call_nvidia(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{NVIDIA_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": NVIDIA_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 4096,
                "temperature": 0.3,
            },
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"].strip()


async def _call_gemini(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{GEMINI_BASE_URL}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": 4096, "temperature": 0.3},
            },
        )
        res.raise_for_status()
        return res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


@router.post("/explain", response_model=ExplainResponse)
async def explain(payload: ExplainRequest, user_id: str = Depends(get_current_user_id)):
    # 1. Check Supabase cache
    cached = await get_explanation(user_id, payload.repository_id, payload.file_path)
    if cached:
        return ExplainResponse(explanation=cached, model_used="cache", cached=True)

    # 2. Cache miss — call AI providers
    if not NVIDIA_API_KEY and not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="No AI API keys configured.")

    prompt = _build_prompt(payload)
    text = None
    model_used = None

    if NVIDIA_API_KEY:
        try:
            text = await _call_nvidia(prompt)
            model_used = "llama-3.1-70b"
        except Exception as e:
            print(f"[explain] NVIDIA failed ({e}), falling back to Gemini...")

    if text is None and GEMINI_API_KEY:
        try:
            text = await _call_gemini(prompt)
            model_used = "gemini-2.5-flash"
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Both providers failed: {e}")

    if text is None:
        raise HTTPException(status_code=500, detail="No available AI provider.")

    # 3. Store in Supabase
    await upsert_explanation(user_id, payload.repository_id, payload.file_path, text)

    return ExplainResponse(explanation=text, model_used=model_used, cached=False)