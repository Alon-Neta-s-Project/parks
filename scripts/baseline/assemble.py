#!/usr/bin/env python3
"""מרכיב את ה-baseline של dbmate מתוך dump של הסכמה ומההרשאות של הייצור.

  python3 scripts/baseline/assemble.py <schema-dump.sql> <prod-grants.out>

🔴 **ה-baseline מתאר את הייצור, לא את המיגרציות.** O8 מצא ש-48 המיגרציות
בונות מסד פתוח יותר מהייצור: שם ל-anon יש SELECT בלבד, והן נותנות גם
כתיבה. לכן המבנה בא מ-dump של מסד שנבנה מהמיגרציות (הוא זהה לייצור,
אובייקט באובייקט), וההרשאות באות **מהקטלוג של הייצור** — relacl, attacl,
proacl — דרך scripts/baseline/prod-grants.sql, בקריאה בלבד.

⚠️ **למה לא pg_dump מהייצור ישירות:** pg_dump נועל כל טבלה בסכמה, ו-
reviewer_readonly אינו רשאי לקרוא 13 מתוך 24 — גבול הפרטיות שהוגדר לו.

הבדיקה שה-baseline נכון: scripts/baseline/fingerprint.sql על מסד ריק
שנבנה ממנו, מול אותה שאילתה על הייצור. תנאי: אפס הבדלים, מלבד מה שרשום
ב-EXPECTED בכותרת.
"""
import re
import sys

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import P, ROOT  # noqa: E402

VERSION = "20260926000000"
OUT = P.MIGRATIONS / f"{VERSION}_baseline.sql"
ROLES = ["ci_verify", "ci_content", "team1_content", "reviewer_readonly"]
GRANTEES = "public, anon, authenticated, service_role, " + ", ".join(ROLES)

dump_path, grants_path = map(Path, sys.argv[1:3])
dump = dump_path.read_text(encoding="utf-8")
grants = grants_path.read_text(encoding="utf-8").strip()
# ⚠️ פונקציות של פלטפורמת Supabase שקיימות בייצור ואינן שלנו. ההרשאה עליהן
# נכשלה בהרצה הראשונה — "function public.rls_auto_enable() does not exist" —
# ו-dbmate גלגל את כל ה-baseline אחורה.
PLATFORM = ("rls_auto_enable",)
grants = "\n".join(l for l in grants.splitlines() if not any(f"public.{f}(" in l for f in PLATFORM))

# ── ניקוי ה-dump ─────────────────────────────────────────────────────
# \restrict / \unrestrict: פקודות של psql בלבד (pg_dump 17.6). dbmate אינו psql.
dump = re.sub(r"^\\(un)?restrict .*\n", "", dump, flags=re.M)
# public קיימת בכל מסד. CREATE SCHEMA בלי IF NOT EXISTS נופל מיד.
dump = dump.replace("CREATE SCHEMA public;", "CREATE SCHEMA IF NOT EXISTS public;")
# הערות ה-dump ("-- Name: ...; Type: ...") הן רעש של אלפי שורות.
dump = re.sub(r"^--.*\n", "", dump, flags=re.M)
dump = re.sub(r"\n{3,}", "\n\n", dump).strip()

if "\\" in "".join(l for l in dump.splitlines() if l.startswith("\\")):
    raise SystemExit("🔴 נשארה פקודת psql ב-dump")
if not re.search(r"^grant ", grants, re.M) or "ERROR" in grants:
    raise SystemExit("🔴 קובץ ההרשאות ריק או מכיל שגיאה")

roles_sql = "\n".join(
    f"  if not exists (select 1 from pg_roles where rolname = '{r}') then create role {r} nologin; end if;"
    for r in ROLES
)

OUT.write_text(f"""-- ════════════════════════════════════════════════════════════════════
-- baseline — הסכמה של הייצור, כפי שהייתה ב-26.09.2026
-- ════════════════════════════════════════════════════════════════════
--
-- 🔴 **זו המיגרציה הראשונה של dbmate, והיא מחליפה את 48 שקדמו לה** —
-- apps/server/db/migrations-history/, שנשארות שם כתיעוד, חתומות וללא שינוי.
-- הן אינן יכולות לבנות מסד מאפס (O6): 038–040 מעתיקות שורה קיימת לבדיקה,
-- ו-046 נותנת הרשאות לתפקיד שאף מיגרציה אינה יוצרת. הקובץ הזה בונה.
--
-- ⚠️ **נוצר, ולא נכתב ביד** — scripts/baseline/assemble.py:
--   • המבנה: pg_dump --schema-only של מסד שנבנה מ-48 המיגרציות, ועוד
--     המדיניות של צוות 1 (data/deploy/team1-role.txt). זהה לייצור.
--   • ההרשאות: מהקטלוג של הייצור (scripts/baseline/prod-grants.sql),
--     בקריאה בלבד. הן הדוקות מאלה שהמיגרציות נותנות (O8).
--
-- ⛔ **בייצור הקובץ הזה אינו רץ.** הכול כבר קיים שם. במקום זה מסמנים
-- אותו כ"רץ" — data/deploy/dbmate-baseline.txt, פעם אחת, בידי מי שרשאי.
--
-- ── בכוונה לא כאן ──────────────────────────────────────────────────
--   • סיסמאות. התפקידים נוצרים NOLOGIN; בייצור הם קיימים עם סיסמה.
--   • rls_auto_enable — פונקציה של פלטפורמת Supabase, לא שלנו.
--   • המפתח האמיתי ב-tester_key() — כאן הערך המציין (O8: להחליף בייצור).
--   • נתונים. הפארקים ב-apps/server/db/seed/, התוכן ב-content-seed/.
--
-- יעד: Supabase (התפקידים anon, authenticated, service_role והפונקציה
-- auth.uid() קיימים שם). ב-Postgres רגיל — קודם apps/server/db/local/000_auth_shim.sql.

-- migrate:up

-- ── הרחבות — כמו במיגרציה 001 ────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    create schema extensions;
  end if;
end
$$;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "vector"   with schema extensions;
create extension if not exists "pg_trgm"  with schema extensions;

-- ── תפקידים שהמדיניות וההרשאות מפנות אליהם ─────────────────────────
do $$
begin
{roles_sql}
end
$$;

-- ── המבנה ────────────────────────────────────────────────────────────
{dump}

-- ── ההרשאות — כמו בייצור ──────────────────────────────────────────────
-- ⚠️ קודם מבטלים הכול. ב-Supabase ברירות המחדל נותנות ל-anon כתיבה על כל
-- טבלה חדשה — בדיוק הפער ש-O8 מצא. אחרי הביטול נשאר רק מה שיש בייצור.
do $$
declare r record;
begin
  for r in
    select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m','S')
  loop
    execute format('revoke all on %s public.%I from {GRANTEES}',
                   case when r.relkind = 'S' then 'sequence' else 'table' end, r.relname);
  end loop;
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function public.%I(%s) from {GRANTEES}', r.proname, r.args);
  end loop;
end
$$;

{grants}

-- migrate:down
-- ⚠️ אין. baseline אינו מתבטל — ביטול שלו הוא מחיקת המסד.
""", encoding="utf-8")
print(f"✅ {OUT.relative_to(ROOT)} · {len(dump.splitlines())} שורות מבנה · {len(grants.splitlines())} הרשאות")
