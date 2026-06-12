"""
/api/ingest  — accepts a public repo URL and kicks off AST processing.
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException  # type: ignore
from pydantic import BaseModel, field_validator  # type: ignore

from services.repo_service import (  # type: ignore
    process_repo,
    CloneError,
    RepoTooLargeError,
    LFSDetectedError,
)

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


@router.post("/ingest", response_model=IngestResponse)
async def ingest(payload: IngestRequest):
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

    return IngestResponse(
        job_id=result["job_id"],
        repo_url=result["repo_url"],
        node_count=len(nodes),
        edge_count=len(edges),
        extraction_time_s=result["extraction_time_s"],
        nodes=nodes,
        edges=edges,
    )