"""
/api/explain — accepts a single code block + AST context,
calls Nemotron 3 Super 120B via NVIDIA NIM (primary),
falls back to Gemini 2.5 Flash (secondary) on failure.
"""

import httpx  # type: ignore
from fastapi import APIRouter, HTTPException # type: ignore
from pydantic import BaseModel # type: ignore

from core.config import NVIDIA_API_KEY, GEMINI_API_KEY  # type: ignore

router = APIRouter()

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODEL = "meta/llama-3.1-70b-instruct"

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODEL = "gemini-2.5-flash"


class ExplainRequest(BaseModel):
    code: str
    language: str
    file_path: str
    nodes: list[dict] = []
    edges: list[dict] = []


class ExplainResponse(BaseModel):
    explanation: str
    model_used: str


def _build_prompt(req: ExplainRequest) -> str:
    ast_context = ""

    if req.nodes:
        node_lines = [
            f"- {n.get('label', n.get('id', ''))} at {n.get('source_location', '')}"
            for n in req.nodes[:20]
        ]
        ast_context += "AST nodes in this block:\n" + "\n".join(node_lines) + "\n\n"

    if req.edges:
        edge_lines = [
            f"- {e.get('source', '')} {e.get('relation', '')} {e.get('target', '')}"
            for e in req.edges[:20]
        ]
        ast_context += "Relationships:\n" + "\n".join(edge_lines) + "\n\n"

    return f"""You are a senior software engineer explaining code to a developer reading an unfamiliar codebase.

File: {req.file_path}
Language: {req.language}

{ast_context}Code block:
```{req.language}
{req.code}
```

Write a concise explanation (3-5 sentences) of what this code block does. Focus on:
- The purpose and responsibility of this block
- Any important patterns, design decisions, or non-obvious logic
- How it connects to other parts of the codebase if the AST context shows relevant relationships

Use plain markdown. No headers. No bullet points unless genuinely needed. Write like you are explaining to a colleague in a code review."""


async def _call_nvidia(prompt: str) -> str:
    """Call Nemotron 3 Super 120B via NVIDIA NIM."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{NVIDIA_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": NVIDIA_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 512,
                "temperature": 0.3,
            },
        )
        res.raise_for_status()
        data = res.json()
        return data["choices"][0]["message"]["content"].strip()


async def _call_gemini(prompt: str) -> str:
    """Call Gemini 2.5 Flash as fallback."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{GEMINI_BASE_URL}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"maxOutputTokens": 512, "temperature": 0.3},
            },
        )
        res.raise_for_status()
        data = res.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()


@router.post("/explain", response_model=ExplainResponse)
async def explain(payload: ExplainRequest):
    if not NVIDIA_API_KEY and not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="No AI API keys configured.")

    prompt = _build_prompt(payload)

    # Try NVIDIA first
    if NVIDIA_API_KEY:
        try:
            text = await _call_nvidia(prompt)
            return ExplainResponse(explanation=text, model_used=NVIDIA_MODEL)
        except Exception as e:
            print(f"[explain] NVIDIA failed ({e}), falling back to Gemini...")

    # Fallback to Gemini
    if GEMINI_API_KEY:
        try:
            text = await _call_gemini(prompt)
            return ExplainResponse(explanation=text, model_used="gemini-2.5-flash")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Both providers failed. Last error: {e}")

    raise HTTPException(status_code=500, detail="No available AI provider.")