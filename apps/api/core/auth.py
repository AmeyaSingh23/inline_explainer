"""
auth.py — verifies Supabase-issued JWTs using the project's JWKS (public key).
No shared secret needed; works with Supabase's ECC (P-256) signing keys.
"""

import jwt  # type: ignore
from jwt import PyJWKClient  # type: ignore
from fastapi import Header, HTTPException # type: ignore

from core.config import SUPABASE_JWKS_URL  # type: ignore

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not SUPABASE_JWKS_URL:
            raise HTTPException(status_code=500, detail="SUPABASE_JWKS_URL not configured.")
        _jwks_client = PyJWKClient(SUPABASE_JWKS_URL)
    return _jwks_client


async def get_current_user_id(authorization: str = Header(default="")) -> str:
    """
    FastAPI dependency. Extracts and verifies the Supabase JWT from the
    Authorization: Bearer <token> header, returns the user's UUID (sub claim).
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing 'sub' claim.")

    return user_id