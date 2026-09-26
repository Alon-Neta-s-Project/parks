-- RLS audit: what the anon key can reach, and what it cannot.
--
-- The anon key is public by definition — it is sent to the browser on every load. What protects
-- the data is RLS alone. So this is not a formality but **the threshold condition** without which
-- the key must not be published.
--
-- ⚠️ Empty rows are not proof. The test seeds real user data and then verifies
--    that anon does not see it — otherwise "0 rows" only says the table is empty.
--
--   psql -f apps/server/db/local/rls-audit.sql

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

-- 1 ─ Is RLS enabled on every public table?
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- Expected: zero rows. Every row here is an exposed table.

-- 2 ─ Real user data, so the test checks blocking and not emptiness
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
insert into profile (id, role) values ('11111111-1111-1111-1111-111111111111','user') on conflict do nothing;
insert into trip (id, user_id, destination_id, name)
  values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','orlando','rls audit')
  on conflict do nothing;
insert into trip_member (trip_id, member_key, role, age, height_cm)
  values ('22222222-2222-2222-2222-222222222222','m1','child',7,118) on conflict do nothing;

-- 3 ─ What anon actually sees
-- ⚠️ set role, not set local role. The file runs outside a transaction, and there
--    set local only emits a WARNING and does nothing — the test would
--    keep running as postgres, which bypasses RLS, and report meaningless numbers.
set role anon;
select 'experience'  as t, count(*) as anon_sees from experience
union all select 'park', count(*) from park
union all select 'profile', count(*) from profile
union all select 'trip', count(*) from trip
union all select 'trip_member', count(*) from trip_member;
-- Expected: content visible · profile/trip/trip_member = 0, while the owner sees 1.
reset role;

-- 5 ─ Cleanup ─────────────────────────────────────────────────────────
--
-- 🔴 Guy, 07.09: this file writes to the real auth.users and never cleaned up
-- after itself. Locally that is a scaffolding table; **on Supabase it is the users table.** A test
-- that leaves a dummy user in production is not a test — it is a change.
--
-- ⚠️ And the deletion is ordered from leaf to root. trip_member depends on trip, which depends
-- on profile, which depends on auth.users, and deleting in the reverse order fails on a foreign key.
-- (There is on delete cascade, but relying on it means that deleting a real
-- user would silently delete their trips — explicit is better.)
delete from trip_member where trip_id = '22222222-2222-2222-2222-222222222222';
delete from trip         where id      = '22222222-2222-2222-2222-222222222222';
delete from profile      where id      = '11111111-1111-1111-1111-111111111111';
delete from auth.users   where id      = '11111111-1111-1111-1111-111111111111';

-- And verification that the cleanup really happened. ⚠️ A deletion that failed silently leaves exactly
-- the rows it came to remove.
select
  (select count(*) from auth.users   where id      = '11111111-1111-1111-1111-111111111111') as "auth.users (צפוי 0)",
  (select count(*) from profile      where id      = '11111111-1111-1111-1111-111111111111') as "profile (צפוי 0)",
  (select count(*) from trip         where id      = '22222222-2222-2222-2222-222222222222') as "trip (צפוי 0)",
  (select count(*) from trip_member  where trip_id = '22222222-2222-2222-2222-222222222222') as "trip_member (צפוי 0)";
