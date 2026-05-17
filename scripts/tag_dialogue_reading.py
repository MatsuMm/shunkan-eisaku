"""Add level (+scene) tags to dialogues.json / reading.json so they
integrate into the Lv x Scene axis instead of being standalone."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# dialogues: scene exists; assign level
DLG_LEVEL = {
    "dlg-01": 2, "dlg-02": 2, "dlg-03": 3, "dlg-04": 3, "dlg-05": 3,
    "dlg-06": 2, "dlg-07": 3, "dlg-08": 2, "dlg-09": 3, "dlg-10": 3,
}
dlg = json.loads((DATA / "dialogues.json").read_text(encoding="utf-8"))
for d in dlg["dialogues"]:
    d["level"] = DLG_LEVEL.get(d["id"], 3)
(DATA / "dialogues.json").write_text(
    json.dumps(dlg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# reading: assign level + scene
RD_TAG = {
    "rd-01": (3, "work"),    "rd-02": (2, "daily"),
    "rd-03": (3, "daily"),   "rd-04": (4, "general"),
    "rd-05": (3, "work"),    "rd-06": (2, "travel"),
    "rd-07": (4, "general"), "rd-08": (3, "work"),
    "rd-09": (3, "travel"),  "rd-10": (4, "general"),
}
rd = json.loads((DATA / "reading.json").read_text(encoding="utf-8"))
for p in rd["passages"]:
    lv, sc = RD_TAG.get(p["id"], (3, "general"))
    p["level"] = lv
    p["scene"] = sc
(DATA / "reading.json").write_text(
    json.dumps(rd, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("Tagged dialogues + reading with level/scene.")
