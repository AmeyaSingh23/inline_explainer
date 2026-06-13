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