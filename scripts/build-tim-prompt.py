#!/usr/bin/env python3
"""בונה את בלוק כללי ההתאמה בהוראות של טים מתוך apps/web/src/i18n/he.json.

🔴 **קיים כי יצרתי מקור אמת שני.** ההיגיון "מתאים / לא ידוע אם מתאים /
חסר לנו הגובה" נכתב פעם ב-he.json למסך התוצאות, ופעם בהוראות של טים —
שני טקסטים שמתארים אותו דבר, בלי שום קשר ביניהם. מי שיעדכן את he.json
(וזה הכלל: כל המחרוזות שם) לא ייגע בהוראות, ואותה משפחה תקבל שתי
תשובות שונות על אותו מתקן.

⚠️ **וכאן זה לא נתפס בבדיקה רגילה.** שני הקבצים תקינים כל אחד לעצמו.

הרצה:  python3 scripts/build-tim-prompt.py [--check]
"""
import hashlib
import json
import pathlib
import re
import sys

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json
HE = P.HE_JSON
FN = P.TIM_PROMPT

# ⚠️ המפתחות שהם המקור. מפתח שנמחק מ-he.json מפיל כאן, ולא נעלם בשקט.
KEYS = ["everyone", "unknown", "unknownWhy", "unmeasuredWhy", "childSwap", "underCeiling", "underCeilingWhy"]


def build() -> tuple[str, str]:
    fit = json.loads(HE.read_text(encoding="utf-8"))["fit"]
    missing = [k for k in KEYS if k not in fit]
    if missing:
        raise SystemExit(f"🔴 חסרים מפתחות ב-he.json תחת fit: {', '.join(missing)}")

    # ⚠️ הניסוח נלקח מ-he.json כלשונו. הטקסט הוא של פולה, לא שלי.
    rules = (
        "\n· ⚠️ **ארבעת מצבי ההתאמה, ואלה בדיוק אותם ארבעה שהמסך מציג:**\n"
        f'  **"{fit["everyone"]}"** · **"{fit["unknown"]}"** '
        f'({fit["unknownWhy"]}) · **{fit["unmeasuredWhy"]}** · '
        # ⚠️ הרביעי — הכרעת אלון (30.09, אפשרות C): תקרה ורצפה שלא נבדקה. אומרים
        # שלא גבוהים מדי, ולעולם לא "מתאים" — איש לא בדק שאין רצפה.
        f'**"{fit["underCeiling"]}"** ({fit["underCeilingWhy"]}).\n'
        '  ארבעה דברים שונים, ואף אחד מהם אינו "לא מתאים" — '
        'והרביעי אינו "מתאים": אל תאמר "מתאים" כשרק התקרה ידועה.\n'
        "· ⚠️ ומתקן שאינו פתוח לילד עדיין שווה להזכיר כשאפשר "
        f'**{fit["childSwap"]}** — המבוגרים מתחלפים והילד אינו נשאר לבד. '
        "זו תשובה שימושית, לא פסילה."
    )
    stamp = hashlib.sha256(rules.encode("utf-8")).hexdigest()[:12]
    return rules, stamp


def render(rules: str, stamp: str) -> str:
    return (
        "// <fit-rules>\n"
        # export: diagnose.ts מחזיר אותו. הבלוק נכתב מחדש כולו, ולכן גם המילה.
        f'export const FIT_STAMP = "{stamp}";\n'
        f"const FIT_RULES = {json.dumps(rules, ensure_ascii=False)};\n"
        "// </fit-rules>"
    )


def main() -> int:
    rules, stamp = build()
    src = FN.read_text(encoding="utf-8")
    block = re.search(r"// <fit-rules>.*?// </fit-rules>", src, re.S)
    if not block:
        raise SystemExit(f"🔴 אין בלוק <fit-rules> ב-{FN.relative_to(ROOT)}")
    updated = src[: block.start()] + render(rules, stamp) + src[block.end():]

    if "--check" in sys.argv:
        if updated == src:
            print(f"✅ הוראות טים מסונכרנות עם he.json · חותם {stamp}")
            return 0
        print("🔴 הוראות טים אינן מסונכרנות עם he.json.")
        print("   מישהו ערך את אחד מהשניים ולא בנה מחדש. להריץ:")
        print("   python3 scripts/build-tim-prompt.py")
        return 1

    FN.write_text(updated, encoding="utf-8")
    print(f"✅ נכתב · חותם {stamp}")
    print(f"   ⚠️ החותם הזה חוזר מ-diagnose. אפשר להשוות אותו למה שחי בסופהבייס.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
