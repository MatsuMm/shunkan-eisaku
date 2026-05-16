"""Generate Edge TTS audio for grammar.json examples (EN + JP)."""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
GRAMMAR = ROOT / "data" / "grammar.json"
EN_DIR = ROOT / "audio"
JP_DIR = ROOT / "audio" / "jp"
EN_DIR.mkdir(exist_ok=True)
JP_DIR.mkdir(parents=True, exist_ok=True)

EN_VOICE = "en-US-AriaNeural"
JP_VOICE = "ja-JP-NanamiNeural"
EN_RATE = "-5%"
JP_RATE = "+0%"


def collect():
    data = json.loads(GRAMMAR.read_text(encoding="utf-8"))
    out = []
    for sec in data["sections"]:
        for ex in sec.get("examples", []):
            if "id" in ex:
                out.append({"id": ex["id"], "en": ex["en"], "jp": ex["jp"]})
    return out


async def synth(path: Path, text: str, voice: str, rate: str, label: str) -> bool:
    if path.exists() and path.stat().st_size > 0:
        return True
    for attempt in range(3):
        try:
            await edge_tts.Communicate(text, voice=voice, rate=rate).save(str(path))
            if path.stat().st_size == 0:
                raise RuntimeError("empty")
            print(f"  {label} OK ({path.stat().st_size // 1024}KB)", flush=True)
            return True
        except Exception as e:
            err = str(e)
            if path.exists():
                path.unlink()
            await asyncio.sleep(1.5 * (attempt + 1))
    print(f"  {label} FAIL: {err[:60]}", flush=True)
    return False


async def main():
    items = collect()
    print(f"{len(items)} grammar examples")
    for i, it in enumerate(items, 1):
        en_p = EN_DIR / f"{it['id']}.mp3"
        jp_p = JP_DIR / f"{it['id']}.mp3"
        if en_p.exists() and en_p.stat().st_size > 0 and jp_p.exists() and jp_p.stat().st_size > 0:
            continue
        print(f"[{i}/{len(items)}] {it['id']}", flush=True)
        await synth(en_p, it["en"], EN_VOICE, EN_RATE, "EN")
        await synth(jp_p, it["jp"], JP_VOICE, JP_RATE, "JP")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
