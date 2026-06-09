"""
Graphify POC — Milestone 1 (Final)
Validates pure AST extraction via graphify.extract Python API.
No Gemini API calls. No subprocess. Runs entirely locally.
Run: python poc_graphify.py
"""

import os
import shutil
import stat
import time
import json
from pathlib import Path

import psutil
from git import Repo # type: ignore
from graphify.extract import extract, collect_files # type: ignore

# ------------------------------------------------------------------ #
# CONFIG
# ------------------------------------------------------------------ #

TARGET_REPO   = "https://github.com/tiangolo/fastapi"
CLONE_DIR     = Path("./temp_repos/fastapi_poc")
OUTPUT_DIR    = Path("./temp_repos")
SIZE_LIMIT_MB = 50

# ------------------------------------------------------------------ #
# HELPERS
# ------------------------------------------------------------------ #

def force_remove(func, path, excinfo):
    """Windows fix: git pack files are read-only, force chmod before retry."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


def get_disk_usage_mb(path: Path) -> float:
    total = 0
    for fp in path.rglob("*"):
        try:
            if fp.is_file():
                total += fp.stat().st_size
        except OSError:
            pass
    return total / (1024 * 1024)


def check_lfs(path: Path) -> bool:
    gitattributes = path / ".gitattributes"
    if not gitattributes.exists():
        return False
    return "lfs" in gitattributes.read_text(encoding="utf-8", errors="ignore").lower()


def get_ram_mb() -> float:
    return psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)


# ------------------------------------------------------------------ #
# MAIN
# ------------------------------------------------------------------ #

def run_poc():
    print("\n" + "="*60)
    print("  INLINE_EXPLAINER — GRAPHIFY POC (AST-only, local)")
    print("="*60)

    # --- Cleanup ---
    if CLONE_DIR.exists():
        print(f"\n[CLEANUP] Removing {CLONE_DIR}")
        shutil.rmtree(CLONE_DIR, onexc=force_remove)

    CLONE_DIR.mkdir(parents=True, exist_ok=True)

    # --- Step 1: Shallow clone ---
    print(f"\n[CLONE] Shallow cloning {TARGET_REPO} ...")
    t0 = time.time()
    Repo.clone_from(TARGET_REPO, str(CLONE_DIR), depth=1, single_branch=True)
    print(f"[CLONE] Done in {time.time() - t0:.2f}s")

    # --- Step 2: Post-clone disk check ---
    disk_mb = get_disk_usage_mb(CLONE_DIR)
    print(f"\n[DISK]  Actual checkout size: {disk_mb:.2f} MB")
    if disk_mb > SIZE_LIMIT_MB:
        print(f"[ABORT] Exceeds {SIZE_LIMIT_MB}MB ceiling. Pipeline would reject.")
        return
    print(f"[OK]    Within {SIZE_LIMIT_MB}MB limit.")

    # --- Step 3: LFS check ---
    if check_lfs(CLONE_DIR):
        print("[WARN]  Git LFS detected. Aborting.")
        return
    print("[OK]    No Git LFS detected.")

    # --- Step 4: Collect files ---
    print(f"\n[COLLECT] Scanning for source files...")
    t0 = time.time()
    files = collect_files(CLONE_DIR)
    print(f"[COLLECT] Found {len(files)} files in {time.time() - t0:.2f}s")

    # --- Step 5: AST extraction (pure local, no API calls) ---
    print(f"\n[AST] Running in-process AST extraction...")
    print(f"[AST] This is 100% local — no Gemini calls.")
    ram_before = get_ram_mb()
    t0 = time.time()

    graph: dict = extract(
        paths=files,
        cache_root=None,   # no caching for POC — we want raw timing
        parallel=True,
        max_workers=4
    )

    elapsed = time.time() - t0
    ram_after = get_ram_mb()

    print(f"[AST] Completed in {elapsed:.2f}s")
    print(f"[RAM] Before: {ram_before:.1f} MB | After: {ram_after:.1f} MB | Delta: {ram_after - ram_before:.1f} MB")

    # --- Step 6: Validate and inspect output ---
    if not graph:
        print("[ERROR] extract() returned empty dict. Something is wrong.")
        return

    node_count = len(graph)
    print(f"\n[OUTPUT] Nodes extracted: {node_count}")

    # Save to disk so we can inspect the structure
    out_path = OUTPUT_DIR / "graph.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(graph, f, indent=2, default=str)

    graph_size_kb = out_path.stat().st_size / 1024
    print(f"[OUTPUT] graph.json written to {out_path}")
    print(f"[OUTPUT] File size: {graph_size_kb:.1f} KB")

    # Print a sample node so we can see the data structure
    sample_key = next(iter(graph))
    print(f"\n[SAMPLE] First node key: {sample_key!r}")
    print(f"[SAMPLE] First node value:")
    print(json.dumps(graph[sample_key], indent=2, default=str)[:800])

    print("\n" + "="*60)
    print("  POC COMPLETE — AST extraction is viable.")
    print(f"  {node_count} nodes | {graph_size_kb:.1f} KB | {elapsed:.2f}s | no API calls")
    print("="*60 + "\n")


if __name__ == "__main__":
    run_poc()