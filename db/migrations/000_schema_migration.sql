-- 000 — יומן המיגרציות: מה רץ על המסד, ומתי (14.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 000 — יומן המיגרציות (14.09)
--
-- 🔴 **המסד אינו יודע אילו מ-45 המיגרציות רצו עליו.** הידע הזה חי
-- בזיכרון של נטע ובהיסטוריית הצ'אט. זה עבד כל עוד הרצנו קובץ ביום;
-- זה נשבר ברגע שקובץ אחד ידולג, יורץ פעמיים, או יתוקן אחרי שכבר רץ.
--
-- ⚠️ **וזו בדיוק התבנית שחוזרת כאן.** "בדיקה שלא רצה אינה בדיקה",
-- "קובץ נגזר מתיישן בשקט" — ובשני המקרים הכשל היה **היעדר רישום**:
-- משהו לא קרה, ואיש לא ידע שהוא לא קרה. מיגרציה היא המקרה השלישי,
-- והיחיד שבו החוסר יושב במסד עצמו.
--
-- ── מפתח לפי שם קובץ, לא לפי מספר ─────────────────────────────────
-- 🔴 יש **שתי** מיגרציות 034: `034_eight_hebrew_names.sql` ו-
-- `034_sensitivities_vocabulary.sql`. מפתח לפי מספר היה מאבד אחת מהן
-- בשקט. השם המלא הוא המזהה.
--
-- ── `evidence` — ומה שהעמודה הזו מודה בו ──────────────────────────
-- 🔴 **ל-44 המיגרציות שכבר רצו אין לנו ראיה.** אי אפשר לשחזר מהמסד
-- אילו מהן רצו: רובן `create or replace` על אותה פונקציה, או עדכוני
-- נתונים בלי אובייקט חדש בכלל. `034_eight_hebrew_names` ו-
-- `035_sources_are_not_public` אינן משאירות טביעה שניתן לזהות.
--
-- ✅ **ולכן העמודה מודה בזה במקום להסתיר.** `assumed` = הנחנו שרץ,
-- איש לא ראה. `observed` = נרשם ברגע שרץ. שורת backfill שהייתה
-- נכתבת כ-`observed` הייתה בדיוק `NOT NULL DEFAULT` על שדה שאיש
-- לא בדק — התבנית שנספרה כאן שבע פעמים.

BEGIN;

set local search_path = public, extensions;

create table if not exists schema_migration (
  filename   text primary key,
  checksum   text not null,          -- sha256 של גוף הקובץ, בלי בלוק הרישום
  applied_at timestamptz not null default now(),
  applied_by text not null check (applied_by in ('sql-editor','ci','backfill')),
  evidence   text not null check (evidence in ('observed','assumed'))
);

comment on table schema_migration is
  'אילו מיגרציות רצו על המסד הזה. מפתח לפי שם קובץ — יש שתי 034.';
comment on column schema_migration.checksum is
  'sha256 של הקובץ בלי בלוק הרישום. שינוי בקובץ שכבר רץ נתפס כסטייה.';
comment on column schema_migration.evidence is
  'observed = נרשם בזמן ההרצה · assumed = הנחת backfill, איש לא ראה.';

-- ⚠️ הטבלה סגורה. היא נכתבת מה-SQL Editor או מ-CI, לא מהאפליקציה.
alter table schema_migration enable row level security;
alter table schema_migration force  row level security;
revoke all on schema_migration from anon, authenticated;

-- ── הרישום עצמו ─────────────────────────────────────────────────────
-- ⚠️ **upsert, ולא insert.** קובץ שרץ פעם שנייה (תיקון, הרצה חוזרת)
-- מעדכן את החתימה ואת הזמן במקום ליפול — ההרצה החוזרת היא עובדה,
-- והרישום צריך לשקף אותה ולא להתעלם ממנה.
create or replace function public.record_migration(
  p_filename text,
  p_checksum text,
  p_by       text default 'sql-editor'
)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into schema_migration (filename, checksum, applied_by, evidence)
  values (p_filename, p_checksum, p_by, 'observed')
  on conflict (filename) do update
    set checksum   = excluded.checksum,
        applied_at = now(),
        applied_by = excluded.applied_by,
        evidence   = 'observed';
$$;

-- 🔴 **בלי grant ל-anon.** האפליקציה לא רושמת מיגרציות. רק SQL Editor
-- ו-CI, ושניהם רצים כבעלים.
revoke all on function public.record_migration(text, text, text) from public;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('000_schema_migration.sql', 'sha256:f95a7fd55860024378d1c9181e81291c',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
