-- ── 040 · ארבעת דגלי הרגישות עוברים לארבעה מצבים ────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת, **אחרי 039**.
-- אושר על ידי פולה דרך פיליפ, 08.09.
--
-- 🔴 הבאג, וההופעה השלישית שלו:
--
-- המאסטר כותב `N/A` על 77 שורות Entertainment — מופעים, מצעדים ומפגשי
-- דמויות — ומשמעותו **"השאלה אינה חלה"**. `boolean` מחזיק שלושה מצבים
-- בלבד, ולכן `N/A` כווץ ל-`NULL`, שאצלנו פירושו **"לא נבדק"**.
--
-- ⚠️ שתי אמירות שונות לגמרי נשמעו זהות. ומה שזה עשה בפועל: משפחה שביקשה
-- להימנע מגבהים **איבדה את כל 77 המופעים מהתוצאות** — בדיוק מה שהכי
-- מתאים לה — וקיבלה הודעה שהנתון לא נבדק, בעוד שהוא כן.
--
-- ⚠️ ולא היה כאן מיפוי חסר. `boolFlag` לא "שכח" למפות — **לא היה ל-na
-- לאן ללכת.** טיפוס היעד לא הכיר את הערך, בשלוש השכבות: סכימה, ייבוא,
-- ועמודה במסד.
--
-- ── והופעה רביעית כבר גלויה ─────────────────────────────────────────
--
-- ארבע עמודות מספריות נושאות N/A היום: inversions (222) · max_speed_kmh
-- (219) · duration_minutes (88) · opened_year (10). למופע אין מהירות
-- מרבית — זה "לא חל", לא "לא נמדד". מנגנון למספרים שונה מזה של דגל,
-- והוא סבב נפרד; `src/lib/__tests__/na-columns.test.ts` מחזיק אותן
-- ברשימה מפורשת כדי שההיעדר ייראה ולא ייבלע.

BEGIN;

set local search_path = public, extensions;

