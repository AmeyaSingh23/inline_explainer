"""
/api/chat — conversational Deep Dive chat, scoped to a specific file context.
NVIDIA Llama 70B primary, Gemini 2.5 Flash fallback.
Model choice comes from the frontend (fast | smart).
"""
import httpx  # type: ignore
from fastapi import APIRouter, HTTPException  # type: ignore
from pydantic import BaseModel  # type: ignore
from core.config import NVIDIA_API_KEY, GEMINI_API_KEY  # type: ignore

router = APIRouter()

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

MODEL_MAP = {
    "fast": {
        "nvidia": "meta/llama-3.1-70b-instruct",
        "gemini": "gemini-2.5-flash",
    },
    "smart": {
        "nvidia": "meta/llama-3.3-70b-instruct",
        "gemini": "gemini-2.5-pro",
    },
}


class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]          # full conversation history
    file_path: str
    file_code: str
    file_explanation: str
    selected_text: str
    model_tier: str = "fast"             # "fast" or "smart"
    repo_file_tree: list[str] = []


class ChatResponse(BaseModel):
    reply: str
    model_used: str


def _build_system_prompt(req: ChatRequest) -> str:
    file_tree_section = ""
    if req.repo_file_tree:
        tree_str = "\n".join(req.repo_file_tree[:300])
        file_tree_section = f"\n\nCOMPLETE FILE TREE OF THIS REPOSITORY (all files that exist):\n{tree_str}"

    return f"""You are a senior software engineer helping a developer deeply understand a specific part of a codebase.

IMPORTANT: When asked about what files exist, what folders contain, or which files are in the project — always answer using the COMPLETE FILE TREE provided below. Do not infer file locations from import paths or make assumptions.
{file_tree_section}

Currently open file: {req.file_path}

Full file code:
\x60\x60\x60
{req.file_code}
\x60\x60\x60

Explanation of this file already generated:
{req.file_explanation}

The developer selected this passage to ask about:
\"\"\"{req.selected_text}\"\"\"

Answer their questions clearly and concisely. Reference the file tree above when asked about project structure. Write in plain markdown."""


async def _call_nvidia(system_prompt: str, messages: list[ChatMessage], model: str) -> str:
    payload_messages = [{"role": "system", "content": system_prompt}]
    payload_messages += [{"role": m.role, "content": m.content} for m in messages]

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{NVIDIA_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": payload_messages,
                "max_tokens": 2048,
                "temperature": 0.3,
            },
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"].strip()


async def _call_gemini(system_prompt: str, messages: list[ChatMessage], model: str) -> str:
    # Gemini uses a different format — system instruction separate, then contents array
    contents = []
    for m in messages:
        role = "user" if m.role == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m.content}]})

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{GEMINI_BASE_URL}/{model}:generateContent?key={GEMINI_API_KEY}",
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "generationConfig": {
                    "maxOutputTokens": 2048,
                    "temperature": 0.3,
                },
            },
        )
        res.raise_for_status()
        return res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    if not NVIDIA_API_KEY and not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="No AI API keys configured.")

    tier = payload.model_tier if payload.model_tier in MODEL_MAP else "fast"
    models = MODEL_MAP[tier]
    system_prompt = _build_system_prompt(payload)

    if NVIDIA_API_KEY:
        try:
            reply = await _call_nvidia(system_prompt, payload.messages, models["nvidia"])
            return ChatResponse(reply=reply, model_used=models["nvidia"])
        except Exception as e:
            print(f"[chat] NVIDIA failed ({e}), falling back to Gemini...")

    if GEMINI_API_KEY:
        try:
            reply = await _call_gemini(system_prompt, payload.messages, models["gemini"])
            return ChatResponse(reply=reply, model_used=models["gemini"])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Both providers failed: {e}")

    raise HTTPException(status_code=500, detail="No available AI provider.")
