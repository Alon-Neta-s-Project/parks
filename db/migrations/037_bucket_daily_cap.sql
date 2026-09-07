-- ── 037 · גג יומי לכל דלי, לא רק לכולם יחד ──────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- אושר על ידי גיא, 07.09, לפני פתיחת הכתובת.
--
-- ⚠️ החשבון שלא עלה, ושבגללו זה נכתב:
--
--   גג לחלון: 20 קריאות לכל 60 דקות
--   גג גלובלי: 600 ליום
--
--   20 × 24 שעות = **480 קריאות ליום מדלי אחד** — 80% מהמכסה של כולם.
--
-- שני המספרים סבירים כל אחד לחוד. הם אינם סבירים יחד: **דלי אחד יכול
-- לצרוך 80% מהיום בלי לחרוג משום מגבלה, ושניים סוגרים את היום.**
--
-- ⚠️ ומה שזה אומר בפועל: הגג הגלובלי מגן על הארנק ולא על השירות.
-- משפחה שתיכנס בערב תקבל "נגמרה המכסה" בגלל מישהו אחר.
--
-- ── ולמה זה לא מחליף את auth.uid() ולא מוחלף בו ─────────────────────
--
-- גיא הציע לקשור את הגג ל-auth.uid() במקום לדלי מהלקוח. הכיוון נכון
-- והוא סוגר את ה-80% לגמרי — **אבל אינו מחליף את זה**:
--
--   · מי שיכול לפתוח חשבונות חופשי מקבל מכסה טרייה לכל חשבון (Sybil)
--   · ההרשמה עצמה, איפוס סיסמה, וכל מה שלפני הזדהות — אין להם uid
--
-- כלומר צריך את שניהם: **לפי כתובת מגן על הכניסה, לפי משתמש מגן על
-- השימוש.** וכאן נבנה הראשון, כי מסך ההרשמה עוד לא קיים ואין uid
-- לקשור אליו. auth.uid() מצטרף כשההרשמה עולה (סוכם עם גיא, 07.09).

BEGIN;

set local search_path = public, extensions;

-- ⚠️ פונקציה ולא ארגומנט, בדיוק כמו שאר הגגות ומאותה סיבה: ארגומנט
-- מגיע מהקוראת, והקוראת היא דפדפן עם מפתח ציבורי. זה הלקח מ-021.
create or replace function public.rate_limit_bucket_daily_cap() returns int
language sql immutable parallel safe
as $$ select 60 $$;

comment on function public.rate_limit_bucket_daily_cap() is
  'גג יומי לדלי בודד. ⚠️ 60 ולא 480: הגג הגלובלי הוא 600, ודלי אחד אינו אמור לצרוך יותר מ-10% מהיום של כולם.';

create or replace function public.check_rate_limit(p_bucket text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  used_bucket     int;
  used_bucket_day int;
  used_global     int;
  cap_window      int := public.rate_limit_window_minutes();
  cap_bucket      int := public.rate_limit_max_per_window();
  cap_bucket_day  int := public.rate_limit_bucket_daily_cap();
  cap_global      int := public.rate_limit_daily_cap();
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

  -- ⚠️ החדש: אותו דלי, אבל על פני יממה. בלעדיו החלון לבדו מתיר 480
  -- ליום, וזו כל הבעיה.
  --
  -- ⚠️ ומוחזר 'user' ולא ערך חדש, בכוונה. הקוראת — הפונקציה של טים —
  -- מכירה שלושה ערכים, וערך רביעי היה נופל אצלה לענף ברירת המחדל
  -- ומוצג למשתמש כתקלה כללית במקום כ"הגעת למכסה". שינוי אוצר המילים
  -- מחייב שינוי בשני הצדדים, וזה בדיוק סוג הפער שנתפס כאן שוב ושוב.
  select count(*) into used_bucket_day
  from api_call
  where bucket = p_bucket
    and created_at > now() - interval '24 hours';

  if used_bucket_day >= cap_bucket_day then
    return 'user';
  end if;

  insert into api_call (bucket) values (p_bucket);
  delete from api_call where created_at < now() - interval '48 hours';

  return 'ok';
end
$$;

comment on function public.check_rate_limit(text) is
  'גג קריאות: חלון לדלי · יממה לדלי · יממה גלובלי. ⚠️ שלושתם נקראים מפונקציות במסד ואינם ניתנים לשליחה מבחוץ.';

-- ⚠️ ההרשאות נכתבות מחדש. `create or replace` שומר אותן, אבל הסתמכות
-- על כך פירושה שמיגרציה עתידית שתעשה drop+create תשאיר את הפונקציה
-- בלי גישה — וטים ייפול על 403 בלי שאיש יבין למה.
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

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את ההתנהגות מקצה לקצה, ולא את קיום הפונקציה. הגג הקודם
-- (021) נראה מותקן וניתן היה לעקוף אותו מבחוץ; הלקח היה שהמדידה
-- חייבת להיות "מה קורה בקריאה ה-N", לא "האם הפונקציה שם".

BEGIN;

set local search_path = public, extensions;

do $$
declare
  b       text := 'probe-037-' || gen_random_uuid()::text;
  cap_day int  := public.rate_limit_bucket_daily_cap();
  cap_win int  := public.rate_limit_max_per_window();
  answer  text;
  allowed int  := 0;
begin
  -- ⚠️ הבדיקה מזייפת זמן: קריאות נכתבות ישירות ל-api_call עם חותמות
  -- מפוזרות על פני היממה, כדי לעקוף את גג החלון ולהגיע לגג היומי.
  -- בלי זה החלון היה חוסם ראשון והגג היומי לא היה נבדק כלל.
  insert into api_call (bucket, created_at)
  select b, now() - make_interval(mins => 90 + g * 20)
    from generate_series(1, cap_day - 1) g;

  -- הקריאה שמשלימה למכסה חייבת לעבור
  answer := public.check_rate_limit(b);
  if answer <> 'ok' then
    raise exception '❌ קריאה % נחסמה (%), והיא עדיין בתוך המכסה היומית של %.',
      cap_day, answer, cap_day;
  end if;

  -- והבאה אחריה חייבת להיחסם
  answer := public.check_rate_limit(b);
  if answer <> 'user' then
    raise exception '❌ קריאה % החזירה "%" ולא "user". הגג היומי לדלי אינו נאכף.',
      cap_day + 1, answer;
  end if;

  -- ⚠️ ודלי אחר אינו מושפע. גג שחוסם את כולם בגלל אחד הוא באג ולא הגנה.
  answer := public.check_rate_limit('probe-037-other-' || gen_random_uuid()::text);
  if answer <> 'ok' then
    raise exception '❌ דלי אחר נחסם ("%"). הגג דולף בין דליים.', answer;
  end if;

  delete from api_call where bucket like 'probe-037-%';

  raise notice '✅ תקין — דלי נחסם אחרי % ליממה, ודלי אחר אינו מושפע.', cap_day;
end $$;

COMMIT;

-- ── מה שרואים עכשיו ──────────────────────────────────────────────────
select public.rate_limit_daily_cap()        as "גג יומי גלובלי",
       public.rate_limit_bucket_daily_cap() as "גג יומי לדלי",
       public.rate_limit_max_per_window()   as "גג בחלון",
       public.rate_limit_window_minutes()   as "אורך החלון",
       round(100.0 * public.rate_limit_bucket_daily_cap()
                   / public.rate_limit_daily_cap()) || '%' as "מה דלי אחד יכול לצרוך";
