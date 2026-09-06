-- 030_find_experiences_by_words.sql
-- 🔴 תיקון באג שנמדד בשדה: החיפוש התאים **ביטוי**, והשאלה היא **משפט**.
--
-- 029 עשתה `e.name ilike '%' || p_name || '%'` — כלומר התאימה את כל מה
-- שהגיע כמחרוזת אחת רציפה. הקוד שקורא לה מסיר מילות שאלה ומחזיר את מה
-- שנשאר, וזה **צירוף מילים** ולא שם:
--
--   "הבת שלי בגובה 112 ס״מ, היא יכולה לעלות על אקספדישן אוורסט?"
--     → "הבת שלי סנטימטר יכולה לעלות אקספדישן אוורסט"
--     → ilike '%הבת שלי סנטימטר יכולה לעלות אקספדישן אוורסט%'
--     → אפס שורות
--
-- ⚠️ **והבדיקות שלי לא תפסו את זה, כי הן בדקו את הצד הלא נכון.** הן
-- אימתו ש-extractRideName מחזירה מחרוזת שמכילה "אוורסט" — וזה היה נכון.
-- אף בדיקה לא שאלה **האם המסד מוצא משהו עם המחרוזת הזו**. בדיקה על
-- הפלט של שלב אחד אינה בדיקה על החיבור בין שני שלבים, ופה הכשל ישב
-- בדיוק בתפר. השאלה הקצרה ("כמה עולה אוורסט") עבדה במקרה, כי אחרי
-- ההסרה נשארה מילה אחת.
--
-- התיקון: התאמה לפי **מילים**. שורה נמדדת לפי כמה מילים מהשאלה נמצאו
-- בה, ומוחזרות רק השורות עם המספר הגבוה ביותר.
--
-- ⚠️ **הסינון הזה הוא מה שמונע זבל.** בלעדיו "שלי" או "לעלות" היו
-- יכולות להתאים למתקן אקראי במילה אחת, והוא היה נכנס להקשר של טים
-- כעובדה. מתקן שהתאים בשתי מילים דוחק החוצה כל מי שהתאים באחת.

BEGIN;

set local search_path = public, extensions;

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
  gets_wet      text,
  wheelchair    text,
  motion_sickness text,
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
      e.height_requirement_cm, e.gets_wet, e.wheelchair,
      e.motion_sickness_warning, e.skip_line_system, e.last_verified,
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
    s.height_requirement_cm, s.gets_wet, s.wheelchair,
    s.motion_sickness_warning, s.skip_line_system, s.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   0     → נבדק ואין מגבלה → מתאים
    --   מספר  → מתאים אם הילד/ה מגיע/ה
    --   NULL  → **לא נבדק** → NULL, ולא true
    -- נגזר בזמן ריצה ואינו מאוחסן — אחרת היה מקור אמת שני שמתיישן
    -- ברגע שהגובה של הילד/ה משתנה.
    case
      when p_height_cm is null then null
      when s.height_requirement_cm is null then null
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
  'עובדות על מתקנים, מהטבלה. ⚠️ התאמה לפי מילים ולא לפי ביטוי — שאלה היא משפט, לא שם (הבאג של 029). מוחזרות רק השורות עם מספר המילים התואמות הגבוה ביותר, כדי שמילה אחת מקרית לא תכניס מתקן זר להקשר. fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים".';

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
