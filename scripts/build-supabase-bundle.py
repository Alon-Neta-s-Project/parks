#!/usr/bin/env python3
"""Concatenate the migrations plus the seeds into one file for Supabase Studio.

Migrations are meant to run in order, one at a time. This exists because they
have to be pasted into a SQL editor by hand, and pasting fourteen files in the
right order is exactly the kind of thing that goes wrong once and is hard to see
afterwards.

Each file keeps its own BEGIN/COMMIT. That is deliberate: one wrapping
transaction would roll the whole thing back and hide which file failed, and a
file with no transaction at all could leave a half-applied migration behind.

⚠️ apps/server/db/local/000_auth_shim.sql is deliberately excluded. On Supabase the auth
schema belongs to the platform; the shim would collide with the real one.

Usage: python3 scripts/build-supabase-bundle.py
"""
import pathlib
import re

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json
OUT = P.DB / "supabase-bundle.sql"

migrations = sorted((P.MIGRATIONS).glob("*.sql"))
seeds = sorted((P.DB_SEED).glob("*.sql"))
verify = P.DB / "verify.sql"

if not migrations:
    raise SystemExit("no migrations found")
if not verify.exists():
    raise SystemExit("apps/server/db/verify.sql is missing — the file needs its verification block")

# A file whose name does not start with its number would run out of order.
for f in migrations:
    if not re.match(r"^\d{3}_", f.name):
        raise SystemExit(f"✗ {f.name} is not numbered — it would run out of order. Rename it.")

RULE = "-- " + "=" * 74
files = [("מיגרציה", f) for f in migrations] + [("seed", f) for f in seeds]
steps = [f"{i}. {kind} {f.name}" for i, (kind, f) in enumerate(files, 1)]

header = f"""{RULE}
-- Park Day Companion — קובץ הקמה למסד הנתונים ב-Supabase
{RULE}
--
-- מה זה
--   כל המיגרציות והנתונים הקבועים, בקובץ אחד, בסדר הנכון. להדביק ל-
--   Supabase Studio ← SQL Editor ← New query, וללחוץ Run פעם אחת.
--   נוצר אוטומטית על ידי scripts/build-supabase-bundle.py. אין לערוך אותו
--   ביד — לערוך את הקבצים ב-apps/server/db/migrations ולהריץ את הסקריפט מחדש.
--
-- הסדר
{chr(10).join('--   ' + s for s in steps)}
--   {len(files) + 1}. בלוק אימות — שאילתה אחת שמדווחת מה נוצר בפועל.
--
-- מה שאין כאן, בכוונה
--   apps/server/db/local/000_auth_shim.sql. הוא מפגם מקומי לסכמת auth. ב-Supabase
--   הסכמה הזו שייכת לפלטפורמה וכבר קיימת, והפיגום היה מתנגש בה.
--
-- אם משהו נופל
--   כל קובץ עטוף ב-BEGIN/COMMIT משלו, ולכן כישלון מגלגל אחורה רק את הקובץ
--   שנפל. אין מצב של מיגרציה חצי-מיושמת.
--
--   1. ב-Supabase Studio, הודעת השגיאה מופיעה למטה. הקובץ שנפל הוא הקובץ
--      שכותרתו האחרונה מופיעה מעל השגיאה — כל בלוק פותח בשורת
--      "-- מיגרציה: NNN_...". לשלוח לי את שם הקובץ ואת נוסח השגיאה.
--   2. כל מה שלפניו כבר בוצע והוא תקין. אין צורך להתחיל מהתחלה.
--   3. אחרי תיקון — להדביק רק את הבלוק שנפל ואת כל מה שאחריו.
--   4. אפשר תמיד להריץ את בלוק האימות שבסוף הקובץ לבדו, כדי לראות מה קיים.
--
--   ⚠️ אין להריץ את הקובץ כולו פעמיים. הרצה שנייה נעצרת מיד ב-001 עם
--   ERROR: type "authority_tier" already exists. זה לא נזק — הבלוק
--   התגלגל אחורה ושום דבר לא השתנה. זו פשוט הדרך של המסד להגיד
--   "אני כבר מותקן". במקרה כזה מריצים רק את בלוק האימות שבסוף.
--
-- ההרחבות
--   ב-Supabase ההרחבות יושבות בסכמת extensions ולא ב-public. מיגרציה 001
--   יוצרת את הסכמה אם היא חסרה, מתקינה לתוכה, ומוסיפה את extensions ל-
--   search_path — כי 002 משתמש ב-gin_trgm_ops ו-003 בטיפוס vector(1024)
--   בלי הסמכת סכמה. ב-Supabase pgcrypto כבר מותקנת שם, ו-
--   create extension if not exists פשוט מדלג עליה.
--
{RULE}

-- search_path מוגדר גם כאן, לפני הכול, כדי שהקובץ יעבוד גם אם מדביקים
-- אותו מאמצע. הוא נקבע שוב לפני כל בלוק, מאותה סיבה.
set search_path = public, extensions;
"""

parts = [header]

for kind, f in files:
    body = f.read_text(encoding="utf-8").strip()
    wrapped = re.search(r"^BEGIN;", body, re.M) and re.search(r"^COMMIT;", body, re.M)
    parts += [
        "",
        RULE,
        f"-- {kind}: {f.name}",
        RULE,
        "",
        "set search_path = public, extensions;",
        "",
    ]
    if wrapped:
        parts.append(body)
    else:
        # No transaction of its own — give it one, so a failure here rolls back
        # cleanly like every other block.
        parts += ["BEGIN;", "", body, "", "COMMIT;"]
    parts.append("")

parts += [
    "",
    RULE,
    "-- אימות — מה נוצר בפועל",
    RULE,
    "",
    verify.read_text(encoding="utf-8").strip(),
    "",
]

OUT.write_text("\n".join(parts) + "\n", encoding="utf-8")
size = OUT.stat().st_size
print(f"{OUT.relative_to(ROOT)}  {size / 1024:.0f} KB")
print(f"  {len(migrations)} migrations: {migrations[0].name} … {migrations[-1].name}")
print(f"  {len(seeds)} seeds: {', '.join(s.name for s in seeds)}")
for kind, f in files:
    body = f.read_text(encoding="utf-8")
    if not (re.search(r"^BEGIN;", body, re.M) and re.search(r"^COMMIT;", body, re.M)):
        print(f"  ⓘ {f.name} has no transaction of its own — wrapped in BEGIN/COMMIT")
print("  verification block appended ✓")
print("  auth shim excluded ✓")