-- ⚠️ ההמרה מפורשת ואינה נשענת על cast אוטומטי. `true::text` ב-Postgres
-- הוא 't' ולא 'true', ו-cast שקט היה ממלא את העמודה בערכים שאינם
-- באוצר המילים — ואז ה-CHECK היה נכשל על נתונים תקינים.
do $$
declare c text;
begin
  foreach c in array array['sens_enclosed_dark','sens_heights','sens_loud_sudden','sens_strobe'] loop
    if (select data_type from information_schema.columns
         where table_name = 'experience' and column_name = c) = 'boolean' then
      execute format(
        'alter table experience alter column %I type text using
           case when %I is true then ''true'' when %I is false then ''false'' end', c, c, c);
    end if;
    execute format('alter table experience drop constraint if exists experience_%s_quad', c);
    execute format(
      'alter table experience add constraint experience_%s_quad
         check (%I is null or %I in (''true'',''false'',''na''))', c, c, c);
  end loop;
end $$;

comment on column experience.sens_heights is
  'רגישות לגבהים. ⚠️ ארבעה מצבים: true/false/na/null. "na" = השאלה אינה חלה (מופע), ואינו "לא נבדק". מיגרציה 040.';

create or replace function public.find_experiences(
  p_name        text default null,
  p_park        text default null,
  p_height_cm   int  default null,
  p_limit       int  default 8
)
returns table (
  id            text,
  name          text,
  name_he       text,
  park          text,
  land          text,
  category      text,
  status        text,
  status_note   text,
  intensity     int,
  height_cm     int,
  max_height_cm int,
  gets_wet      text,
  wheelchair    text,
  motion_sickness text,
  sens_dark     text,
  sens_heights  text,
  sens_loud     text,
  sens_strobe   text,
  skip_line     text,
  last_verified date,
  fits          boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with tok as (
    -- ⚠️ פיצול על רווח בלבד, וקיצוץ פיסוק מהקצוות ב-btrim.
    -- **בכוונה בלי מחלקות תווים כמו [:alnum:]** — הן תלויות ב-locale,
    -- והמסד המקומי (C) והמסד בסופאבייס (UTF-8) היו מתנהגים אחרת.
    -- זה הכשל שכבר תפס אותי שלוש פעמים (search_path, format_type),
    -- ואות עברית היא בדיוק סוג התו שנופל בין ההגדרות.
    select distinct btrim(t, ',.;:!?()"''[]{}<>/-') as t
    from regexp_split_to_table(coalesce(p_name, ''), '[[:space:]]+') t
  ),
  words as (
    -- שתי אותיות אינן מילה מזהה; הן שאריות של מילות קישור.
    select t from tok where length(t) >= 3
  ),
  -- ⚠️ **תחיליות עבריות.** "לספייס" ו-"באקספדישן" הן אותה מילה עם אות
  -- אחת מלפנים, ו-ilike על מחרוזת אינו יודע את זה. בלי זה שאלה טבעית
  -- ("כדאי ללכת לספייס מאונטיין") מחזירה אפס על מתקן שקיים.
  -- הקיצוץ מוגבל למילים בנות 5 ומעלה, כדי שלא ניצור מילים קצרות
  -- ומקריות שיתאימו לחצי מהטבלה.
  forms as (
    select t as t, t as root from words
    union
    select t, substr(t, 2) from words
    where length(t) >= 5 and substr(t, 1, 1) in ('ל','ב','ה','מ','ש','ו','כ')
  ),
  scored as (
    select
      e.id, e.name, e.name_i18n->>'he' as name_he,
      p.name as park_name, l.name as land_name,
      e.category, e.status, e.status_note, e.intensity,
      e.height_requirement_cm, e.max_height_requirement_cm, e.gets_wet, e.wheelchair,
      e.motion_sickness_warning,
      e.sens_enclosed_dark, e.sens_heights, e.sens_loud_sudden, e.sens_strobe,
      e.skip_line_system, e.last_verified,
      -- ⚠️ **count(distinct f.t) ולא count(*)** — מילה אחת שמתאימה גם
      -- בצורתה המלאה וגם בלי התחילית היא **מילה אחת**, ושתי צורות של
      -- אותה מילה לא אמורות לדחוק החוצה מתקן שהתאים בשתי מילים שונות.
      (select count(distinct f.t) from forms f
        where e.name ilike '%' || f.root || '%'
           or coalesce(e.name_i18n->>'he', '') ilike '%' || f.root || '%'
           -- ⚠️ גם השמות הנרדפים. "מסע אל ההר" ו-"אוורסט" הם אותו מתקן.
           or exists (
             select 1 from jsonb_array_elements_text(
               coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
             where a ilike '%' || f.root || '%'
           )) as hits
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where (p_park is null or p.id = p_park or p.name ilike '%' || p_park || '%')
  )
  select
    s.id, s.name, s.name_he, s.park_name, s.land_name,
    s.category, s.status, s.status_note, s.intensity,
    s.height_requirement_cm, s.max_height_requirement_cm, s.gets_wet, s.wheelchair,
    s.motion_sickness_warning,
    s.sens_enclosed_dark, s.sens_heights, s.sens_loud_sudden, s.sens_strobe,
    s.skip_line_system, s.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   0     → נבדק ואין מגבלה → מתאים
    --   מספר  → מתאים אם הילד/ה מגיע/ה
    --   NULL  → **לא נבדק** → NULL, ולא true
    -- נגזר בזמן ריצה ואינו מאוחסן — אחרת היה מקור אמת שני שמתיישן
    -- ברגע שהגובה של הילד/ה משתנה.
    -- 🔴 **והתקרה, שנוספה ב-038.** חמישה אזורי מים לפעוטות מגבילים גובה
    -- כלפי מעלה, וכל עוד רק הרצפה נבדקה כאן, ילד גבוה מדי קיבל "מתאים".
    --
    -- ⚠️ הסדר: פסילה לפני התאמה. מי שגבוה מהתקרה **אינו** מתאים, גם אם
    -- הוא עובר את הרצפה בהרבה — וזה בדיוק המקרה שהיה חוזר true.
    --
    -- ⚠️ ותקרה לבדה היא תשובה. על חמש השורות האלה הרצפה היא NULL ("לא
    -- נבדק"), ובלי השורה הזו fits היה נשאר NULL — כלומר "אין לי מידע" על
    -- שורה שיש עליה מידע מלא בכיוון שנשאל.
    case
      when p_height_cm is null then null
      when s.max_height_requirement_cm is not null
           and p_height_cm > s.max_height_requirement_cm then false
      when s.height_requirement_cm is null
        then case when s.max_height_requirement_cm is null then null else true end
      else p_height_cm >= s.height_requirement_cm
    end
  from scored s
  where
    -- בלי שם — כל הפארק, לפי הסינון בלבד.
    (select count(*) from words) = 0
    -- ⚠️ עם שם — **רק ההתאמות הטובות ביותר.** ראה ההערה בראש הקובץ.
    or s.hits = (select max(x.hits) from scored x where x.hits > 0)
  -- ⚠️ מתקן סגור **מוחזר**, עם הסטטוס שלו. סינון שקט היה גורם לטים לומר
  -- "לא מצאתי מתקן כזה" על מתקן שקיים ופשוט סגור.
  order by
    case when p_name is not null and s.name ilike p_name || '%' then 0 else 1 end,
    s.name
  limit least(coalesce(p_limit, 8), 25)
$$;

comment on function public.find_experiences(text, text, int, int) is
  'עובדות על מתקנים, מהטבלה. ⚠️ התאמה לפי מילים ולא לפי ביטוי — שאלה היא משפט, לא שם (הבאג של 029). מוחזרות רק השורות עם מספר המילים התואמות הגבוה ביותר, כדי שמילה אחת מקרית לא תכניס מתקן זר להקשר. ⚠️ 040: ארבעת הדגלים הם ארבעה מצבים — true/false/na/null — ו-na אינו "לא נבדק". ⚠️ 039: ארבעת דגלי הרגישות מוחזרים, והם מחקר שלנו ולא מקור רשמי — הניסוח חייב לומר "לפי המידע שלנו". fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים". ⚠️ 038: max_height_requirement_cm הוא תקרה ולא רצפה, ומי שגבוה ממנה אינו מתאים.';

revoke all on function public.find_experiences(text, text, int, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.find_experiences(text, text, int, int) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק שההבחנה **שורדת מקצה לקצה**, ולא שהעמודה שינתה טיפוס. עמודה
-- שהומרה ופונקציה שנשארה בוליאנית נראות תקינות עד שמישהו שואל.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  probe_key text := 'probe-040';
  got       text;
begin
  insert into experience (id, key, park_id, kind, name, status, sens_heights)
  select probe_key, probe_key, p.id, e.kind, 'Probe Parade 040', 'open', 'na'
    from park p, experience e limit 1;

  select f.sens_heights into got
    from find_experiences('Probe Parade 040', null, null, 5) f limit 1;

  delete from experience where key = probe_key;

  if got is distinct from 'na' then
    raise exception '❌ "na" נכתב בטבלה וחזר כ-%. ההבחנה בין "לא חל" ל"לא נבדק" אינה שורדת.', coalesce(got, 'NULL');
  end if;

  raise notice '✅ 040 הותקנה — "לא חל" שורד מהטבלה ועד הפונקציה.';
exception when others then
  delete from experience where key = probe_key;
  raise;
end $$;

COMMIT;

-- ── מה שרואים עכשיו ──────────────────────────────────────────────────
-- ⚠️ אחרי טעינת התוכן: 77 שורות ב-na, וכולן Entertainment.
select sens_heights as "ערך", count(*) as "שורות"
  from experience group by 1 order by 2 desc;
