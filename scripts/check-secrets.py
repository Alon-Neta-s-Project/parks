#!/usr/bin/env python3
"""סורק את הרפו אחרי מה שנראה כמו סוד.

🔴 **קיים כי אנחנו מייצרים קבצים ושולחים אותם.** קובץ `.txt` שנוצר כאן
ונשלח בצ'אט עוקף כל הגנה של git — הוא לא עובר review, ואם נכנס בו מפתח
הוא כבר בחוץ. ⚠️ **וזה הערוץ שהכי קל לשכוח**, כי הוא לא מרגיש כמו
"פרסום".

⚠️ **מה זה כן ומה זה לא.** זה תופס מחרוזות שנראות כמו מפתח, ולא כל
דליפה אפשרית. סוד בפורמט שלא מוכר כאן יעבור. **הצלחה כאן אינה אישור
שאין דליפה** — היא אומרת שלא נמצאה אחת מהתבניות המוכרות.

הרצה:  python3 scripts/check-secrets.py
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ⚠️ **תבניות של חומר מפתח, ולא שמות.** `service_role` הוא שם תפקיד
# שמופיע לגיטימית בעשרים מיגרציות; חיפוש אחריו היה מייצר רעש שמלמד
# להתעלם מהבדיקה. בדיקה שצועקת על הכול שווה בדיקה שאיש לא קורא.
PATTERNS = [
    ("מפתח גוגל",        r"AIza[0-9A-Za-z_-]{30,}"),
    ("JWT",              r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\."),
    ("מפתח סופהבייס",    r"sb_(secret|publishable)_[A-Za-z0-9]{20,}"),
    ("מחרוזת חיבור",     r"postgres(ql)?://[^\s]*:[^\s@]{8,}@"),
]

# ⚠️ מפתחות בדיקה מזויפים. הם **חייבים** להיראות כמו מפתח אמיתי, אחרת
# הם אינם בודקים את מה שהם נועדו לבדוק.
FAKE = re.compile(r"TESTKEY|YOUR-|your-|xxxx|XXXX|0000000000")


def tracked() -> list[pathlib.Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [ROOT / p for p in out.split("\0") if p]


def main() -> int:
    hits: list[str] = []
    # ⚠️ גם `data/deploy/` — הקבצים שאני שולח לנטע. הם בדרך כלל במעקב,
    # אבל לא תמיד, וזה בדיוק הערוץ שדולף בלי לעבור דרך git.
    files = set(tracked()) | set((ROOT / "data" / "deploy").glob("*.txt"))

    for f in sorted(files):
        if not f.is_file():
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for label, pat in PATTERNS:
            for m in re.finditer(pat, text):
                if FAKE.search(m.group(0)):
                    continue
                line = text[: m.start()].count("\n") + 1
                rel = f.relative_to(ROOT)
                hits.append(f"  {rel}:{line} — {label}")

    if hits:
        print("🔴 נמצא מה שנראה כמו סוד:")
        print("\n".join(hits))
        print("\n⚠️ אם זה מפתח אמיתי — הוא כבר דלף. להחליף אותו, לא רק למחוק.")
        return 1

    print(f"✅ {len(files)} קבצים נסרקו, לא נמצאה תבנית של סוד.")
    print("   ⚠️ זה אומר שלא נמצאה תבנית מוכרת — לא שאין דליפה.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
