#!/usr/bin/env python3
"""חותם על **כל** הקובץ של טים, ולא רק על בלוק הניסוח.

🔴 **קיים כי `FIT_STAMP` אמר "זהה" על פונקציה ישנה.**

בריצה החיה הראשונה (25.09) החותם שחזר מהסביבה היה זהה לזה שברפו —
ובאותה נשימה `allowed_origins` לא חזר כלל, כלומר תיקון ה-CORS מעולם
לא נפרס. שני הדברים נכונים יחד: `FIT_STAMP` הוא גיבוב של **טקסט
כללי ההתאמה בלבד**, ושינוי קוד שאינו נוגע בניסוח אינו מזיז אותו.

⚠️ כלומר החותם שנבנה כדי לענות על "האם מה שחי הוא מה שברפו" ענה
"כן" על פונקציה שאינה. הוא לא שיקר — הוא נשאל שאלה שהוא לא מודד.

`DEPLOY_STAMP` מגבב את הקובץ כולו, עם שורת החותם עצמה מוחלפת
בתחליף קבוע (אחרת הוא היה צריך להכיל את הגיבוב של עצמו).

הרצה:  python3 scripts/build-deploy-stamp.py [--check]
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FN = ROOT / "supabase" / "functions" / "tim" / "index.ts"

LINE = re.compile(r'^const DEPLOY_STAMP = "[0-9a-f]{12}";$', re.M)
BLANK = 'const DEPLOY_STAMP = "";'


def compute(src: str) -> str:
    """הגיבוב של הקובץ כשהחותם עצמו מנוטרל."""
    neutral = LINE.sub(BLANK, src)
    if neutral == src:
        raise SystemExit("🔴 שורת DEPLOY_STAMP לא נמצאה ב-index.ts")
    return hashlib.sha256(neutral.encode("utf-8")).hexdigest()[:12]


def main() -> int:
    src = FN.read_text(encoding="utf-8")
    stamp = compute(src)
    updated = LINE.sub(f'const DEPLOY_STAMP = "{stamp}";', src)

    if "--check" in sys.argv:
        if updated != src:
            print("🔴 DEPLOY_STAMP אינו מעודכן. להריץ: python3 scripts/build-deploy-stamp.py")
            return 1
        print(f"✅ DEPLOY_STAMP מעודכן · {stamp}")
        return 0

    FN.write_text(updated, encoding="utf-8")
    print(f"✅ DEPLOY_STAMP = {stamp}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
