"""
/api/ingest  — accepts a public repo URL and kicks off AST processing.
Checks Supabase for a cached graph first; only clones+extracts on cache miss.
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Depends # type: ignore
from pydantic import BaseModel, field_validator # type: ignore

from services.repo_service import (  # type: ignore
    process_repo,
    CloneError,
    RepoTooLargeError,
    LFSDetectedError,
)
from core.auth import get_current_user_id  # type: ignore
from core.supabase import get_repository, upsert_repository  # type: ignore

router = APIRouter()

ALLOWED_HOSTS = {"github.com", "gitlab.com", "bitbucket.org"}


class IngestRequest(BaseModel):
    repo_url: str

    @field_validator("repo_url")
    @classmethod
    def must_be_supported_host(cls, v: str) -> str:
        from urllib.parse import urlparse
        parsed = urlparse(v)
        host = parsed.netloc.lower().removeprefix("www.")
        if host not in ALLOWED_HOSTS:
            raise ValueError(
                f"Unsupported host '{host}'. Must be one of: {', '.join(ALLOWED_HOSTS)}"
            )
        return v


class IngestResponse(BaseModel):
    job_id: str
    repo_url: str
    node_count: int
    edge_count: int
    extraction_time_s: float
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    cached: bool


def _repo_name_from_url(repo_url: str) -> str:
    parts = repo_url.rstrip("/").split("/")
    return f"{parts[-2]}/{parts[-1]}" if len(parts) >= 2 else repo_url


@router.post("/ingest", response_model=IngestResponse)
async def ingest(payload: IngestRequest, user_id: str = Depends(get_current_user_id)):
    # 1. Check Supabase for an existing graph for this user+repo
    existing = await get_repository(user_id, payload.repo_url)
    if existing and existing.get("graph_json"):
        graph = existing["graph_json"]
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])
        return IngestResponse(
            job_id=existing["id"],
            repo_url=payload.repo_url,
            node_count=len(nodes),
            edge_count=len(edges),
            extraction_time_s=0.0,
            nodes=nodes,
            edges=edges,
            cached=True,
        )

    # 2. Cache miss — clone + AST extract
    job_id = str(uuid.uuid4())
    try:
        result = process_repo(repo_url=payload.repo_url, job_id=job_id)
    except RepoTooLargeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except LFSDetectedError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except CloneError as e:
        raise HTTPException(status_code=400, detail=str(e))

    graph = result["graph"]
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])

    # 3. Store in Supabase for next time
    repo_row = await upsert_repository(
        user_id=user_id,
        repo_url=payload.repo_url,
        repo_name=_repo_name_from_url(payload.repo_url),
        graph_json=graph,
    )

    return IngestResponse(
        job_id=repo_row["id"],
        repo_url=result["repo_url"],
        node_count=len(nodes),
        edge_count=len(edges),
        extraction_time_s=result["extraction_time_s"],
        nodes=nodes,
        edges=edges,
        cached=False,
    )