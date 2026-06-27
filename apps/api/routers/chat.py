"""
/api/chat — conversational Deep Dive. NVIDIA primary, Gemini fallback.
Persists per (repository_id, file_path) in Supabase.
Supports "context" role messages (inline code passage anchors).
Streams response token by token. Rate limited per-user on every message.
"""
import json
import httpx  # type: ignore
from fastapi import APIRouter, HTTPException, Depends  # type: ignore
from fastapi.responses import StreamingResponse  # type: ignore
from pydantic import BaseModel  # type: ignore
from core.config import NVIDIA_API_KEY, GEMINI_API_KEY, GROQ_API_KEY  # type: ignore
from core.auth import get_current_user_id  # type: ignore
from core.supabase import get_chat_session, upsert_chat_session  # type: ignore
from core.rate_limiter import check_rate_limit  # type: ignore

router = APIRouter()

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

WATERFALLS = {
    "fast": [
        {"provider": "groq", "model": "llama-3.3-70b-versatile"},
        {"provider": "gemini", "model": "gemini-3-flash-preview"},
        {"provider": "gemini", "model": "gemini-2.5-flash"},
        {"provider": "nvidia", "model": "meta/llama-3.1-70b-instruct"},
    ],
    "smart": [
        {"provider": "gemini", "model": "gemini-3-flash-preview"},
        {"provider": "gemini", "model": "gemini-2.5-flash"},
        {"provider": "groq", "model": "llama-3.3-70b-versatile"},
        {"provider": "nvidia", "model": "meta/llama-3.3-70b-instruct"},
    ]
}

STREAM_HEADERS = {
    "X-Accel-Buffering": "no",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
}


class ChatMessage(BaseModel):
    role: str   # "user", "assistant", or "context"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    file_path: str
    file_code: str
    file_explanation: str
    selected_text: str
    model_tier: str = "fast"
    repo_file_tree: list[str] = []
    repository_id: str


class ChatSessionResponse(BaseModel):
    messages: list[ChatMessage]


def _build_system_prompt(req: ChatRequest) -> str:
    file_tree_section = ""
    if req.repo_file_tree:
        tree_str = "\n".join(req.repo_file_tree[:300])
        file_tree_section = f"\n\nCOMPLETE FILE TREE OF THIS REPOSITORY (all files that exist):\n{tree_str}"

    selected_passage_section = ""
    if req.selected_text.strip():
        selected_passage_section = f'\n\nThe developer selected this passage to ask about:\n"""{req.selected_text}"""'

    # Repo-level chat (no specific file open)
    if not req.file_path.strip():
        readme_section = ""
        if req.file_code.strip():
            readme_section = f"\n\nREADME contents:\n```\n{req.file_code}\n```"

        return f"""You are a senior software engineer helping a developer understand a codebase at a high level.

IMPORTANT: When asked about what files exist, what folders contain, or which files are in the project — always answer using the COMPLETE FILE TREE provided below. Do not infer file locations from import paths or make assumptions.
{file_tree_section}{readme_section}{selected_passage_section}

The developer is exploring this repository and has no specific file open. Answer their questions about the repository's architecture, structure, purpose, and how different parts connect. Be clear and concise. Write in plain markdown."""

    # File-level chat
    return f"""You are a senior software engineer helping a developer deeply understand a specific part of a codebase.

IMPORTANT: When asked about what files exist, what folders contain, or which files are in the project — always answer using the COMPLETE FILE TREE provided below. Do not infer file locations from import paths or make assumptions.
{file_tree_section}

Currently open file: {req.file_path}

Full file code:
\x60\x60\x60
{req.file_code}
\x60\x60\x60

Explanation of this file already generated:
{req.file_explanation}{selected_passage_section}

Answer their questions clearly and concisely. Reference the file tree above when asked about project structure. Write in plain markdown."""


