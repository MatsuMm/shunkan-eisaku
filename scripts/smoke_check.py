#!/usr/bin/env python3
"""Offline smoke checks for commercial release."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []
warns: list[str] = []


def ok(msg: str) -> None:
    print("  OK  ", msg)


def err(msg: str) -> None:
    errors.append(msg)
    print("  ERR ", msg)


def warn(msg: str) -> None:
    warns.append(msg)
    print("  WARN", msg)


def main() -> int:
    print("== smoke_check ==")
    # required files
    for rel in [
        "index.html", "app.js", "styles.css", "sw.js", "manifest.json",
        "VERSION", "START_HERE.md", "CHANGELOG.md", "README.md",
        "legal/terms.html", "legal/privacy.html", "legal/start-here.html",
        "data/index.json", "data/scenes/it-support.json",
        "icons/icon-192.png", "icons/icon-512.png",
    ]:
        p = ROOT / rel
        if p.exists():
            ok(rel)
        else:
            err(f"missing {rel}")

    idx = json.loads((ROOT / "data/index.json").read_text(encoding="utf-8"))
    ids: list[str] = []
    for src in idx["sources"]:
        path = ROOT / "data" / src["file"]
        if not path.exists():
            err(f"source missing: {src['file']}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        probs = data.get("problems") or []
        if not probs:
            err(f"no problems in {src['file']}")
        for p in probs:
            if not p.get("id") or not p.get("jp") or not p.get("en"):
                err(f"bad problem in {src['file']}: {p.get('id')}")
            ids.append(p["id"])
    uniq = len(set(ids))
    print(f"  problems: {len(ids)} total, {uniq} unique")
    if len(ids) != uniq:
        err("duplicate problem ids")
    else:
        ok("unique ids")

    # audio coverage
    missing_en = [i for i in ids if not (ROOT / "audio" / f"{i}.mp3").exists()]
    missing_jp = [i for i in ids if not (ROOT / "audio" / "jp" / f"{i}.mp3").exists()]
    print(f"  missing EN audio: {len(missing_en)}")
    print(f"  missing JP audio: {len(missing_jp)}")
    if len(missing_en) > 50:
        warn(f"many missing EN audio ({len(missing_en)}); Web Speech fallback will cover")
    if missing_en:
        print("    sample EN missing:", ", ".join(missing_en[:8]))

    # app.js critical symbols
    js = (ROOT / "app.js").read_text(encoding="utf-8")
    for sym in [
        "normalizeForDict", "exportProgress", "importProgressFromFile",
        "practiceAgain", "startStudyTimer", "showAppError",
    ]:
        if f"function {sym}" in js:
            ok(f"js {sym}")
        else:
            err(f"js missing {sym}")
    if "gemini" in js.lower():
        warn("gemini string still in app.js")
    else:
        ok("no gemini dead UI in app.js")

    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    if "it-support.json" in sw:
        ok("sw precaches it-support")
    else:
        warn("sw missing it-support.json")

    print("---")
    print(f"errors={len(errors)} warns={len(warns)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
