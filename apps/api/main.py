"""
InlineExplainer API — entry point.
Registers all routers, configures CORS, and exposes /api/health.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore

from core.config import APP_ENV  # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown logic goes here as the project grows."""
    print(f"[startup] InlineExplainer API — env={APP_ENV}")
    yield
    print("[shutdown] InlineExplainer API shutting down.")


app = FastAPI(
    title="InlineExplainer API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = [
    "http://localhost:3000",        # Next.js dev server
    "https://inlineexplainer.vercel.app",  # production frontend (update when known)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers  (imported here as they are built)
# ---------------------------------------------------------------------------
from routers.ingest import router as ingest_router
app.include_router(ingest_router, prefix="/api")


# ---------------------------------------------------------------------------
# Health endpoint  — pinged every 10 min by cron-job.org to prevent cold starts
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["meta"])
async def health():
    return {"status": "ok", "env": APP_ENV}