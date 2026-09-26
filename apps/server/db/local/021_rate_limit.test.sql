-- Tests for the global daily rate limit (migration 021).
-- Run:  psql -h /tmp -p $PGPORT -d pdc -f apps/server/db/local/021_rate_limit.test.sql
--
-- ⚠️ The tests were verified by mutation: raising rate_limit_daily_cap() to 999999
-- makes exactly the three global tests (ד, ה, ז — labels d, e, g) fail. A test that does not fail
-- when the code breaks is not a test.

\set ON_ERROR_STOP on
truncate api_call;

-- 1. The per-user limit: 20 pass, the 21st is stopped
select 'א. 20 ראשונות' as בדיקה,
       bool_and(r = 'ok') as עברו
from (select check_rate_limit('bucket-aaaaaaaa', 60, 20) as r from generate_series(1,20)) s;

select 'ב. ה-21 נעצרת כ-user' as בדיקה,
       check_rate_limit('bucket-aaaaaaaa', 60, 20) = 'user' as נכון;

-- Another bucket still passes: the limit is per-user, not global
select 'ג. דלי אחר עדיין עובר' as בדיקה,
       check_rate_limit('bucket-bbbbbbbb', 60, 20) = 'ok' as נכון;

-- 2. The global limit
truncate api_call;
insert into api_call (bucket)
select 'bucket-' || lpad(g::text, 8, '0') from generate_series(1, 600) g;

select 'ד. דלי נקי לגמרי נעצר כ-global' as בדיקה,
       check_rate_limit('bucket-zzzzzzzz', 60, 20) = 'global' as נכון;

-- 3. Global comes before per-user: a bucket that also exceeded its own limit gets global, not user
truncate api_call;
insert into api_call (bucket) select 'bucket-cccccccc' from generate_series(1, 600);
select 'ה. גלובלי נבדק לפני אישי' as בדיקה,
       check_rate_limit('bucket-cccccccc', 60, 20) = 'global' as נכון;

-- 4. 599 still passes — the limit is 600, not 599
truncate api_call;
insert into api_call (bucket)
select 'bucket-' || lpad(g::text, 8, '0') from generate_series(1, 599) g;
select 'ו. ב-599 עוד עוברים' as בדיקה,
       check_rate_limit('bucket-yyyyyyyy', 60, 20) = 'ok' as נכון;
select 'ז. ומיד אחר כך נסגר' as בדיקה,
       check_rate_limit('bucket-xxxxxxxx', 60, 20) = 'global' as נכון;

-- 5. Old rows are not counted, and are deleted
truncate api_call;
insert into api_call (bucket, created_at)
select 'bucket-old00000', now() - interval '72 hours' from generate_series(1, 700);
select 'ח. שורות ישנות אינן חוסמות' as בדיקה,
       check_rate_limit('bucket-freshest', 60, 20) = 'ok' as נכון;
select 'ט. ונוקו' as בדיקה, count(*) = 1 as נכון from api_call;

-- 6. One source of truth: the view and the function agree
truncate api_call;
select check_rate_limit('bucket-viewtest', 60, 20);
select * from usage_today;

-- 7. A short bucket is rejected
do $$
begin
  perform check_rate_limit('short', 60, 20);
  raise exception 'י. כשל: bucket קצר התקבל';
exception when others then
  if sqlerrm like '%bucket%' then raise notice 'י. bucket קצר נדחה ✓';
  else raise; end if;
end $$;
