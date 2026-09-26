-- 012_height_none.sql
-- "אין מגבלת גובה" הוא ערך, לא היעדר ערך.
--
-- הסוכן מילא 136 שורות ב-'none' — כלומר **נבדק, ואין מגבלה**. העמודה היא
-- integer, ולכן הערך הזה לא יכול להיכנס, ו-NULL היה מוחק את ההבחנה בין
-- "נבדק ואין" ל"לא נבדק". זו אותה משפחת באגים של gets_wet ושל ארבעת
-- דגלי הרגישות.
--
-- הפתרון: 0 הוא הערך הנכון ולא מספר קסם — הגובה המזערי לעלייה הוא באמת
-- אפס. ⚠️ **אסור להציג אותו כמספר.** ב-UI: "אין מגבלת גובה".

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table experience drop constraint experience_height_requirement_cm_check;
alter table experience add constraint experience_height_requirement_cm_check
  check (height_requirement_cm = 0
      or (height_requirement_cm >= 50 and height_requirement_cm <= 200));

comment on column experience.height_requirement_cm is
  '0 = נבדק, אין מגבלת גובה (מוצג כטקסט, לעולם לא כמספר). NULL = לא נבדק. 50-200 = המגבלה בפועל.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('012_height_none.sql', 'sha256:32705b093ef3b15f4b1dab642ef86294',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
