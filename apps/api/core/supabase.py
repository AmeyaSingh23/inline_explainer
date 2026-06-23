"""
supabase.py — thin httpx wrapper around Supabase's PostgREST API.
Uses the service_role key, bypasses RLS — every call MUST filter by user_id.
"""

import httpx # type: ignore
from core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  # type: ignore

REST_URL = f"{SUPABASE_URL}/rest/v1"
AUTH_ADMIN_URL = f"{SUPABASE_URL}/auth/v1/admin"

_HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}


async def get_repository(user_id: str, repo_url: str) -> dict | None:
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


async def get_chat_session(user_id: str, repository_id: str, file_path: str) -> list[dict]:
    params = {
        "select": "messages",
        "user_id": f"eq.{user_id}",
        "repository_id": f"eq.{repository_id}",
        "file_path": f"eq.{file_path}",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(f"{REST_URL}/chat_sessions", headers=_HEADERS, params=params)
        res.raise_for_status()
        rows = res.json()
        return rows[0]["messages"] if rows else []


async def upsert_chat_session(user_id: str, repository_id: str, file_path: str, messages: list[dict]) -> None:
    headers = {**_HEADERS, "Prefer": "resolution=merge-duplicates"}
    payload = {
        "user_id": user_id,
        "repository_id": repository_id,
        "file_path": file_path,
        "messages": messages,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{REST_URL}/chat_sessions",
            headers=headers,
            params={"on_conflict": "repository_id,file_path"},
            json=payload,
        )
        res.raise_for_status()


async def get_user_repositories(user_id: str) -> list[dict]:
    """Returns all repositories analysed by this user, newest first."""
    params = {
        "select": "id,repo_url,repo_name,created_at,processing_status",
        "user_id": f"eq.{user_id}",
        "order": "created_at.desc",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(f"{REST_URL}/repositories", headers=_HEADERS, params=params)
        res.raise_for_status()
        return res.json()


async def get_user_profile(user_id: str) -> dict | None:
    """Returns the public.users row for this user."""
    params = {
        "select": "id,username,github_id,created_at",
        "id": f"eq.{user_id}",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(f"{REST_URL}/users", headers=_HEADERS, params=params)
        res.raise_for_status()
        rows = res.json()
        return rows[0] if rows else None


async def delete_auth_user(user_id: str) -> None:
    """
    Deletes the user from auth.users via Supabase Admin API.
    ON DELETE CASCADE wipes public.users + all child rows automatically.
    Only callable with service_role key.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.delete(
            f"{AUTH_ADMIN_URL}/users/{user_id}",
            headers=_HEADERS,
        )
        res.raise_for_status()