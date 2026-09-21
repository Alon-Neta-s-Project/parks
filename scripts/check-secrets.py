#!/usr/bin/env python3
"""סורק את הרפו אחרי מה שנראה כמו סוד.

🔴 **קיים כי אנחנו מייצרים קבצים ושולחים אותם.** קובץ `.txt` שנוצר כאן
ונשלח בצ'אט עוקף כל הגנה של git — הוא לא עובר review, ואם נכנס בו מפתח
הוא כבר בחוץ. ⚠️ **וזה הערוץ שהכי קל לשכוח**, כי הוא לא מרגיש כמו
"פרסום".

⚠️ **מה זה כן ומה זה לא.** זה תופס מחרוזות שנראות כמו מפתח, ולא כל
דליפה אפשרית. סוד בפורמט שלא מוכר כאן יעבור. **הצלחה כאן אינה אישור
שאין דליפה** — היא אומרת שלא נמצאה אחת מהתבניות המוכרות.

הרצה:  python3 scripts/check-secrets.py            # קובצי הרפו
       python3 scripts/check-secrets.py --text < f  # טקסט לפני פרסום
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
    # ⚠️ שלוש אלה נוספו 22.09, כשהסודות שבמשחק השתנו: הטוקן של גיא,
    # המפתח של Apify. תבנית שלא קיימת אינה תופסת דבר.
    ("טוקן GitHub",      r"gh[pousr]_[A-Za-z0-9]{30,}"),
    ("טוקן GitHub חדש",  r"github_pat_[A-Za-z0-9_]{60,}"),
    ("מפתח Apify",       r"apify_api_[A-Za-z0-9]{30,}"),
    ("מפתח פרטי",        r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
]

# ⚠️ מפתחות בדיקה מזויפים. הם **חייבים** להיראות כמו מפתח אמיתי, אחרת
# הם אינם בודקים את מה שהם נועדו לבדוק.
FAKE = re.compile(r"TESTKEY|YOUR-|your-|xxxx|XXXX|0000000000")


def tracked() -> list[pathlib.Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [ROOT / p for p in out.split("\0") if p]


def scan_text(text: str, where: str) -> list[str]:
    """סריקת מחרוזת אחת. אותן תבניות, אותו FAKE, מקור אמת אחד."""
    found: list[str] = []
    for label, pat in PATTERNS:
        for m in re.finditer(pat, text):
            if FAKE.search(m.group(0)):
                continue
            line = text[: m.start()].count("\n") + 1
            found.append(f"  {where}:{line} — {label}")
    return found


def main() -> int:
    # ── מצב טקסט: python3 scripts/check-secrets.py --text < file ──
    #
    # 🔴 **נוסף 22.09, לדרישת גיא.** Issues הופך לערוץ התיאום של הצוות,
    # ו-GHAS אינו מופעל על הריפו (נבדק בפועל: "Repository does not have
    # GitHub Advanced Security enabled"). נטע וגיא הכריעו לבנות את זה
    # במקום לרכוש, כי כרגע רק סוכנים כותבים ל-Issues — כלומר הכיסוי
    # החלקי מכסה בפועל את כל התעבורה.
    #
    # ⚠️ **ומה שזה לא:** שום דבר לא מיירט כתיבה ל-Issue. זה כלי שצריך
    # להריץ, ומי שלא יריץ אותו יעקוף אותו. על קובצי הרפו הבדיקה נאכפת
    # (שער ה-QA); על טקסט — היא משמעת.
    if "--text" in sys.argv:
        text = sys.stdin.read()
        hits = scan_text(text, "טקסט")
        if hits:
            print("🔴 נמצא מה שנראה כמו סוד — אין לפרסם:")
            print("\n".join(hits))
            return 1
        print("✅ לא נמצאה תבנית של סוד בטקסט.")
        print("   ⚠️ זה אומר שלא נמצאה תבנית מוכרת — לא שאין דליפה.")
        return 0

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
        hits.extend(scan_text(text, str(f.relative_to(ROOT))))

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
