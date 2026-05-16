"""Generate JP and EN TTS audio for all problems using Microsoft Edge TTS.

Outputs:
    audio/<id>.mp3        - English (en-US-AriaNeural)
    audio/jp/<id>.mp3     - Japanese (ja-JP-NanamiNeural)

Usage:
    pip install edge-tts
    python scripts/generate_audio.py
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
EN_DIR = ROOT / "audio"
JP_DIR = ROOT / "audio" / "jp"
EN_DIR.mkdir(exist_ok=True)
JP_DIR.mkdir(parents=True, exist_ok=True)

EN_VOICE = "en-US-AriaNeural"
JP_VOICE = "ja-JP-NanamiNeural"
EN_RATE = "-5%"
JP_RATE = "+0%"
CONCURRENCY = 1


def collect_problems() -> list[dict]:
    out = []
    idx = json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8"))
    for s in idx["scenes"]:
        path = DATA_DIR / s["file"]
        d = json.loads(path.read_text(encoding="utf-8"))
        for p in d["problems"]:
            out.append({"id": p["id"], "en": p["en"], "jp": p["jp"]})
    return out


async def synth(out_path: Path, text: str, voice: str, rate: str, label: str) -> bool:
    if out_path.exists() and out_path.stat().st_size > 0:
        return True
    last_err = ""
    for attempt in range(3):
        try:
            communicate = edge_tts.Communicate(text, voice=voice, rate=rate)
            await communicate.save(str(out_path))
            if out_path.stat().st_size == 0:
                raise RuntimeError("empty file")
            print(f"  {label} OK ({out_path.stat().st_size // 1024}KB)", flush=True)
            return True
        except Exception as e:
            last_err = str(e)
            if out_path.exists():
                out_path.unlink()
            await asyncio.sleep(1.5 * (attempt + 1))
    print(f"  {label} FAIL: {last_err[:80]}", flush=True)
    return False


async def synth_one(sem: asyncio.Semaphore, p: dict, idx: int, total: int) -> tuple[bool, bool]:
    async with sem:
        en_path = EN_DIR / f"{p['id']}.mp3"
        jp_path = JP_DIR / f"{p['id']}.mp3"
        en_done = en_path.exists() and en_path.stat().st_size > 0
        jp_done = jp_path.exists() and jp_path.stat().st_size > 0
        if en_done and jp_done:
            return True, True
        print(f"[{idx:3}/{total}] {p['id']}", flush=True)
        en_ok = en_done or await synth(en_path, p["en"], EN_VOICE, EN_RATE, "EN")
        jp_ok = jp_done or await synth(jp_path, p["jp"], JP_VOICE, JP_RATE, "JP")
        return en_ok, jp_ok


async def main():
    problems = collect_problems()
    todo = [p for p in problems if not (
        (EN_DIR / f"{p['id']}.mp3").exists() and (EN_DIR / f"{p['id']}.mp3").stat().st_size > 0 and
        (JP_DIR / f"{p['id']}.mp3").exists() and (JP_DIR / f"{p['id']}.mp3").stat().st_size > 0
    )]
    print(f"Found {len(problems)} problems. Need to generate: {len(todo)}")

    if not todo:
        print("All audio already generated.")
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = [synth_one(sem, p, i + 1, len(todo)) for i, p in enumerate(todo)]
    results = await asyncio.gather(*tasks)
    en_ok = sum(1 for en, _ in results if en)
    jp_ok = sum(1 for _, jp in results if jp)

    en_total_kb = sum(f.stat().st_size for f in EN_DIR.glob("*.mp3")) // 1024
    jp_total_kb = sum(f.stat().st_size for f in JP_DIR.glob("*.mp3")) // 1024
    print(f"\nDone. EN: {en_ok}/{len(todo)} ({en_total_kb}KB total), JP: {jp_ok}/{len(todo)} ({jp_total_kb}KB total)")


if __name__ == "__main__":
    asyncio.run(main())
