#!/usr/bin/env python3
"""בדיקת מסמכי הידע לפני ingest.

⚠️ למה סקריפט ולא עין: 17 מסמכים נוספים (נושא 16) ייכנסו לאותה תיקייה,
ומסמך שאחד השדות שלו חסר או מחוץ לאוצר המילים ייכנס לאינדקס בשקט ויישלף
כאילו הוא תשובה. הבדיקה נכשלת בקול, ולפני הטעינה ולא אחריה.

הרצה:  python3 scripts/check-knowledge.py
"""
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "knowledge"

# אוצרי המילים — זהים ל-domain-ים ב-001 ול-check ב-003. ערך שאינו כאן
# עוצר את המסמך ולא נופל לברירת מחדל.
VOCAB = {
    "doc_type": {"guide", "attraction_note", "faq", "policy", "tip", "community_qa"},
    "authority_tier": {"T1", "T2", "T3", "T4", "T5"},
    "volatility": {"static", "seasonal", "volatile"},
    "scope_resort": {"wdw", "uor"},
}
REQUIRED = ["id", "title", "doc_type", "authority_tier", "scope_resort",
            "volatility", "source_url", "last_verified"]
# ⚠️ ארבעת אלה קיימים ב-39 מתוך 53 ואינם ב-14 האחרים. חסר כאן אינו ערך.
OPTIONAL = ["product_family", "audience", "v1_priority", "purchase_type", "source_url_2"]

problems: list[str] = []


def fail(doc: str, msg: str) -> None:
    problems.append(f"{doc}: {msg}")


def main() -> int:
    files = sorted(DIR.glob("*.md"))
    if not files:
        print(f"אין מסמכים ב-{DIR}")
        return 1

    seen_ids: dict[str, str] = {}
    tiers: Counter[str] = Counter()

    for path in files:
        name = path.name
        text = path.read_text(encoding="utf-8")
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
        if not m:
            fail(name, "אין frontmatter")
            continue
        fm = {}
        for line in m.group(1).split("\n"):
            if ":" in line:
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip()
        body = m.group(2).strip()

        for field in REQUIRED:
            if not fm.get(field):
                fail(name, f"חסר {field}")
        for field in fm:
            if field not in REQUIRED and field not in OPTIONAL:
                fail(name, f"שדה שאינו מוכר: {field}")
        for field, allowed in VOCAB.items():
            if field in fm and fm[field] not in allowed:
                fail(name, f"{field}={fm[field]!r} אינו באוצר המילים")

        # ⚠️ ה-id הוא מפתח ה-ingest האידמפוטנטי. אם הוא אינו שם הקובץ,
        # שינוי שם קובץ יוצר מסמך שני במקום לעדכן את הקיים.
        if fm.get("id") and fm["id"] != path.stem:
            fail(name, f"id={fm['id']!r} אינו תואם לשם הקובץ")
        if fm.get("id") in seen_ids:
            fail(name, f"id כפול, מופיע גם ב-{seen_ids[fm['id']]}")
        elif fm.get("id"):
            seen_ids[fm["id"]] = name

        if fm.get("last_verified") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fm["last_verified"]):
            fail(name, f"last_verified={fm['last_verified']!r} אינו תאריך")

        # ⚠️ מסמך קצר מדי הוא בדרך כלל כותרת בלי גוף — הוא ייכנס לאינדקס
        # ויתחרה על אותה שליפה עם מסמך שיש בו תשובה.
        if len(body) < 200:
            fail(name, f"גוף קצר מדי ({len(body)} תווים)")

        # ⚠️ דוח אינו ידע. מסמך שמתאר את המאגר יישלף כאילו הוא תשובה.
        if re.search(r"דוח כיסוי|coverage report", body[:400], re.I):
            fail(name, "נראה כמו דוח ולא כמו ידע")

        if fm.get("authority_tier"):
            tiers[fm["authority_tier"]] += 1

    print(f"{len(files)} מסמכים · " + " · ".join(f"{k} {v}" for k, v in sorted(tiers.items())))
    if problems:
        print(f"\n❌ {len(problems)} בעיות:")
        for p in problems:
            print(f"   {p}")
        return 1
    print("✅ הכול תקין")
    return 0


if __name__ == "__main__":
    sys.exit(main())
