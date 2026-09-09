-- ── 039 · ארבעת דגלי הרגישות מגיעים לטים ────────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת, **אחרי 038**.
-- אושר על ידי פולה דרך פיליפ, 08.09.
--
-- 🔴 מה שהיה, ואיש לא ידע:
--
-- נטע שאלה את טים אם Buzz Lightyear מתאים לילד שמפחד מחושך. הוא ענה
-- "אין לי מידע מפורט לגבי רמת החשיכה" — **והוא צדק.**
--
-- `find_experiences` החזירה גובה · עוצמה · הרטבה · דילוג בתור · סטטוס.
-- ארבע עמודות הרגישות — חושך, גבהים, רעש פתאומי, הבזקים — לא היו ברשימה
-- כלל. הנתון מלא על כל 165 המתקנים, ומעולם לא עזב את הטבלה.
--
-- ⚠️ וזה **הפיצ'ר שאין לאף מתחרה בעברית**. הוא נאסף, נבדק, אוחסן — ולא
-- הוצג. כשל בתפר, לא בדאטא ולא במודל.
--
-- ── תנאי הניסוח של פולה, ולמה הוא בגוף המיגרציה ─────────────────────
--
-- הדגלים הם מחקר של רוני, לא מקור רשמי מדרגה T1. טים חייב לומר "לפי
-- המידע שלנו, המתקן מסומן כ..." ולא "המתקן כולל הבזקי אור".
--
-- ⚠️ ההבדל אינו נימוס: משפחה עם ילד רגיש לאור מקבלת החלטה רפואית
-- מהמשפט הזה, וההבדל בין "בדקנו וזה כך" ל"כך אנחנו מסמנים" הוא ההבדל
-- בין מידע לבין הבטחה. ההוראה יושבת ב-index.ts, והתזכורת כאן כדי שמי
-- שיקרא את הפונקציה יידע שהיא קיימת.

BEGIN;

set local search_path = public, extensions;

-- 🔴 **drop לפני create, ובכוונה.**
--
-- `create or replace` אינו יכול לשנות את מבנה הטבלה שהפונקציה מחזירה.
-- העמודה החדשה משנה אותו, ולכן ההרצה נכשלת עם:
--   "cannot change return type of existing function"
--
-- ⚠️ ומה שזה מוחק יחד עם הפונקציה: **ההרשאות.** drop מסיר גם את
-- ה-grant ל-anon, וטים היה נופל על 403 בלי ששום דבר ייראה שבור. בלוק
-- ההרשאות בסוף הקובץ כותב אותן מחדש — הוא לא קישוט.
--
-- ⚠️ והכל בתוך טרנזקציה אחת: בין ה-drop ל-create הפונקציה אינה קיימת,
-- ובלי BEGIN/COMMIT היה חלון שבו טים מחזיר 404.
drop function if exists public.find_experiences(text, text, int, int);

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
  sens_dark     boolean,
  sens_heights  boolean,
  sens_loud     boolean,
  sens_strobe   boolean,
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
  'עובדות על מתקנים, מהטבלה. ⚠️ התאמה לפי מילים ולא לפי ביטוי — שאלה היא משפט, לא שם (הבאג של 029). מוחזרות רק השורות עם מספר המילים התואמות הגבוה ביותר, כדי שמילה אחת מקרית לא תכניס מתקן זר להקשר. ⚠️ 039: ארבעת דגלי הרגישות מוחזרים, והם מחקר שלנו ולא מקור רשמי — הניסוח חייב לומר "לפי המידע שלנו". fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים". ⚠️ 038: max_height_requirement_cm הוא תקרה ולא רצפה, ומי שגבוה ממנה אינו מתאים.';

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
-- ⚠️ בודק שהערך **מגיע**, ולא שהעמודה קיימת. זה בדיוק הפער שנוצר כאן:
-- העמודה הייתה מלאה, הפונקציה לא החזירה אותה, וכל שכבה נראתה תקינה.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  probe_key text := 'probe-039';
  got       boolean;
  n         int;
begin
  select count(*) into n
    from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
   where r.routine_name = 'find_experiences'
     and p.parameter_name in ('sens_dark','sens_heights','sens_loud','sens_strobe');
  if n < 4 then
    raise exception '❌ find_experiences מחזירה % דגלי רגישות מתוך 4.', n;
  end if;

  -- 🔴 וההתנהגות: דגל שנכתב בטבלה חייב לחזור מהפונקציה. שורת בדיקה
  -- אמיתית, ונמחקת גם בכישלון.
  -- 🔴 **השורה מועתקת משורה אמיתית, ולא נבנית מאפס.**
  --
  -- הגרסה הקודמת מנתה עמודות ביד ונכשלה על `type` — עמודת NOT NULL
  -- שלא הייתה ברשימה. תיקון עמודה־עמודה היה נכשל שוב על הבאה: הטבלה
  -- נושאת עשרות עמודות, וכל אחת שנוספת בעתיד הייתה שוברת את הבדיקה.
  --
  -- ⚠️ `select *` מעותק של הטבלה מבטיח שכל עמודות החובה מלאות בערכים
  -- חוקיים, ושרק מה שנבדק כאן נדרס. עמודה חדשה שתתווסף מחר לא תשבור
  -- כלום.
  create temporary table probe_row on commit drop as
    select * from experience limit 1;
  update probe_row set
                     id = probe_key, key = probe_key,
                     name = 'Probe Dark Ride 039',
                     status = 'open', status_note = null,
                     sens_enclosed_dark = true;
  insert into experience select * from probe_row;

  select f.sens_dark into got
    from find_experiences('Probe Dark Ride 039', null, null, 5) f limit 1;

  delete from experience where key = probe_key;

  if got is distinct from true then
    raise exception '❌ הדגל נכתב כ-true וחזר כ-%. הערך אינו עובר את הפונקציה.', coalesce(got::text, 'NULL');
  end if;

  raise notice '✅ 039 הותקנה — דגל שנכתב בטבלה חוזר מהפונקציה.';
exception when others then
  delete from experience where key = probe_key;
  raise;
end $$;

COMMIT;

select '✅ 039 הותקנה' as "מצב";
