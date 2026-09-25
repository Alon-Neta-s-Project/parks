#!/usr/bin/env python3
"""המאסטר → data/source/product_export.csv

⚠️ **הסקריפט הזה היה חסר.** ה-README הפנה ל-export-source-xlsx.py שאינו
קיים, והודעת השגיאה ב-import-content.ts כבר הפנתה ל-build-product-export
בשם הזה. כלומר הצינור הניח שהוא קיים, ואיש לא יכול היה לייצר ייצוא חדש
בלי לעשות זאת ביד. זה נסגר.

⚠️ **המאסטר אינו נכנס לרפו** (כלל בפרויקט). הוא נקרא מהנתיב שנמסר
בשורת הפקודה, ורק הייצוא ומה שמתאר אותו נשמרים.

  python3 scripts/build-product-export.py /path/to/MASTER_v7_10.xlsx
"""
import csv, hashlib, json, sys
from pathlib import Path

import openpyxl

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json
SHEET = "ACTIVITY_DATABASE"
SCOPE = ("Attraction", "Entertainment")

# ⚠️ **הדרה שהוכרעה בתוכן ואין לה ביטוי בקובץ.** פולה הכריעה ש-Hammerhead
# Beach נשאר במאסטר כ"לא אומת" ומודר מהייצוא — אבל אין במאסטר עמודה
# שאומרת זאת. fill_confidence אינו יכול לשמש: 106 מתוך 243 השורות הן
# 'low', וביניהן שמונה שורות מפגשי הדמויות שפולה ביקשה במפורש **לכלול**.
#
# לכן ההדרה רשומה כאן, בשם, ובקול. **זה פתרון זמני שמחכה לעמודה במאסטר** —
# הרשימה הזו תגדל בשקט אם לא תיפתר, וכל מי שיקרא את הייצוא לא יידע למה
# שורה חסרה.
EXCLUDED_KEYS = {
    "Universal Volcano Bay|Attraction|Hammerhead Beach",
}


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    master = Path(sys.argv[1])

    mapping = json.loads((P.CONTENT_MAPPING).read_text("utf-8"))
    want = mapping["requiredColumns"]

    wb = openpyxl.load_workbook(master, read_only=True, data_only=True)
    rows = list(wb[SHEET].iter_rows(values_only=True))
    header = [str(h) if h is not None else "" for h in rows[0]]
    records = [
        dict(zip(header, r))
        for r in rows[1:]
        if any(c is not None and str(c).strip() for c in r)
    ]

    # ⚠️ עמודה חסרה עוצרת. בלי זה היא הייתה יוצאת ריקה בכל השורות —
    # "לא נבדק" במקום "אין ערך", וזו התבנית שנתפסה כאן שבע פעמים.
    missing = [c for c in want if c not in header]
    if missing:
        print(f"✗ עצירה — המאסטר אינו מכיל: {', '.join(missing)}")
        return 1

    # ⚠️ עמודות שאסור להן לצאת. הכלל קיים גם בייבוא, והוא נאכף פעמיים
    # בכוונה: ייצוא שדולף מקורות אינו ניתן לתיקון אחרי שנשלח.
    leaked = [c for c in mapping["neverExpected"]["columns"] if c in want]
    if leaked:
        print(f"✗ עצירה — רשימת הייצוא כוללת עמודות מאסטר: {', '.join(leaked)}")
        return 1

    out, excluded = [], []
    for rec in records:
        if str(rec.get("Activity Type")) not in SCOPE:
            continue
        key = str(rec.get("Key") or "")
        if key in EXCLUDED_KEYS:
            excluded.append(key)
            continue
        out.append({c: "" if rec.get(c) is None else str(rec[c]) for c in want})

    dest = P.CONTENT_MAPPING.parent / mapping["source"]
    with dest.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=want)
        w.writeheader()
        w.writerows(out)

    columns_hash = hashlib.sha256("|".join(want).encode()).hexdigest()[:12]
    (P.SOURCE / "product_export_manifest.json").write_text(
        json.dumps({
            "generated": __import__("datetime").date.today().isoformat(),
            "source_file": master.name,
            "rows": len(out),
            "columns": len(want),
            "columns_hash": columns_hash,
            "scope": list(SCOPE),
            "excluded_by_decision": sorted(EXCLUDED_KEYS),
            "held_out": ["youtube_id", "video_creator"],
        }, ensure_ascii=False, indent=2) + "\n",
        "utf-8",
    )

    print(f"✓ {len(out)} שורות · {len(want)} עמודות · hash {columns_hash}")
    for key in excluded:
        print(f"  ⚠️ מודר בהכרעת תוכן: {key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
