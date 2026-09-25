#!/usr/bin/env python3
"""בונה את `park.intro_he` מתוך מדריכי אופי הפארק.

🔴 **הכרעת פולה, 10.09:** `intro_he` יהיה **בדיוק** פסקת "מה מייחד אותו"
מתוך מדריך האופי, וייבנה ממנה — ולא ייכתב בנפרד.

⚠️ **הסיבה אינה סגנון.** תוכן שמופיע בשני מסכים ונכתב פעמיים הוא שני
מקורות אמת, ואחד מהם מתיישן בשקט. זה קרה כאן שלוש פעמים כבר.

⚠️ **ופארק בלי מדריך נשאר `NULL`, ולעולם לא מחרוזת ריקה.** `NULL`
פירושו "טרם נכתב" ונראה ככזה; מחרוזת ריקה נראית כמו פתיח שנכתב ויצא
ריק, ואיש לא היה בודק אותה.

  python3 scripts/build-park-intro.py           # לבנות
  python3 scripts/build-park-intro.py --check   # שער ה-QA
"""
import pathlib
import re
import sys

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json
GUIDES = P.KNOWLEDGE
OUT = P.DEPLOY / "park-intro.txt"

SECTION = "## מה מייחד אותו"

# מדריך → מזהה הפארק במסד.
PARK_ID = {
    "park-character-magic-kingdom-wdw": "mk",
    "park-character-hollywood-studios-wdw": "hs",
    "park-character-animal-kingdom-wdw": "ak",
    "park-character-usf-uor": "us",
    "park-character-ioa-uor": "ioa",
    "park-character-epic-uor": "epic",
    # ⚠️ EPCOT נוסף ב-14.09. הטקסט היה קיים ומאושר מ-09.09 ופשוט לא
    # נטען — פער טעינה, לא פער מחקר. מצאה פולה.
    "park-character-epcot-wdw": "epcot",
}

HEAD = """-- park-intro — פתיח אופי הפארק, נגזר ממדריכי האופי
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase ← SQL Editor
-- שם השאילתה: park-intro (כלי חוזר — לא צריך מספר)
--
-- ⚠️ **נוצר על ידי scripts/build-park-intro.py. אין לערוך ביד.**
--
-- 🔴 **הכרעת פולה, 10.09:** הפתיח הוא **בדיוק** פסקת "מה מייחד אותו"
-- מתוך מדריך האופי. לא ניסוח מקביל, ולא גרסה מקוצרת — אותו טקסט.
-- תוכן שנכתב פעמיים הוא שני מקורות אמת, ואחד מהם מתיישן בשקט.

BEGIN;

{updates}

COMMIT;

-- ── אימות ───────────────────────────────────────────────────────────
-- ⚠️ פארק בלי מדריך אופי מופיע כאן עם NULL, וזה נכון. NULL = טרם
-- נכתב. מחרוזת ריקה הייתה נראית כמו פתיח שנכתב ויצא ריק.
select id as "פארק",
       case when intro_he is null then '— טרם נכתב —'
            else left(intro_he, 60) || '…' end as "הפתיח",
       coalesce(length(intro_he)::text, '—') as "תווים"
  from park where park_kind = 'theme' order by id;
"""


def section_of(path: pathlib.Path) -> str | None:
    lines = path.read_text(encoding="utf-8").splitlines()
    try:
        start = lines.index(SECTION) + 1
    except ValueError:
        return None
    body = []
    for ln in lines[start:]:
        if ln.startswith("## "):
            break
        body.append(ln)
    text = "\n".join(body).strip()
    return re.sub(r"\n{2,}", " ", text).replace("\n", " ").strip() or None


def build() -> tuple[str, list[str]]:
    updates, missing = [], []
    for stem, pid in sorted(PARK_ID.items(), key=lambda kv: kv[1]):
        src = GUIDES / f"{stem}.md"
        if not src.exists():
            missing.append(f"{pid} — אין קובץ {stem}.md")
            continue
        text = section_of(src)
        if not text:
            missing.append(f"{pid} — אין סעיף '{SECTION}' ב-{stem}.md")
            continue
        esc = text.replace("'", "''")
        updates.append(f"update park set intro_he = '{esc}' where id = '{pid}';")
    return HEAD.format(updates="\n\n".join(updates)), missing


def main() -> int:
    sql, missing = build()
    check = "--check" in sys.argv

    if check:
        if OUT.exists() and OUT.read_text(encoding="utf-8") == sql:
            print(f"✅ {OUT.relative_to(ROOT)} מעודכן מול מדריכי האופי")
        else:
            print(f"🔴 {OUT.relative_to(ROOT)} אינו מעודכן מול {GUIDES.relative_to(ROOT)}/.")
            print("   python3 scripts/build-park-intro.py")
            return 1
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(sql, encoding="utf-8")
        print(f"✅ {OUT.relative_to(ROOT)} · {len(PARK_ID) - len(missing)} פארקים")

    if missing:
        print("⚠️ פארקים בלי פתיח — יישארו NULL:")
        for m in missing:
            print(f"   · {m}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
