-- 018_rate_limit.sql
-- דלי הגבלת קצב לנקודת הקצה של המודל.
--
-- ⚠️ זו ההגנה האמיתית על נקודת קצה שעולה כסף. הרשמה עם מייל אינה הגנה
-- מבוטים — בוט פותח תיבת דואר. מה שמגן הוא גג לכל דלי בחלון זמן, בשרת.
--
-- אין כאן כתובות IP. הדלי הוא גיבוב SHA-256 של הכתובת עם מלח, ולכן אי
-- אפשר לקרוא ממנו מי ביקר. זה מספיק להגבלה ולא מספיק למעקב, וזה בדיוק
-- מה שרוצים.

BEGIN;

set local search_path = public, extensions;

create table if not exists api_call (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null,
  created_at timestamptz not null default now()
);

-- השאילתה היחידה היא "כמה בדלי הזה מאז X", ולכן זה האינדקס.
create index if not exists api_call_bucket_time_idx on api_call (bucket, created_at desc);

-- RLS פעיל ובלי אף מדיניות: אין דרך להגיע לטבלה עם מפתח anon, לא לקריאה
-- ולא לכתיבה. רק service_role — כלומר רק Edge Function — נוגע בה.
alter table api_call enable row level security;

comment on table api_call is
  'דלי הגבלת קצב. bucket הוא גיבוב של כתובת עם מלח, לא הכתובת. שורות ישנות מ-24 שעות חסרות ערך וניתן למחוק אותן.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('018_rate_limit.sql', 'sha256:0e6a6814952cf9f9e553c9e2549d0f32',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
