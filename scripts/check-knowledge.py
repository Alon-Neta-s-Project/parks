#!/usr/bin/env python3
"""בדיקת מסמכי הידע לפני ingest — לפי חוקי v2.

⚠️ v2 סגר את שני הפערים של v1 — 12 שדות ב-53 מתוך 53, ו-source_url_2
מוזג לרשימה. נשארו שתי בעיות שאף אחד לא חיפש: **תשעה מסמכים נושאים
URL בתוך הגוף**, ו-**12 הערות עריכה בסוגריים מרובעים בשמונה מסמכים**.
שתיהן דולפות למסך דרך אותו נתיב — הגוף נחתך לצ'אנקים ונשלף לתוך תשובה.
v3 מתקן את שתיהן; עד שהוא ייכנס הבדיקה נכשלת בכוונה. בדיקה שמותאמת
לתוכן הקיים כדי "לעבור" אינה בדיקה.


⚠️ למה סקריפט ולא עין: 17 מסמכים נוספים (נושא 16) ייכנסו לאותה תיקייה,
ומסמך שאחד השדות שלו חסר או מחוץ לאוצר המילים ייכנס לאינדקס בשקט ויישלף
כאילו הוא תשובה. הבדיקה נכשלת בקול, ולפני הטעינה ולא אחריה.

הרצה:  python3 scripts/check-knowledge.py
"""
import re
import sys
from collections import Counter
from pathlib import Path

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json
DIR = P.KNOWLEDGE

# אוצרי המילים — זהים ל-domain-ים ב-001 ול-check ב-003. ערך שאינו כאן
# עוצר את המסמך ולא נופל לברירת מחדל.
VOCAB = {
    "doc_type": {"guide", "attraction_note", "faq", "policy", "tip", "community_qa"},
    "authority_tier": {"T1", "T2", "T3", "T4", "T5"},
    "volatility": {"static", "seasonal", "volatile"},
    "scope_resort": {"wdw", "uor"},
    "product_family": {
        # מקבוצה ב' — הכרטיסים, שדרשו ניתוב
        "queue_access", "admission", "park_hopping", "hotel_benefit",
        "eligibility_program", "event_ticket",
        # חמישה שנוספו לקבוצה א' (פולה, v2)
        "characters", "guest_services", "photo", "weather", "park_logistics",
    },
    "audience": {
        "international_guest", "hotel_guest", "annual_passholder",
        "florida_resident", "military",
    },
    "v1_priority": {"core", "appendix"},
    # ⚠️ N/A הוא ערך ולא היעדרו. שלושת המצבים באותה שכבה: ריק = לא בדקנו,
    # N/A = השאלה לא קיימת (לעגלות ולגשם אין סוג רכישה), וכל השאר = תשובה.
    "purchase_type": {
        "ticket", "paid_addon", "included_benefit", "reservation_mechanism", "N/A",
    },
}
# ⚠️ 12 שדות ב-53 מתוך 53, אפס חריגים (פולה, v2). קבוצה א' מולאה: שדה
# שמסננים עליו וחסר בו ערך אינו חוסר מידע אלא **הדרה שקטה** — 14 המסמכים
# שהיו חסרים audience הם דמויות, גשם, עגלות והחלפת הורים, כלומר בדיוק מה
# שמשפחה שואלת.
REQUIRED = ["id", "title", "doc_type", "authority_tier", "scope_resort",
            "volatility", "source_url", "last_verified",
            "product_family", "audience", "v1_priority", "purchase_type"]
