"""Generate English TTS audio for all problems using Microsoft Edge TTS.

Usage:
    pip install edge-tts
    python scripts/generate_audio.py

Output: audio/<problem_id>.mp3 (skips already-generated)
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("ERROR: pip install edge-tts", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
AUDIO_DIR = ROOT / "audio"
AUDIO_DIR.mkdir(exist_ok=True)

VOICE = "en-US-AriaNeural"  # 明瞭で会話っぽい女性声
RATE = "-5%"                 # 少しゆっくり (学習用)
CONCURRENCY = 1              # 並列数


def collect_problems() -> list[dict]:
    out = []
    idx = json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8"))
    for s in idx["scenes"]:
        path = DATA_DIR / s["file"]
        d = json.loads(path.read_text(encoding="utf-8"))
        for p in d["problems"]:
            out.append({"id": p["id"], "en": p["en"]})
    return out


async def synth_one(sem: asyncio.Semaphore, p: dict, idx: int, total: int) -> tuple[str, bool, str]:
    async with sem:
        out_path = AUDIO_DIR / f"{p['id']}.mp3"
        if out_path.exists() and out_path.stat().st_size > 0:
            return p["id"], True, "skip"
        # リトライ 3 回
        last_err = ""
        for attempt in range(3):
            try:
                communicate = edge_tts.Communicate(p["en"], voice=VOICE, rate=RATE)
                await communicate.save(str(out_path))
                if out_path.stat().st_size == 0:
                    raise RuntimeError("empty file")
                size_kb = out_path.stat().st_size // 1024
                print(f"[{idx:3}/{total}] {p['id']:14} OK ({size_kb}KB)", flush=True)
                return p["id"], True, "ok"
            except Exception as e:
                last_err = str(e)
                if out_path.exists():
                    out_path.unlink()
                await asyncio.sleep(1.5 * (attempt + 1))
        print(f"[{idx:3}/{total}] {p['id']:14} FAIL after 3 retries", flush=True)
        return p["id"], False, last_err


async def main():
    problems = collect_problems()
    todo = [p for p in problems if not (AUDIO_DIR / f"{p['id']}.mp3").exists()]
    print(f"Found {len(problems)} problems. Need to generate: {len(todo)}")

    if not todo:
        print("All audio already generated.")
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = [synth_one(sem, p, i + 1, len(todo)) for i, p in enumerate(todo)]
    results = await asyncio.gather(*tasks)

    ok = sum(1 for _, success, _ in results if success)
    fail = len(results) - ok
    total_kb = sum(f.stat().st_size for f in AUDIO_DIR.glob("*.mp3")) // 1024
    print(f"\nDone. OK: {ok}, Fail: {fail}. Total audio: {total_kb}KB across {len(list(AUDIO_DIR.glob('*.mp3')))} files.")


if __name__ == "__main__":
    asyncio.run(main())
