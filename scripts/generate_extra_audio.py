"""Generate Edge TTS audio for dialogues / reading / vocab.

- dialogues: audio/<dlg-id>-<n>.mp3   (A turns = Guy male, YOU = Aria female)
- reading:   audio/<rd-id>.mp3        (Guy, narration)
- vocab:     audio/<voc-id>.mp3       (Aria, example sentence)
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
EN_DIR = ROOT / "audio"
EN_DIR.mkdir(exist_ok=True)

ARIA = "en-US-AriaNeural"   # あなた / 例文
GUY = "en-US-GuyNeural"     # 相手 / ナレーション
EN_RATE = "-5%"


def collect():
    jobs = []  # (path, text, voice)
    dlg = json.loads((DATA / "dialogues.json").read_text(encoding="utf-8"))
    for d in dlg["dialogues"]:
        for i, t in enumerate(d["turns"], 1):
            voice = GUY if t["sp"] == "A" else ARIA
            jobs.append((EN_DIR / f"{d['id']}-{i}.mp3", t["en"], voice))
    rd = json.loads((DATA / "reading.json").read_text(encoding="utf-8"))
    for p in rd["passages"]:
        jobs.append((EN_DIR / f"{p['id']}.mp3", p["en"], GUY))
    # vocab は廃止 (フレーズプールから派生) のため対象外
    return jobs


async def synth(path: Path, text: str, voice: str, idx: int, total: int) -> bool:
    if path.exists() and path.stat().st_size > 0:
        return True
    for attempt in range(3):
        try:
            await edge_tts.Communicate(text, voice=voice, rate=EN_RATE).save(str(path))
            if path.stat().st_size == 0:
                raise RuntimeError("empty")
            print(f"[{idx:3}/{total}] {path.name} OK ({path.stat().st_size // 1024}KB)", flush=True)
            return True
        except Exception as e:
            err = str(e)
            if path.exists():
                path.unlink()
            await asyncio.sleep(1.5 * (attempt + 1))
    print(f"[{idx:3}/{total}] {path.name} FAIL: {err[:60]}", flush=True)
    return False


async def main():
    jobs = collect()
    todo = [(p, t, v) for (p, t, v) in jobs if not (p.exists() and p.stat().st_size > 0)]
    print(f"Total {len(jobs)}, need {len(todo)}")
    ok = 0
    for i, (p, t, v) in enumerate(todo, 1):
        if await synth(p, t, v, i, len(todo)):
            ok += 1
    print(f"Done. {ok}/{len(todo)} generated.")


if __name__ == "__main__":
    asyncio.run(main())
