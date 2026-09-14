#!/usr/bin/env python3
"""חותם כל מיגרציה ברישום עצמי, ומשכפל אותה לקובץ שנטע מריצה.

🔴 **קיים כי המסד לא ידע מה רץ עליו.** 45 מיגרציות הורצו בהדבקה ידנית,
והידע אילו מהן רצו חי בזיכרון ובהיסטוריית צ'אט. הקובץ הזה מוסיף לכל
מיגרציה שורה אחת בסוף, שרושמת את עצמה ב-`schema_migration` ברגע שהיא
רצה — ולכן הרישום אינו משימה שמישהו צריך לזכור.

⚠️ **החתימה מחושבת על הגוף בלבד**, כלומר על כל מה שמעל בלוק הרישום.
אחרת כל חישוב היה משנה את מה שהוא מודד.

⚠️ **וקובץ הפריסה נגזר, ולא מודבק פעמיים.** `data/deploy/044-turn-log.txt`
היה עותק ידני של המיגרציה, וזו בדיוק התבנית שהפילה את קובצי הזרע:
תיקון נערך במקור, והעותק המשיך לחיות. כאן הוא נבנה, ו---check נופל על
כל פער.

  python3 scripts/migration-log.py --check   # שער ה-QA
  python3 scripts/migration-log.py --write   # לעדכן
  python3 scripts/migration-log.py --ship 044_turn_log.sql   # לשלוח לנטע
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIG = ROOT / "db" / "migrations"
DEPLOY = ROOT / "data" / "deploy"

OPEN, CLOSE = "-- <migration-log>", "-- </migration-log>"
BLOCK = re.compile(rf"\n*{re.escape(OPEN)}.*?{re.escape(CLOSE)}\n*", re.S)


def body(text: str) -> str:
    """הקובץ בלי בלוק הרישום — זה מה שנחתם."""
    return BLOCK.sub("\n", text).rstrip() + "\n"


def trailer(name: str, digest: str) -> str:
    return (
        f"{OPEN}\n"
        "-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.\n"
        "-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.\n"
        f"select public.record_migration('{name}', '{digest}',\n"
        "  coalesce(current_setting('app.migration_source', true), 'sql-editor'));\n"
        f"{CLOSE}\n"
    )


def digest_of(path: pathlib.Path) -> str:
    b = body(path.read_text(encoding="utf-8"))
    return "sha256:" + hashlib.sha256(b.encode("utf-8")).hexdigest()[:32]


def stamped(path: pathlib.Path) -> str:
    b = body(path.read_text(encoding="utf-8"))
    return b + "\n" + trailer(path.name, digest_of(path))


def deploy_name(name: str) -> str:
    return name.replace("_", "-").removesuffix(".sql") + ".txt"


BACKFILL = """-- backfill — לסמן את המיגרציות שכבר רצו (14.09.2026)
-- ─────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase ← SQL Editor
-- שם השאילתה: backfill — מיגרציות שכבר רצו (14.09)
-- ⚠️ להריץ **אחרי** 000, ופעם אחת בלבד.
--
-- 🔴 **כל השורות כאן הן `assumed`, וזו אינה ענוות.**
-- אי אפשר לשחזר מהמסד אילו מהן רצו — רובן `create or replace`
-- על אותה פונקציה, או עדכוני נתונים בלי אובייקט חדש בכלל.
-- לכתוב אותן כ-`observed` היה להצהיר שמישהו בדק, ואיש לא בדק.
--
-- ✅ **מהמיגרציה שאחרי {upto} והלאה הרישום אמיתי.** כל מיגרציה נושאת בסופה
-- שורת רישום שרצה איתה, ולכן נרשמת כ-`observed`.

BEGIN;

insert into schema_migration (filename, checksum, applied_by, evidence)
values
{rows}
on conflict (filename) do nothing;

-- אימות
select evidence as "ראיה", count(*) as "מיגרציות"
  from schema_migration group by evidence order by 1;

COMMIT;
"""


def main() -> int:
    args = sys.argv[1:]
    if "--ship" in args:
        name = args[args.index("--ship") + 1]
        src = MIG / name
        if not src.exists():
            print(f"✗ אין מיגרציה בשם {name}")
            return 1
        (DEPLOY / deploy_name(name)).write_text(stamped(src), encoding="utf-8")
        print(f"✅ {deploy_name(name)}")
        return 0

    if "--backfill" in args:
        upto = args[args.index("--backfill") + 1]
        rows = [
            f"  ('{f.name}', '{digest_of(f)}', 'backfill', 'assumed')"
            for f in sorted(MIG.glob("*.sql"))
            if f.name[:3] != "000" and f.name[:3] <= upto
        ]
        out = DEPLOY / "backfill-migration-log.txt"
        out.write_text(BACKFILL.format(upto=upto, n=len(rows), rows=",\n".join(rows)), encoding="utf-8")
        print(f"✅ {out.name} · {len(rows)} שורות")
        return 0

    check = "--check" in args
    bad = []
    for src in sorted(MIG.glob("*.sql")):
        want = stamped(src)
        if src.read_text(encoding="utf-8") != want:
            bad.append(f"{src.name} — בלוק הרישום חסר או לא מעודכן")
            if not check:
                src.write_text(want, encoding="utf-8")
        # קובץ הפריסה נגזר, אבל רק למיגרציות שכבר נשלחו לנטע.
        out = DEPLOY / deploy_name(src.name)
        if out.exists() and out.read_text(encoding="utf-8") != want:
            bad.append(f"{out.name} — קובץ הפריסה אינו זהה למיגרציה")
            if not check:
                out.write_text(want, encoding="utf-8")

    if bad and check:
        print("✗ יומן המיגרציות אינו מסונכרן:")
        for b in bad:
            print(f"   · {b}")
        print("   python3 scripts/migration-log.py --write")
        return 1
    print(f"✅ {len(list(MIG.glob('*.sql')))} מיגרציות חתומות" + ("" if check else f" · {len(bad)} עודכנו"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
