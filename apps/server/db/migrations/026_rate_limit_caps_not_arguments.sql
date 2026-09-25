-- 026_rate_limit_caps_not_arguments.sql
-- הגגות יוצאים מרשימת הארגומנטים. מי שקוראת שולחת דלי — ותו לא.
--
-- 🔴 **פרצה אמיתית, נמצאה על ידי גיא בקריאת הקוד.**
--
-- check_rate_limit קיבלה את p_window, p_max ו-p_daily_max **מהקוראת**,
-- והיא מוענקת ל-anon. מפתח ה-anon ציבורי בהגדרה — הוא נשלח לכל דפדפן.
-- כלומר כל מי שפותחת את כלי המפתחים יכולה לקרוא ישירות ל-
--   POST /rest/v1/rpc/check_rate_limit
--   {"p_bucket": "...", "p_max": 999999, "p_daily_max": 999999}
-- ולעבור את שני הגגות, בלי לגעת בפונקציית הקצה בכלל.
--
-- ⚠️ **ו-021 חמורה יותר מ-020, לא פחות.** גיא שאל אם אותה בעיה קיימת בה;
-- התשובה היא כן, ובנוסף היא פורצת את הגדר **היומי הגלובלי** — זה שמגן על
-- הארנק ולא רק על חוויית המשתמש. p_daily_max נבדק לפני הכול, וערך
-- שנשלח מבחוץ גובר על rate_limit_daily_cap(). כלומר ההגנה שנבנתה במפורש
-- נגד "יום אחד שאוכל חודש" הייתה ניתנת לביטול בשדה JSON אחד.
--
-- **התיקון:** החתימה מקבלת דלי בלבד. הגגות נקראים מתוך פונקציות במסד,
-- שאינן מקבלות ארגומנטים ואי אפשר להשפיע עליהן דרך ה-RPC.
--
-- ⚠️ הגרסה הישנה **נמחקת** ולא נשארת לצד החדשה. פונקציה עם ארבעה
-- ארגומנטים שנשארת מוענקת היא הפרצה עצמה, ו"תמיכה לאחור" כאן פירושה
-- להשאיר את הדלת פתוחה ליד דלת נעולה.

BEGIN;

set local search_path = public, extensions;

-- ── הגגות, כמקור אמת יחיד שאינו ניתן להשפעה מבחוץ ────────────────────
create or replace function public.rate_limit_window_minutes() returns int
language sql immutable parallel safe
as $$ select 60 $$;

create or replace function public.rate_limit_max_per_window() returns int
language sql immutable parallel safe
as $$ select 20 $$;

comment on function public.rate_limit_window_minutes() is
  'אורך החלון האישי בדקות. ⚠️ פונקציה ולא ארגומנט: ארגומנט מגיע מהקוראת, והקוראת עשויה להיות דפדפן עם מפתח ציבורי.';
comment on function public.rate_limit_max_per_window() is
  'גג הקריאות לדלי בחלון. ⚠️ אינו ניתן לשליחה מבחוץ, מאותה סיבה.';

-- ── החתימה החדשה: דלי בלבד ───────────────────────────────────────────
drop function if exists public.check_rate_limit(text, int, int, int);
drop function if exists public.check_rate_limit(text, int, int);

create or replace function public.check_rate_limit(p_bucket text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  used_bucket int;
  used_global int;
  cap_window  int := public.rate_limit_window_minutes();
  cap_bucket  int := public.rate_limit_max_per_window();
  cap_global  int := public.rate_limit_daily_cap();
begin
  if p_bucket is null or length(p_bucket) < 8 then
    raise exception 'bucket חסר או קצר מדי';
  end if;

  -- הגדר הגלובלי נבדק ראשון. אם כולם חסומים, אין טעם לספור דלי בודד.
  select count(*) into used_global
  from api_call
  where created_at > now() - interval '24 hours';

  if used_global >= cap_global then
    return 'global';
  end if;

  select count(*) into used_bucket
  from api_call
  where bucket = p_bucket
    and created_at > now() - make_interval(mins => cap_window);

  if used_bucket >= cap_bucket then
    return 'user';
  end if;

  insert into api_call (bucket) values (p_bucket);
  delete from api_call where created_at < now() - interval '48 hours';

  return 'ok';
end
$$;

comment on function public.check_rate_limit(text) is
  'גג קריאות. ⚠️ מקבלת דלי בלבד — הגגות עצמם נקראים מפונקציות במסד ואינם ניתנים לשליחה מבחוץ. הגרסה הקודמת קיבלה אותם כארגומנטים והייתה ניתנת לעקיפה עם מפתח ה-anon הציבורי.';

revoke all on function public.check_rate_limit(text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.check_rate_limit(text) to %I', r);
    end if;
  end loop;
end
$$;

-- ── ⚠️ נעצר בקול אם החתימה הישנה שרדה ────────────────────────────────
-- drop אינו מבטיח: אם קיימת גרסה נוספת בחתימה אחרת שלא חשבתי עליה, היא
-- נשארת מוענקת והפרצה נשארת פתוחה — בזמן שהמיגרציה מדווחת הצלחה.
do $$
declare n int;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'check_rate_limit'
    and p.pronargs <> 1;
  if n > 0 then
    raise exception 'נשארו % גרסאות של check_rate_limit עם יותר מארגומנט אחד. הפרצה פתוחה.', n;
  end if;
end
$$;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('026_rate_limit_caps_not_arguments.sql', 'sha256:5e397ca0fc13b9b3bd803a803591173d',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
