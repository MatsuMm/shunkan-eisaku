#!/usr/bin/env python3
"""Build commercial release ZIP (BOOTH / DLsite model A).

Usage (from repo root):
  python scripts/build_release_zip.py

Output: dist/shunkan-eisaku-v{VERSION}.zip
Excludes: .git, .env, __pycache__, node_modules, dist, .grok, etc.
"""
from __future__ import annotations

import hashlib
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip() or "1.0.0"
OUT_DIR = ROOT / "dist"
ZIP_NAME = f"shunkan-eisaku-v{VERSION}.zip"
ZIP_PATH = OUT_DIR / ZIP_NAME

# Top-level / path segments to skip
SKIP_DIR_NAMES = {
    ".git",
    ".grok",
    "__pycache__",
    "node_modules",
    "dist",
    ".venv",
    "venv",
    ".idea",
    ".vscode",
}
SKIP_FILE_NAMES = {
    ".env",
    ".DS_Store",
    "Thumbs.db",
}
SKIP_SUFFIXES = {".pyc", ".pyo", ".log"}
# Optional: keep scripts but not secrets
INCLUDE_SCRIPTS = True


def should_skip(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    parts = set(rel.parts)
    if parts & SKIP_DIR_NAMES:
        return True
    if path.name in SKIP_FILE_NAMES:
        return True
    if path.suffix in SKIP_SUFFIXES:
        return True
    if path.name.startswith("._"):
        return True
    # Never ship local env
    if path.name.endswith(".env") or path.name == ".env.example":
        # allow example? skip both for cleaner buyer package — include example only
        if path.name == ".env":
            return True
    return False


def iter_files():
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        if should_skip(p):
            continue
        if not INCLUDE_SCRIPTS and "scripts" in p.relative_to(ROOT).parts:
            continue
        yield p


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()

    count = 0
    total_bytes = 0
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for p in sorted(iter_files(), key=lambda x: str(x).lower()):
            arc = p.relative_to(ROOT).as_posix()
            # nest under folder for clean extract
            zf.write(p, f"shunkan-eisaku-v{VERSION}/{arc}")
            count += 1
            total_bytes += p.stat().st_size

        # release stamp
        stamp = (
            f"shunkan-eisaku v{VERSION}\n"
            f"built: {date.today().isoformat()}\n"
            f"files: {count}\n"
        )
        zf.writestr(f"shunkan-eisaku-v{VERSION}/RELEASE.txt", stamp)

    raw = ZIP_PATH.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    meta = OUT_DIR / f"{ZIP_NAME}.sha256"
    meta.write_text(f"{sha}  {ZIP_NAME}\n", encoding="utf-8")

    print(f"Wrote {ZIP_PATH}")
    print(f"  files in zip (approx source files): {count}")
    print(f"  source bytes: {total_bytes / (1024 * 1024):.1f} MB")
    print(f"  zip bytes:    {ZIP_PATH.stat().st_size / (1024 * 1024):.1f} MB")
    print(f"  sha256: {sha}")


if __name__ == "__main__":
    main()
