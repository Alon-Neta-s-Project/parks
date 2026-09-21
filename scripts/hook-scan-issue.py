#!/usr/bin/env python3
"""חוסם כתיבה ל-Issue שמכילה מה שנראה כמו סוד.

🔴 **זה מה שהופך "כלי שצריך להריץ" ל"מנגנון שרץ"** — דרישת גיא,
חסם #3, 22.09.

הוא רץ כ-PreToolUse hook: Claude Code מעביר לו את קלט הכלי **לפני**
הביצוע, ויציאה בקוד 2 עוצרת את הקריאה ומחזירה את ההודעה.

⚠️ **ומה שהוא לא מכסה, ואין טעם להעמיד פנים:** הוא חל על סשנים
שטוענים את `.claude/settings.json` של הרפו הזה. כתיבת Issue מממשק
הווב של GitHub, או מסוכן שרץ בהגדרות אחרות, אינה עוברת דרכו.

הוא מצמצם את הפער מ"כל כתיבה" ל"כתיבה שלא דרך סשן שלנו". הוא אינו
סוגר אותו.

⚠️ **ואין כאן תבניות משלו.** הוא מייבא אותן מ-check-secrets.py.
שתי רשימות תבניות היו מתפצלות תוך חודש.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from importlib import import_module

scan_text = import_module("check-secrets").scan_text  # type: ignore[attr-defined]

# השדות שנושאים טקסט חופשי בכלי הכתיבה ל-Issues.
TEXT_FIELDS = ("body", "text", "title")


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        # ⚠️ **קלט שלא הצלחנו לפענח אינו "נקי".** חוסמים ומסבירים —
        # hook ששותק על קלט שבור הוא hook שאפשר לעקוף בקלט שבור.
        print("🔴 hook סריקת הסודות לא הצליח לפענח את קלט הכלי.", file=sys.stderr)
        return 2

    tool_input = payload.get("tool_input") or {}
    hits: list[str] = []
    for field in TEXT_FIELDS:
        value = tool_input.get(field)
        if isinstance(value, str) and value:
            hits.extend(scan_text(value, field))

    if hits:
        print("🔴 הכתיבה נחסמה — נמצא מה שנראה כמו סוד:", file=sys.stderr)
        print("\n".join(hits), file=sys.stderr)
        print(
            "\n⚠️ אם זה מפתח אמיתי — להחליף אותו, לא רק למחוק מההודעה.",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
