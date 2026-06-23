"""
InlineExplainer API — entry point.
Registers all routers, configures CORS, and exposes /api/health.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore

from core.config import APP_ENV  # type: ignore
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Wipe any leftover temp dirs from previous runs (Windows cleanup quirk)
    import shutil
    from core.config import TEMP_REPO_DIR
    if os.path.exists(TEMP_REPO_DIR):
        shutil.rmtree(TEMP_REPO_DIR, ignore_errors=True)
        print(f"[startup] Cleared leftover temp dirs in {TEMP_REPO_DIR}")
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
    "https://inline-explainer.vercel.app",  # production frontend
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
from routers.ingest import router as ingest_router  # type: ignore
from routers.explain import router as explain_router  # type: ignore
from routers.chat import router as chat_router  # type: ignore
from routers.user import router as user_router  # type: ignore
app.include_router(ingest_router, prefix="/api")
app.include_router(explain_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(user_router, prefix="/api")


# ---------------------------------------------------------------------------
# Health endpoint  — pinged every 10 min by cron-job.org to prevent cold starts
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["meta"])
async def health():
    return {"status": "ok", "env": APP_ENV}