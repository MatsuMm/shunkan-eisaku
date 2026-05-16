"""Auto-detect reduction/linking patterns in problems and add 'tip' field.

Detects common spoken-English reductions and adds short pronunciation hints
to each affected problem so the learner can consciously recognize them.

Patterns covered:
- want to → wanna
- going to → gonna
- have/has/had to → hafta / hasta / hadta
- got to → gotta
- could/would/should have → coulda / woulda / shoulda
- did/do/would/could you → didja / dja / wouldja / couldja
- let me → lemme
- give me → gimme
- out of → outta
- kind of → kinda
- sort of → sorta
- a lot of → lotta
- got it → gotcha (flap T)
- what are you → whaddaya
- I'm gonna / we'll
- Flap T between vowels (water-like)
- can't (often near-silent t)
- 's (contraction)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SCENES_DIR = DATA_DIR / "scenes"

# 検出ルール: (regex, tip_text) を順に判定し、最初にマッチしたもの (またはすべて) を採用
PATTERNS = [
    (r"\bwant to\b",        "want to → ワナ /ˈwɑnə/: t が脱落して連結"),
    (r"\bgoing to\b",       "going to → ガナ/ガナ /ˈɡənə/: 弱化して連結"),
    (r"\bgot to\b",         "got to → ガラ /ˈɡɑɾə/: t がフラップ化"),
    (r"\bhave to\b",        "have to → ハフタ /ˈhæftə/: v が無声化 (f 音)"),
    (r"\bhas to\b",         "has to → ハスタ /ˈhæstə/: z が無声化 (s 音)"),
    (r"\bhad to\b",         "had to → ハッタ /ˈhætə/: d が同化"),
    (r"\bshould have\b",    "should have → シュダ /ˈʃʊdə/: have が完全弱化"),
    (r"\bcould have\b",     "could have → クッダ /ˈkʊdə/: have が完全弱化"),
    (r"\bwould have\b",     "would have → ウッダ /ˈwʊdə/: have が完全弱化"),
    (r"\bmust have\b",      "must have → マスタ /ˈmʌstə/: have が完全弱化"),
    (r"\blet me\b",         "let me → レミ /ˈlɛmi/: t が脱落"),
    (r"\bgive me\b",        "give me → ギミ /ˈɡɪmi/: v が脱落"),
    (r"\bdid you\b",        "did you → ディジャ /ˈdɪdʒə/: d + y で /dʒ/ 音"),
    (r"\bdo you\b",         "do you → ジャ/ジュ /dʒə/: 完全に縮約"),
    (r"\bwould you\b",      "would you → ウッジャ /ˈwʊdʒə/: d + y で /dʒ/ 音"),
    (r"\bcould you\b",      "could you → クッジャ /ˈkʊdʒə/: d + y で /dʒ/ 音"),
    (r"\bout of\b",         "out of → アウラ /ˈaʊɾə/: t がフラップ + of 弱化"),
    (r"\bkind of\b",        "kind of → カインダ /ˈkaɪndə/: of が完全弱化"),
    (r"\bsort of\b",        "sort of → ソータ /ˈsɔɾə/: t フラップ + of 弱化"),
    (r"\ba lot of\b",       "a lot of → アロッタ /əˈlɑɾə/: t フラップ + of 弱化"),
    (r"\bgot it\b",         "got it → ガリッ /ˈɡɑɾɪt/: t がフラップ (R に近い音)"),
    (r"\bwhat about\b",     "what about → ワラバウ /ˌwʌɾəˈbaʊt/: t フラップ + 連結"),
    (r"\bwhat do you\b",    "what do you → ワッダヤ /ˈwʌɾəjə/: 一気に弱化"),
    (r"\bcan't\b",          "can't → t は破裂せず詰まる音。can と聞き分けにくい"),
    (r"\bisn't\b",          "isn't → イズン /ˈɪzn̩/: t が脱落、n が音節主音"),
    (r"\bdoesn't\b",        "doesn't → ダズン /ˈdʌzn̩/: t が脱落"),
    (r"\bdon't\b",          "don't → ドウン /doʊn/: t が脱落 (次が子音の時)"),
    (r"\bI'm\b",            "I'm → アイム、弱化形でアム /əm/ にも"),
    (r"\bit's\b",           "it's → イッツ。次の単語と連結しやすい"),
    (r"\bI'll\b",           "I'll → アイル → アゥ /aʊ/ に近づく"),
    (r"\bI've\b",           "I've → アイヴ → アヴ /əv/ に弱化"),
    (r"\bwe'll\b",          "we'll → ウィル → ウォ /wəl/ に弱化"),
    (r"\bwe've\b",          "we've → ウィーヴ → ウィヴ /wɪv/ に弱化"),
    (r"\bhe's\b",           "he's → ヒズ /ɪz/: h がしばしば脱落"),
    (r"\bshe's\b",          "she's → シズ /ʃɪz/"),
    (r"\bthey've\b",        "they've → ゼイヴ → ゼヴ /ðəv/ に弱化"),
    (r"\bthey're\b",        "they're → ゼア /ðɛr/"),
    (r"\bgonna\b",          "gonna = going to の縮約。/ˈɡənə/"),
    (r"\bwanna\b",          "wanna = want to の縮約。/ˈwɑnə/"),
    (r"\bgotta\b",          "gotta = got to / have got to の縮約。/ˈɡɑɾə/"),
    (r"\bI was\b",          "I was → アイワズ → アワズ /əwəz/ にも弱化"),
    (r"\bcouldn't\b",       "couldn't → クッドゥン /ˈkʊdn̩/: t が脱落"),
    (r"\bwouldn't\b",       "wouldn't → ウッドゥン /ˈwʊdn̩/: t が脱落"),
    (r"\bshouldn't\b",      "shouldn't → シュドゥン /ˈʃʊdn̩/: t が脱落"),
    (r"\bhaven't\b",        "haven't → ハヴン /ˈhævn̩/: t が脱落"),
    (r"\bhasn't\b",         "hasn't → ハズン /ˈhæzn̩/: t が脱落"),
    (r"\bthat's\b",         "that's → ザッツ。t と s の連結注意"),
    (r"\bthere's\b",        "there's → ゼアズ /ðɛrz/"),
    (r"\bhere's\b",         "here's → ヒアズ /hɪrz/"),
    (r"\bwhere's\b",        "where's → ウェアズ /wɛrz/"),
    (r"\bI had\b",          "I had → アイハッド → アド /əd/ に弱化"),
    (r"\bfor a\b",          "for a → フォラ /fərə/: 連結 + 弱化"),
    (r"\bin a\b",           "in a → イナ /ɪnə/: 連結"),
    (r"\bof a\b",           "of a → オヴァ /əvə/: 連結 + of の v 弱化"),
    (r"\bat a\b",           "at a → アラ /ˈæɾə/: t がフラップ"),
    (r"\bnot a\b",          "not a → ナラ /ˈnɑɾə/: t がフラップ"),
]


def find_tips(en: str) -> list[str]:
    """Return up to 3 tips that match the sentence."""
    tips: list[str] = []
    seen: set[str] = set()
    text = en
    for regex, tip in PATTERNS:
        if re.search(regex, text, flags=re.IGNORECASE):
            if tip not in seen:
                tips.append(tip)
                seen.add(tip)
    return tips[:3]  # 多すぎるとノイズ


def main():
    updated = 0
    total = 0
    for f in sorted(SCENES_DIR.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        changed = False
        for p in data["problems"]:
            total += 1
            tips = find_tips(p["en"])
            new_tip = "\n".join(tips) if tips else None
            current = p.get("tip")
            if new_tip != current:
                if new_tip:
                    p["tip"] = new_tip
                elif "tip" in p:
                    del p["tip"]
                changed = True
                if new_tip:
                    updated += 1
        if changed:
            f.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"Updated {f.name}")
    print(f"\nTotal problems: {total}, with tips: {updated}")


if __name__ == "__main__":
    main()
