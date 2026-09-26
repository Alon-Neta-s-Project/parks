-- 014_gets_wet_na.sql
-- `gets_wet` מקבל ערך רביעי: 'na'.
--
-- למה: המאסטר מבחין בין ארבעה מצבים, והמסד ידע להחזיק רק שלושה.
--   ערך  = נבדק, וזו התשובה
--   'none' = נבדק, אינו מרטיב
--   'na'   = **מופע במה. השאלה לא רלוונטית.**  ← זה מה שנפל
--   NULL   = לא נבדק
--
-- בלי הערך הזה 66 שורות הבידור נטענו כ-NULL, כלומר "לא בדקנו" —
-- וטים היה אומר "אין לי מידע" על שאלה שיש לה תשובה ברורה.
-- זו אותה משפחת באגים, הפעם בשכבת המסד.
--
-- ⚠️ אין ברירת מחדל ואין NOT NULL. NULL נשאר "לא נבדק".

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table experience drop constraint experience_gets_wet_check;
alter table experience add constraint experience_gets_wet_check
  check (gets_wet in ('none','may_get_wet','may_get_soaked','na'));

comment on column experience.gets_wet is
  'ערך = נבדק · ''none'' = נבדק ואינו מרטיב · ''na'' = לא רלוונטי (מופע) · NULL = לא נבדק. ארבעה מצבים, לא שלושה.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('014_gets_wet_na.sql', 'sha256:e1c81fbefd428f39dd19e287bb2c470d',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
