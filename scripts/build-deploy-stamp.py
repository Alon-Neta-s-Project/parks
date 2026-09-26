#!/usr/bin/env python3
"""חותם על **כל** הקוד של טים שנפרס, ולא רק על בלוק הניסוח.

🔴 **קיים כי `FIT_STAMP` אמר "זהה" על פונקציה ישנה.**

בריצה החיה הראשונה (25.09) החותם שחזר מהסביבה היה זהה לזה שברפו —
ובאותה נשימה `allowed_origins` לא חזר כלל, כלומר תיקון ה-CORS מעולם
לא נפרס. `FIT_STAMP` הוא גיבוב של **טקסט כללי ההתאמה בלבד**, ושינוי קוד
שאינו נוגע בניסוח אינו מזיז אותו.

⚠️ **מאז 26.09 טים הוא תיקייה, ולא קובץ** (apps/server/src/tim/*.ts). החותם
מגבב את כל המודולים שנפרסים — כל .ts שאינו בדיקה, ואת כניסת Supabase
(edge/tim.ts) — כולל שמות הקבצים. חותם על קובץ אחד מהם היה חוזר על הטעות
של FIT_STAMP: שינוי ב-gemini.ts היה משאיר אותו זהה.

השורה עצמה ב-stamp.ts מנוטרלת לפני הגיבוב (אחרת היא הייתה צריכה להכיל
את הגיבוב של עצמה).

הרצה:  python3 scripts/build-deploy-stamp.py [--check]
"""
import hashlib
import re
import sys

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json

LINE = re.compile(r'^export const DEPLOY_STAMP = "[0-9a-f]{12}";$', re.M)
BLANK = 'export const DEPLOY_STAMP = "";'


def files() -> list:
    """מה שנפרס: המודולים של טים (בלי בדיקות וכלי דיבוג) וכניסת Supabase."""
    mods = [f for f in sorted(P.TIM_DIR.glob("*.ts"))
            if not f.name.endswith(".test.ts") and f.name != "probe.ts"]
    return mods + [P.TIM_EDGE]


def compute() -> str:
    h = hashlib.sha256()
    found = False
    for f in files():
        text = f.read_text(encoding="utf-8")
        if f == P.TIM_STAMP:
            neutral = LINE.sub(BLANK, text)
            found = neutral != text
            text = neutral
        h.update(str(f.relative_to(ROOT)).encode() + b"\0" + text.encode("utf-8") + b"\0")
    if not found:
        raise SystemExit(f"🔴 שורת DEPLOY_STAMP לא נמצאה ב-{P.TIM_STAMP.relative_to(ROOT)}")
    return h.hexdigest()[:12]


def main() -> int:
    stamp = compute()
    src = P.TIM_STAMP.read_text(encoding="utf-8")
    updated = LINE.sub(f'export const DEPLOY_STAMP = "{stamp}";', src)

    if "--check" in sys.argv:
        if updated != src:
            print("🔴 DEPLOY_STAMP אינו מעודכן. להריץ: python3 scripts/build-deploy-stamp.py")
            return 1
        print(f"✅ DEPLOY_STAMP מעודכן · {stamp} · {len(files())} קבצים")
        return 0

    P.TIM_STAMP.write_text(updated, encoding="utf-8")
    print(f"✅ DEPLOY_STAMP = {stamp} · {len(files())} קבצים")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
