"""
repo_service.py — clone, validate, and extract AST graph from a public repo.
Called by the ingest router after a job is queued.
"""

import os
import shutil
import stat
import time
import uuid
from pathlib import Path

import psutil  # type: ignore
from git import Repo  # type: ignore
from graphify.extract import collect_files, extract  # type: ignore

from core.config import REPO_SIZE_LIMIT_MB, TEMP_REPO_DIR  # type: ignore


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class RepoTooLargeError(Exception):
    """Raised when the cloned repo exceeds REPO_SIZE_LIMIT_MB."""

class LFSDetectedError(Exception):
    """Raised when .gitattributes contains LFS pointers."""

class CloneError(Exception):
    """Raised when git clone fails for any reason."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_dir_size_mb(path: str) -> float:
    """Returns the total disk size of a directory in MB."""
    total = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total / (1024 * 1024)


def _has_lfs(clone_dir: str) -> bool:
    """Returns True if .gitattributes contains any LFS references."""
    gitattributes = os.path.join(clone_dir, ".gitattributes")
    if not os.path.exists(gitattributes):
        return False
    with open(gitattributes, "r", encoding="utf-8", errors="ignore") as f:
        return "lfs" in f.read().lower()


def _force_remove(path: str) -> None:
    """
    Removes a directory tree even if git has left read-only files behind.
    Includes a small delay to let Windows release file handles after graphifyy.
    """
    import gc
    gc.collect()
    time.sleep(1)

    def _on_error(func, fpath, exc_info):
        os.chmod(fpath, stat.S_IWRITE)
        try:
            func(fpath)
        except Exception:
            pass  # best-effort on Windows

    shutil.rmtree(path, onexc=_on_error)


# ---------------------------------------------------------------------------
# Core service function
# ---------------------------------------------------------------------------

def process_repo(repo_url: str, job_id: str) -> dict:
    """
    Full pipeline:
      1. Shallow clone the repo into a temp directory
      2. Measure disk size — abort if over limit
      3. Check for LFS — abort if detected
      4. Run graphifyy AST extraction
      5. Clean up the cloned directory
      6. Return the graph dict

    Args:
        repo_url: Public repo URL (already validated by the router).
        job_id:   UUID string for this job — used to name the temp directory.

    Returns:
        dict with keys: job_id, repo_url, node_count, extraction_time_s, graph
    """
    clone_dir = str(Path(TEMP_REPO_DIR) / job_id)
    os.makedirs(TEMP_REPO_DIR, exist_ok=True)

    # ------------------------------------------------------------------
    # 1. Shallow clone
    # ------------------------------------------------------------------
    try:
        print(f"[repo_service] Cloning {repo_url} → {clone_dir}")
        start_clone = time.time()
        Repo.clone_from(repo_url, clone_dir, depth=1)
        clone_time = round(time.time() - start_clone, 2)
        print(f"[repo_service] Clone complete in {clone_time}s")
    except Exception as e:
        raise CloneError(f"Failed to clone {repo_url}: {e}") from e

    try:
        # ------------------------------------------------------------------
        # 2. Disk size check (post-clone ground truth)
        # ------------------------------------------------------------------
        size_mb = _get_dir_size_mb(clone_dir)
        print(f"[repo_service] Disk size: {size_mb:.2f} MB")
        if size_mb > REPO_SIZE_LIMIT_MB:
            raise RepoTooLargeError(
                f"Repo is {size_mb:.1f} MB — exceeds the {REPO_SIZE_LIMIT_MB} MB limit."
            )

        # ------------------------------------------------------------------
        # 3. LFS check
        # ------------------------------------------------------------------
        if _has_lfs(clone_dir):
            raise LFSDetectedError(
                "This repository uses Git LFS. LFS repos are not supported."
            )

        # ------------------------------------------------------------------
        # 4. AST extraction via graphifyy (Layer 1 only — no Gemini calls)
        # ------------------------------------------------------------------
        print(f"[repo_service] Starting AST extraction...")
        mem_before = psutil.Process().memory_info().rss / (1024 * 1024)
        start_ast = time.time()

        files = collect_files(Path(clone_dir))
        graph = extract(paths=files, cache_root=None, parallel=True, max_workers=4)

        extraction_time = round(time.time() - start_ast, 2)
        mem_after = psutil.Process().memory_info().rss / (1024 * 1024)

        node_count = len(graph) if isinstance(graph, (list, dict)) else 0
        print(
            f"[repo_service] AST done in {extraction_time}s | "
            f"nodes={node_count} | RAM delta={mem_after - mem_before:.1f} MB"
        )

        return {
            "job_id": job_id,
            "repo_url": repo_url,
            "node_count": node_count,
            "extraction_time_s": extraction_time,
            "graph": graph,
        }

    finally:
        # ------------------------------------------------------------------
        # 5. Always clean up — even if an exception was raised above
        # ------------------------------------------------------------------
        if os.path.exists(clone_dir):
            print(f"[repo_service] Cleaning up {clone_dir}")
            _force_remove(clone_dir)