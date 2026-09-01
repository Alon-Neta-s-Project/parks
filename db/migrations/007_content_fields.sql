-- 007_content_fields.sql
-- שדות התוכן שנגזרו מהמחקר ומהחלטות איסוף המידע.
-- מחליף כל גרסה מוקדמת של 007. מיישם את park-day-companion-data-spec-v2.md.

-- 1 ─ בחילה: לא רמת חומרה, ולא אזהרת הבטיחות המשפטית של דיסני ---------------
-- הגרסה הקודמת (official_motion_sickness_warning) סימנה בפועל את בלוק
-- האזהרה הכללי שדיסני מדביקה למחלקת מתקנים שלמה, ולכן לא אמרה דבר על
-- הסיכוי לבחילה. השדה הנוכחי נקבע משני מקורות איכותיים שמדרגים בחילה בפועל.
BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table experience drop column if exists sens_motion_sickness;

alter table experience
  add column motion_sickness_warning text
    check (motion_sickness_warning in ('true','false','na'));

comment on column experience.motion_sickness_warning is
  'אינדיקציה אמינה שהמתקן עלול להבחיל. נקבע משני מקורות איכותיים (TouringPlans, Orlando Informer וכו''), לא מאזהרת הבטיחות הכללית. NULL = אין מספיק מידע. השדה יצא מהחרגת ה-T1.';

-- 2 ─ שני מאפיינים שתומכים בקביעת הבחילה --------------------------------------
alter table experience
  add column is_motion_simulator text check (is_motion_simulator in ('true','false','na')),
  add column uses_large_screens_or_3d text check (uses_large_screens_or_3d in ('true','false','na'));

-- 3 ─ מאפיינים מכניים כעמודות, וארבעת-מצבים ------------------------------------
-- big_drops ו-spinning היו מפתחות בתוך intensity_factors. הם נדרשים ב-Export
-- וב-importer, ולכן הופכים לעמודות אמיתיות. boolean מחזיק שלושה מצבים ואינו
-- מבחין בין "לא ידוע" ל"לא רלוונטי" — ולכן text עם CHECK.
alter table experience
  add column big_drops text check (big_drops in ('true','false','na')),
  add column spinning  text check (spinning  in ('true','false','na'));

alter table experience
  alter column air_conditioned type text using (case when air_conditioned is null then null when air_conditioned then 'true' else 'false' end);
alter table experience
  add constraint experience_air_conditioned_check check (air_conditioned in ('true','false','na'));

-- 4 ─ נגישות: שלושה ערכים → חמישה --------------------------------------------
-- כדי לא לאבד הבחנות שקיימות במקורות הרשמיים.
alter table experience drop constraint if exists experience_wheelchair_check;
alter table experience add constraint experience_wheelchair_check check (wheelchair in (
  'remain_in_wheelchair','transfer_ecv_to_wheelchair','transfer_to_ride_vehicle',
  'transfer_wheelchair_then_ride','must_be_ambulatory'));

-- 5 ─ ארבעת דגלי הרגישות יורדים מהיקף שלב 1 -----------------------------------
-- נשארים בסכמה, ריקים, ואינם נחשפים בטקסונומיה, בכלים או בממשק.
comment on column experience.sens_enclosed_dark is 'לא בהיקף שלב 1. לא לאסוף, לא לחשוף.';
comment on column experience.sens_heights       is 'לא בהיקף שלב 1. לא לאסוף, לא לחשוף.';
comment on column experience.sens_loud_sudden   is 'לא בהיקף שלב 1. לא לאסוף, לא לחשוף.';
comment on column experience.sens_strobe        is 'לא בהיקף שלב 1. לא לאסוף, לא לחשוף.';

create index experience_motion_sickness_idx on experience (motion_sickness_warning);

COMMIT;
