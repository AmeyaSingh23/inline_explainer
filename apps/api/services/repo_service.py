"""
repo_service.py — clone, validate, and extract AST graph from a public repo.
"""

import os
import shutil
import stat
import time
from pathlib import Path

import psutil  # type: ignore
from git import Repo  # type: ignore
from graphify.extract import collect_files, extract  # type: ignore

from core.config import REPO_SIZE_LIMIT_MB, TEMP_REPO_DIR  # type: ignore


class RepoTooLargeError(Exception): pass
class LFSDetectedError(Exception): pass
class CloneError(Exception): pass


def _get_dir_size_mb(path: str) -> float:
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
    gitattributes = os.path.join(clone_dir, ".gitattributes")
    if not os.path.exists(gitattributes):
        return False
    with open(gitattributes, "r", encoding="utf-8", errors="ignore") as f:
        return "lfs" in f.read().lower()


def _force_remove(path: str) -> None:
    """
    Reliably removes a directory tree on Windows where git and tree-sitter
    leave behind read-only files with open handles.
    Strategy: strip read-only bit from every file first, then rmtree.
    """
    import gc
    gc.collect()
    time.sleep(2)

    # Strip read-only attribute from every file before attempting delete
    for dirpath, dirnames, filenames in os.walk(path):
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            try:
                os.chmod(fpath, stat.S_IWRITE | stat.S_IREAD)
            except Exception:
                pass

    def _on_error(func, fpath, exc_info):
        try:
            os.chmod(fpath, stat.S_IWRITE | stat.S_IREAD)
            func(fpath)
        except Exception:
            pass

    # DEBUG — remove after testing
    for dirpath, dirnames, filenames in os.walk(path):
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            try:
                os.remove(fpath)
                print(f"[cleanup] deleted: {fpath}")
            except Exception as e:
                print(f"[cleanup] LOCKED: {fpath} — {e}")

    shutil.rmtree(path, onexc=_on_error)

def process_repo(repo_url: str, job_id: str) -> dict:
    clone_dir = str(Path(TEMP_REPO_DIR) / job_id)
    os.makedirs(TEMP_REPO_DIR, exist_ok=True)

    try:
        print(f"[repo_service] Cloning {repo_url} → {clone_dir}")
        start_clone = time.time()
        Repo.clone_from(repo_url, clone_dir, depth=1)
        clone_time = round(time.time() - start_clone, 2)
        print(f"[repo_service] Clone complete in {clone_time}s")
    except Exception as e:
        raise CloneError(f"Failed to clone {repo_url}: {e}") from e

    try:
        size_mb = _get_dir_size_mb(clone_dir)
        print(f"[repo_service] Disk size: {size_mb:.2f} MB")
        if size_mb > REPO_SIZE_LIMIT_MB:
            raise RepoTooLargeError(
                f"Repo is {size_mb:.1f} MB — exceeds the {REPO_SIZE_LIMIT_MB} MB limit."
            )

        if _has_lfs(clone_dir):
            raise LFSDetectedError(
                "This repository uses Git LFS. LFS repos are not supported."
            )

        print(f"[repo_service] Starting AST extraction...")
        mem_before = psutil.Process().memory_info().rss / (1024 * 1024)
        start_ast = time.time()

        files = collect_files(Path(clone_dir))
        graph = extract(paths=files, cache_root=None, parallel=True, max_workers=4)

        extraction_time = round(time.time() - start_ast, 2)
        mem_after = psutil.Process().memory_info().rss / (1024 * 1024)

        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])
        print(
            f"[repo_service] AST done in {extraction_time}s | "
            f"nodes={len(nodes)} edges={len(edges)} | RAM delta={mem_after - mem_before:.1f} MB"
        )

        return {
            "job_id": job_id,
            "repo_url": repo_url,
            "extraction_time_s": extraction_time,
            "graph": graph,
        }

    finally:
        if os.path.exists(clone_dir):
            print(f"[repo_service] Cleaning up {clone_dir}")
            _force_remove(clone_dir)
            
        workdir_cache = Path("graphify_out")
        if workdir_cache.exists():
            shutil.rmtree(workdir_cache, ignore_errors=True)