-- 021_global_daily_cap.sql
-- גדר יומי גלובלי, בנוסף לגדר לכל מבקרת.
--
-- ⚠️ הבעיה שזה פותר: הגדר הקיים מבוסס על דלי לכל כתובת. מאה מבקרות =
-- מאה דליים = פי מאה קריאות. הוא מגן מפני התעללות, לא מפני הצלחה.
--
-- ובלי גדר גלובלי, מה שעוצר הוא תקרת החיוב של גוגל — וכשהיא נוגעת, טים
-- נכבה לכולן עד סוף החודש, בלי הודעה ובלי שנדע. יום אחד יכול לאכול חודש.
--
-- המספרים, מחושבים ולא מנוחשים:
--   עלות הודעה ≈ 0.023 ש"ח (קלט 6 ש"ח/מיליון · פלט 36 ש"ח/מיליון,
--   והפלט הוא 94% מהעלות).
--   600 ליום = כ-14 ש"ח ליום במקרה הגרוע — כלומר יום בריחה אחד אינו
--   מוחק את החודש, ויום דמו מלא (כ-550) עדיין עובר.
--
-- ⚠️ ההחזרה משתנה מבוליאני לטקסט, כדי שנקודת הקצה תדע **איזה** גדר נגע
-- ותאמר למשתמשת את הדבר הנכון. "נסי בעוד שעה" ו"נסי מחר" אינם אותה
-- הודעה, וסתימה גורפת היא בדיוק סוג הכשל השקט שנמנע ממנו.

BEGIN;

set local search_path = public, extensions;

drop function if exists public.check_rate_limit(text, int, int);

-- מקור אמת אחד לגובה הגדר. המספר הופיע קודם גם בברירת המחדל של הפונקציה
-- וגם בתצוגה — שני מספרים שאפשר לשנות אחד מהם ולא את השני, וזו בדיוק
-- הצורה שבה גדר מפסיקה להיות מה שכתוב עליה.
create or replace function public.rate_limit_daily_cap() returns int
language sql immutable parallel safe
as $$ select 600 $$;

create or replace function public.check_rate_limit(
  p_bucket     text,
  p_window     int default 60,    -- דקות, לגדר האישי
  p_max        int default 20,    -- קריאות לחלון, לכל דלי
  p_daily_max  int default null   -- קריאות ליום, לכולם ביחד; null = הגדר הרשמי
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  used_bucket int;
  used_global int;
  cap_global  int := coalesce(p_daily_max, public.rate_limit_daily_cap());
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
    and created_at > now() - make_interval(mins => p_window);

  if used_bucket >= p_max then
    return 'user';
  end if;

  insert into api_call (bucket) values (p_bucket);

  -- שורות ישנות מיומיים חסרות ערך: שתי הספירות מסננות אותן ממילא.
  delete from api_call where created_at < now() - interval '48 hours';

  return 'ok';
end
$$;

revoke all on function public.check_rate_limit(text, int, int, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.check_rate_limit(text, int, int, int) to %I', r);
    end if;
  end loop;
end
$$;

-- ── כמה נשאל היום, ומה נשאר ─────────────────────────────────────────
-- הבעיה עם גדרות היא שאיש אינו יודע כמה קרוב הוא אליהן. זה נועד להיקרא
-- לפני הדמו, לא אחריו.
create or replace view usage_today as
select
  count(*)                                   as "שאלות ב-24 שעות",
  public.rate_limit_daily_cap() - count(*)   as "נשאר עד הגדר",
  round(count(*) * 0.023, 2)                 as "עלות מוערכת בשקלים",
  count(distinct bucket)                     as "מבקרות שונות"
from api_call
where created_at > now() - interval '24 hours';

-- התצוגה רצה בהרשאות הבעלים ולכן עוקפת את ה-RLS של api_call. היא נועדה
-- לעיניים שלנו לפני דמו, לא לדפדפן — ולכן היא נסגרת במפורש.
revoke all on table usage_today from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table usage_today from %I', r);
    end if;
  end loop;
end
$$;

comment on view usage_today is
  'כמה שאלות נשאלו ב-24 השעות האחרונות, וכמה נשאר עד הגדר. העלות מוערכת לפי 0.023 ש"ח להודעה.';

COMMIT;