OPTIONAL: list[str] = []
# ⛔ source_url_2 בוטל ואינו מתקבל כתמיכה לאחור. שתי דרכים לאותו דבר הן
# שני מקורות אמת — הכלל שכבר תפס אותנו שבע פעמים. הוא נשבר ממילא ברגע
# שיש מקור שלישי, ו-source_url_3 אינו פתרון. source_url הוא **רשימה**
# מופרדת בפסיק, שגדלה בלי לשנות סכמה.
RETIRED = {"source_url_2": "מוזג ל-source_url כרשימה מופרדת בפסיק (v2)"}

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
    sources = [0]

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
            if field in RETIRED:
                fail(name, f"{field} בוטל — {RETIRED[field]}")
            elif field not in REQUIRED and field not in OPTIONAL:
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

        # ⚠️ source_url הוא רשימה גם כשיש בה אחד. כל איבר חייב להיות URL —
        # פסיק שנשאר בסוף או ערך ריק בין שני פסיקים ייכנס כמקור ריק.
        for url in [u.strip() for u in fm.get("source_url", "").split(",")]:
            if not url.startswith("http"):
                fail(name, f"source_url מכיל איבר שאינו כתובת: {url!r}")

        if fm.get("last_verified") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fm["last_verified"]):
            fail(name, f"last_verified={fm['last_verified']!r} אינו תאריך")

        # ⚠️ מסמך קצר מדי הוא בדרך כלל כותרת בלי גוף — הוא ייכנס לאינדקס
        # ויתחרה על אותה שליפה עם מסמך שיש בו תשובה.
        if len(body) < 200:
            fail(name, f"גוף קצר מדי ({len(body)} תווים)")

        # ⚠️ **אין מקורות בגוף** (CLAUDE.md: "אין מקורות בממשק").
        # הגוף הוא מה שנחתך לצ'אנקים ונשלף לתוך תשובה של טים. URL שיושב בו
        # יגיע למסך כחלק מהתשובה, וזו בדיוק ההצמדה שהכלל אוסר — טים מדווח
        # ערך ולעולם אינו מייחס אותו למקור רשמי. המקומות למקורות הם
        # source_url, שהוא רשימה, ובדיוק לשם העביר v2 את שבעת מסמכי ה-T3.
        for url in re.findall(r"https?://\S+", body):
            fail(name, f"URL בגוף המסמך: {url[:60]}")

        # ⚠️ הערת עריכה בגוף היא **תוכן** מרגע שהמסמך נטען: היא נחתכת
        # לצ'אנק, נשלפת, ומגיעה למסך בתוך תשובה של טים. "[לבדוק: האם קיימת
        # מדיניות רשמית...]" ייקרא כתשובה, לא כפתק לעצמנו — ומשפחה שתקרא
        # אותו לא תדע שהיא קוראת TODO. ב-v2 היו 12 כאלה בשמונה מסמכים.
        #
        # הכלל רחב מ-"[לבדוק]" בכוונה: כל סוגריים מרובעים עם עברית. ניסוח
        # חדש של אותה הערה ("[לאמת]", "[לבדוק מול פולה]") היה חומק מבדיקה
        # שמחפשת מחרוזת אחת, וזה בדיוק מה שקורה כשנכנסים 17 מסמכים חדשים.
        # קישור Markdown אינו נפגע — URL בגוף אסור ממילא.
        for note in re.findall(r"\[[^\]]*[\u0590-\u05ff][^\]]*\]", body):
            fail(name, f"הערת עריכה בגוף: {note[:60]}")

        # ⚠️ דוח אינו ידע. מסמך שמתאר את המאגר יישלף כאילו הוא תשובה.
        if re.search(r"דוח כיסוי|coverage report", body[:400], re.I):
            fail(name, "נראה כמו דוח ולא כמו ידע")

        if fm.get("authority_tier"):
            tiers[fm["authority_tier"]] += 1
        sources[0] += len([u for u in fm.get("source_url", "").split(",") if u.strip()])

    print(f"{len(files)} מסמכים · " + " · ".join(f"{k} {v}" for k, v in sorted(tiers.items()))
          + f" · {sources[0]} קישורים")
    if problems:
        print(f"\n❌ {len(problems)} בעיות:")
        for p in problems:
            print(f"   {p}")
        return 1
    print("✅ הכול תקין")
    return 0


if __name__ == "__main__":
    sys.exit(main())