async def _stream_nvidia(system_prompt: str, messages: list[ChatMessage], model: str):
    """Yields text chunks from NVIDIA NIM streaming API."""
    payload_messages = [{"role": "system", "content": system_prompt}]
    for m in messages:
        if m.role == "context":
            payload_messages.append({"role": "user", "content": f"[Focus context selected by developer:\n{m.content}]"})
        else:
            payload_messages.append({"role": m.role, "content": m.content})

    async with httpx.AsyncClient(timeout=15.0) as client:
        async with client.stream(
            "POST",
            f"{NVIDIA_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": payload_messages,
                "max_tokens": 2048,
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


async def _stream_groq(system_prompt: str, messages: list[ChatMessage], model: str):
    """Yields text chunks from Groq streaming API."""
    payload_messages = [{"role": "system", "content": system_prompt}]
    for m in messages:
        if m.role == "context":
            payload_messages.append({"role": "user", "content": f"[Focus context selected by developer:\n{m.content}]"})
        else:
            payload_messages.append({"role": m.role, "content": m.content})

    async with httpx.AsyncClient(timeout=15.0) as client:
        async with client.stream(
            "POST",
            f"{GROQ_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": payload_messages,
                "max_tokens": 2048,
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


async def _stream_gemini(system_prompt: str, messages: list[ChatMessage], model: str):
    """Yields text chunks from Gemini streaming API."""
    contents = []
    for m in messages:
        if m.role == "context":
            text = f"[Focus context selected by developer:\n{m.content}]"
            role = "user"
        else:
            text = m.content
            role = "user" if m.role == "user" else "model"
            
        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"][0]["text"] += "\n\n" + text
        else:
            contents.append({"role": role, "parts": [{"text": text}]})

    async with httpx.AsyncClient(timeout=15.0) as client:
        async with client.stream(
            "POST",
            f"{GEMINI_BASE_URL}/{model}:streamGenerateContent?key={GEMINI_API_KEY}&alt=sse",
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "generationConfig": {"maxOutputTokens": 2048, "temperature": 0.3},
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


@router.get("/chat/session", response_model=ChatSessionResponse)
async def get_session(repository_id: str, file_path: str, user_id: str = Depends(get_current_user_id)):
    messages = await get_chat_session(user_id, repository_id, file_path)
    return ChatSessionResponse(messages=messages)


@router.post("/chat")
async def chat(payload: ChatRequest, user_id: str = Depends(get_current_user_id)):
    # No caching on this endpoint — every message is a live LLM call. Check first.
    check_rate_limit(user_id, "chat")

    if not NVIDIA_API_KEY and not GEMINI_API_KEY and not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="No AI API keys configured.")

    tier = payload.model_tier if payload.model_tier in WATERFALLS else "fast"
    waterfall = WATERFALLS[tier]
    system_prompt = _build_system_prompt(payload)

    async def generate():
        full_text = []
        provider_worked = False
        actual_model_used = None
        actual_provider_used = None

        for step in waterfall:
            provider = step["provider"]
            model = step["model"]
            
            if provider == "groq" and not GROQ_API_KEY: continue
            if provider == "gemini" and not GEMINI_API_KEY: continue
            if provider == "nvidia" and not NVIDIA_API_KEY: continue

            try:
                if provider == "groq":
                    stream = _stream_groq(system_prompt, payload.messages, model)
                elif provider == "gemini":
                    stream = _stream_gemini(system_prompt, payload.messages, model)
                elif provider == "nvidia":
                    stream = _stream_nvidia(system_prompt, payload.messages, model)
                else:
                    continue
                
                async for chunk in stream:
                    full_text.append(chunk)
                    yield f"data: {json.dumps({'text': chunk})}\n\n"
                
                provider_worked = True
                actual_model_used = model
                actual_provider_used = provider
                break
                
            except Exception as e:
                print(f"[chat] {provider} ({model}) streaming failed ({e}), falling back to next provider...", flush=True)
                full_text = []

        if provider_worked and full_text:
            complete = "".join(full_text)
            updated_messages = [m.model_dump() for m in payload.messages] + [{"role": "assistant", "content": complete}]
            try:
                await upsert_chat_session(user_id, payload.repository_id, payload.file_path, updated_messages)
            except Exception as e:
                print(f"[chat] Failed to persist session: {e}", flush=True)
            if actual_model_used:
                yield f"data: {json.dumps({'model_used': actual_model_used})}\n\n"
                print(f"[chat] Response successfully streamed (200 OK) using {actual_provider_used} ({actual_model_used})", flush=True)
        elif not provider_worked:
            yield f"data: {json.dumps({'error': 'All AI providers failed. Please check your API keys or try again later.'})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers=STREAM_HEADERS)
