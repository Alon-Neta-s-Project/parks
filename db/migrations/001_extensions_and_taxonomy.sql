-- 001_extensions_and_taxonomy.sql
-- Park Day Companion — הרחבות ודומיינים
--
-- החלטה: ערכי ה-enum נאכפים ב-CHECK על עמודות text, ולא כטיפוסי enum מקומיים
-- של Postgres. הסיבה: הוספת ערך ל-enum מקומי אפשרית, אבל שינוי שם או הסרה
-- דורשים מיגרציה כואבת. CHECK מאפשר לשנות ערך במיגרציה אחת פשוטה.
-- מקור האמת הוא src/data/taxonomy.ts — הקבצים כאן חייבים להישאר תואמים לו.

BEGIN;

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";     -- pgvector
create extension if not exists "pg_trgm";    -- דמיון תווים, פתרון חלקי להיעדר stemmer עברי

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
