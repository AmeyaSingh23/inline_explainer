"""
supabase.py — thin httpx wrapper around Supabase's PostgREST API.
Uses the service_role key, which bypasses RLS — every call here MUST
explicitly filter by user_id to avoid cross-user data access.
"""

import httpx # type: ignore
from core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  # type: ignore

REST_URL = f"{SUPABASE_URL}/rest/v1"

_HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


async def get_repository(user_id: str, repo_url: str) -> dict | None:
    """Returns the repositories row for this user+repo_url, or None if not found."""
    params = {
        "select": "*",
        "user_id": f"eq.{user_id}",
        "repo_url": f"eq.{repo_url}",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(f"{REST_URL}/repositories", headers=_HEADERS, params=params)
        res.raise_for_status()
        rows = res.json()
        return rows[0] if rows else None


async def upsert_repository(user_id: str, repo_url: str, repo_name: str, graph_json: dict) -> dict:
    """
    Inserts or updates a repositories row for (user_id, repo_url).
    Relies on the unique(user_id, repo_url) constraint for upsert.
    """
    headers = {**_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"}
    payload = {
        "user_id": user_id,
        "repo_url": repo_url,
        "repo_name": repo_name,
        "graph_json": graph_json,
        "processing_status": "ready",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{REST_URL}/repositories",
            headers=headers,
            params={"on_conflict": "user_id,repo_url"},
            json=payload,
        )
        res.raise_for_status()
        rows = res.json()
        return rows[0]


async def get_explanation(user_id: str, repository_id: str, file_path: str) -> str | None:
    """Returns cached explanation text for (repository_id, file_path), or None."""
    params = {
        "select": "explanation",
        "user_id": f"eq.{user_id}",
        "repository_id": f"eq.{repository_id}",
        "file_path": f"eq.{file_path}",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(f"{REST_URL}/explanations", headers=_HEADERS, params=params)
        res.raise_for_status()
        rows = res.json()
        return rows[0]["explanation"] if rows else None


async def upsert_explanation(user_id: str, repository_id: str, file_path: str, explanation: str) -> None:
    """Inserts or updates the explanation for (repository_id, file_path)."""
    headers = {**_HEADERS, "Prefer": "resolution=merge-duplicates"}
    payload = {
        "user_id": user_id,
        "repository_id": repository_id,
        "file_path": file_path,
        "explanation": explanation,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{REST_URL}/explanations",
            headers=headers,
            params={"on_conflict": "repository_id,file_path"},
            json=payload,
        )
        res.raise_for_status()