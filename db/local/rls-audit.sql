-- בדיקת RLS: מה מפתח anon יכול להגיע אליו, ומה לא.
--
-- מפתח ה-anon הוא ציבורי מעצם הגדרתו — הוא נשלח לדפדפן בכל טעינה. מה שמגן
-- על הנתונים הוא RLS בלבד. לכן זו לא בדיקה פורמלית אלא **תנאי הסף** שבלעדיו
-- אסור לפרסם את המפתח.
--
-- ⚠️ שורות ריקות אינן הוכחה. הבדיקה שותלת נתוני משתמש אמיתיים ואז מוודאת
--    ש-anon אינו רואה אותם — אחרת "0 שורות" רק אומר שהטבלה ריקה.
--
--   psql -f db/local/rls-audit.sql

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

-- 1 ─ RLS מופעל על כל טבלה ציבורית?
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- ציפייה: אפס שורות. כל שורה כאן היא טבלה חשופה.

-- 2 ─ נתוני משתמש אמיתיים, כדי שהבדיקה תבדוק חסימה ולא ריקנות
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
insert into profile (id, role) values ('11111111-1111-1111-1111-111111111111','user') on conflict do nothing;
insert into trip (id, user_id, destination_id, name)
  values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','orlando','rls audit')
  on conflict do nothing;
insert into trip_member (trip_id, member_key, role, age, height_cm)
  values ('22222222-2222-2222-2222-222222222222','m1','child',7,118) on conflict do nothing;

-- 3 ─ מה anon רואה בפועל
-- ⚠️ set role, לא set local role. הקובץ רץ מחוץ לטרנזקציה, ושם
--    set local רק מוציא WARNING ולא עושה דבר — הבדיקה הייתה
--    ממשיכה לרוץ כ-postgres, שעוקף RLS, ומדווחת מספרים חסרי משמעות.
set role anon;
select 'experience'  as t, count(*) as anon_sees from experience
union all select 'park', count(*) from park
union all select 'profile', count(*) from profile
union all select 'trip', count(*) from trip
union all select 'trip_member', count(*) from trip_member;
-- ציפייה: תוכן נראה · profile/trip/trip_member = 0, בזמן שהבעלים רואה 1.
reset role;
