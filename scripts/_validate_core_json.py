"""Validate core level/scene JSON files parse and have problems arrays."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "data"
files = [
    root / "levels" / "lv1.json",
    root / "levels" / "lv2.json",
    root / "levels" / "lv1-work.json",
    root / "levels" / "lv1-travel.json",
    root / "levels" / "lv1-restaurant.json",
    root / "levels" / "lv2-work.json",
    root / "levels" / "lv2-travel.json",
    root / "levels" / "lv2-restaurant.json",
    root / "scenes" / "work.json",
]

errors = []
for path in files:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        errors.append(f"PARSE FAIL {path.name}: {e}")
        continue
    problems = data.get("problems")
    if not isinstance(problems, list):
        errors.append(f"NO problems array: {path.name}")
        continue
    for i, p in enumerate(problems):
        if not isinstance(p, dict):
            errors.append(f"{path.name}[{i}]: not object")
            continue
        for key in ("id", "jp", "en"):
            if key not in p or p[key] in (None, ""):
                errors.append(f"{path.name} {p.get('id', '?')}: empty/missing {key}")
        if "alt" in p and not isinstance(p["alt"], list):
            errors.append(f"{path.name} {p.get('id')}: alt not array")
    print(f"OK {path.name}: {len(problems)} problems")

if errors:
    print("ERRORS:")
    for e in errors:
        print(" -", e)
    raise SystemExit(1)
print("ALL VALID")
