-- 000_auth_shim.sql — **פיגום פיתוח מקומי בלבד. לא מיגרציה.**
--
-- ב-Supabase, סכמת auth ו-auth.uid() קיימות מהרגע הראשון והן חלק
-- מהפלטפורמה. במסד PostgreSQL נקי הן פשוט לא קיימות, ולכן 004 נופלת
-- על auth.users ו-006 על auth.uid().
--
-- הקובץ הזה מייצר את המינימום שהשרשרת צריכה כדי לרוץ מקומית. הוא יושב
-- ב-db/local/ ולא ב-db/migrations/ בכוונה: **אסור להריץ אותו על Supabase**
-- — שם הוא היה מתנגש עם הסכמה האמיתית. סדר הרצה מקומי:
--   local/000_auth_shim.sql → migrations/001..011 → seed/010 → seed/011
--
-- ההשלכה שחשוב להבין: auth.uid() כאן מחזירה NULL כברירת מחדל, ולכן כל
-- מדיניות RLS על נתוני משתמש **חוסמת הכול** בהרצה מקומית. זה לא באג —
-- זה בדיוק מה שאמור לקרות למשתמש אנונימי. לבדיקת RLS מקומית:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- קוראת את אותו GUC ש-Supabase מזריקה מה-JWT, כך שהתנהגות הבדיקה
-- המקומית זהה לייצור.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
