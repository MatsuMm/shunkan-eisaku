"""Assign stable ids to grammar.json examples (gram-<sec>-<idx>)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GRAMMAR = ROOT / "data" / "grammar.json"

data = json.loads(GRAMMAR.read_text(encoding="utf-8"))
for si, sec in enumerate(data["sections"], 1):
    for ei, ex in enumerate(sec.get("examples", []), 1):
        ex["id"] = f"gram-{si:02d}-{ei}"
GRAMMAR.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Assigned ids to grammar examples.")
