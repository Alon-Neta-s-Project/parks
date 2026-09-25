-- 001_extensions_and_taxonomy.sql
-- Park Day Companion — הרחבות ודומיינים
--
-- החלטה: ערכי ה-enum נאכפים ב-CHECK על עמודות text, ולא כטיפוסי enum מקומיים
-- של Postgres. הסיבה: הוספת ערך ל-enum מקומי אפשרית, אבל שינוי שם או הסרה
-- דורשים מיגרציה כואבת. CHECK מאפשר לשנות ערך במיגרציה אחת פשוטה.
-- מקור האמת הוא src/data/taxonomy.ts — הקבצים כאן חייבים להישאר תואמים לו.

BEGIN;

-- ── הרחבות ──────────────────────────────────────────────────────────
-- ב-Supabase ההרחבות יושבות בסכמת extensions ולא ב-public. מקומית הסכמה
-- הזו אינה קיימת, ולכן היא נוצרת כאן. הבדיקה נעשית ב-DO ולא ב-
-- create schema if not exists, כי האחרון בודק הרשאת CREATE על מסד הנתונים
-- לפני שהוא בודק קיום, ולכן היה יכול ליפול על סכמה שכבר קיימת.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    create schema extensions;
  end if;
end
$$;

-- create extension if not exists מתעלם מ-with schema כשההרחבה כבר קיימת
-- (הודעת notice, לא שגיאה). לכן שלוש השורות בטוחות גם ב-Supabase, שבו
-- pgcrypto כבר מותקנת ב-extensions, וגם מקומית, שבו אף אחת לא מותקנת.
create extension if not exists "pgcrypto" with schema extensions;  -- gen_random_uuid()
create extension if not exists "vector"   with schema extensions;  -- pgvector
create extension if not exists "pg_trgm"  with schema extensions;  -- דמיון תווים, פתרון חלקי להיעדר stemmer עברי

-- 002 כותב gin_trgm_ops ו-003 כותב vector(1024) בלי הסמכת סכמה. הם נפתרים
-- רק אם extensions נמצאת ב-search_path. ב-Supabase היא שם כברירת מחדל,
-- אבל ברירת מחדל אינה ערובה — כאן זה מפורש.
-- SET רגיל (לא SET LOCAL) שורד את ה-COMMIT ותקף לשאר הסשן.
set search_path = public, extensions;

-- ── דומיינים משותפים ────────────────────────────────────────────────
-- שימוש ב-domain ולא ב-CHECK חוזר: הגדרה אחת, נאכפת בכל טבלה שמשתמשת בה.

create domain authority_tier as text
  check (value in ('T1','T2','T3','T4','T5'));

create domain volatility_tier as text
  check (value in ('static','seasonal','volatile'));

create domain source_type as text
  check (value in ('official','blog','video','community'));

create domain locale_code as text
  check (value in ('he','en'));

create domain sensitivity_level as text
  check (value in ('none','low','medium','high'));

comment on domain authority_tier is
  'שכבת סמכות. T1/T2 לעולם אינם נסתרים על ידי T3-T5. ראה tim-retrieval-and-memory-architecture.md';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('001_extensions_and_taxonomy.sql', 'sha256:febd46240e77a8da36dea66f41ed0e65',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
