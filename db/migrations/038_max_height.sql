-- ── 038 · גובה מקסימלי — הכיוון השני של אותה עמודה ─────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- אושר על ידי פולה דרך פיליפ, 08.09.
--
-- 🔴 הבעיה, ולמה היא נראתה כמו נתון תקין:
--
-- למאסטר עמודת גובה אחת, ומשמעותה "מינימום לעלייה". בחמישה אזורי מים
-- לפעוטות המספר שבה הוא **המקסימום המותר** — ולכן אותו מספר אמר בדיוק
-- את ההפך ממה שהתכוון:
--
--   Bay Slides 152 · Runamukka Reef 137 · Ketchakiddee Creek 122
--   Tike's Peak 122 · Tot Tiki Reef 122
--
-- ⚠️ טים אמר למשפחה ש"מגבלת הגובה בטייקס פיק היא 122 ס״מ". ילדה בגובה
-- 130 הבינה שהיא גדולה מספיק, כשבפועל היא **גדולה מדי**; ונער בגובה 160,
-- שבאמת אינו יכול לעלות, לא קיבל שום אזהרה.
--
-- ── איך זה נמצא ─────────────────────────────────────────────────────
--
-- לא ממקור חיצוני אלא מסתירה בתוך הדאטא עצמו: הקטגוריה **העדינה ביותר**
-- החזיקה את המספר הגבוה ביותר במאגר —
--
--   עוצמה 1 (עדין) · 17 שורות · הגבוה ביותר: 152
--   עוצמה 4 (חזק)  · 22 שורות · הגבוה ביותר: 137
--
-- מגלשת ילדים שדורשת יותר מ-Hulk ומ-Doctor Doom אינה אפשרית. רוני אימתה
-- מול המקורות, ופולה אישרה שדה נפרד.
--
-- ── ולמה שדה נפרד ולא איפוס ─────────────────────────────────────────
--
-- 🔴 הפיתוי היה לאפס את החמישה ל-0 ולסגור את זה היום. **אסור.**
--
-- `0` אצלנו פירושו "נבדק, ואין מגבלה". על מתקן שיש בו תקרה אמיתית זו
-- הצהרה שקרית **בכיוון ההפוך** — נחליף חסימת ילד נמוך בהזמנת ילד גבוה
-- מדי למתקן שלא ייתן לו לעלות. **התיקון המהיר גרוע מהבאג.**
--
-- ⚠️ ומאותה סיבה `height_requirement_cm` על החמישה נשאר **NULL ולא 0**:
-- רוני אימתה את התקרה; איש לא אימת שאין רצפה. 0 היה הצהרה שלא נאמרה.

BEGIN;

set local search_path = public, extensions;

alter table experience
  add column if not exists max_height_requirement_cm int;

-- ⚠️ אותו טווח כמו הרצפה, ומאותה סיבה: מספר מחוץ ל-50..200 אינו גובה של
-- אדם אלא שגיאת הקלדה או יחידה אחרת, ועדיף שייעצר כאן.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'experience_max_height_range') then
    alter table experience add constraint experience_max_height_range
      check (max_height_requirement_cm is null
             or max_height_requirement_cm between 50 and 200);
  end if;
end $$;

-- ⚠️ **ואיסור על שתי המשמעויות באותה שורה.** שורה שנושאת גם רצפה וגם
-- תקרה אפשרית בעולם, אבל אצלנו היא כמעט תמיד סימן שהמספר הועתק לשתי
-- העמודות במקום להיות מפורש נכון באחת. אם תגיע שורה כזו באמת — היא
-- תיעצר כאן ותיבדק, ולא תיכנס בשקט.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'experience_height_one_direction') then
    alter table experience add constraint experience_height_one_direction
      check (max_height_requirement_cm is null
             or height_requirement_cm is null
             or height_requirement_cm < max_height_requirement_cm);
  end if;
end $$;

comment on column experience.max_height_requirement_cm is
  'תקרת גובה: עד כמה מותר להיות גבוה כדי לעלות. ⚠️ ההפך מ-height_requirement_cm. חמישה אזורי מים לפעוטות בלבד. מיגרציה 038.';

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
    s.height_requirement_cm, s.max_height_requirement_cm, s.gets_wet, s.wheelchair,
    s.motion_sickness_warning, s.skip_line_system, s.last_verified,
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
  'עובדות על מתקנים, מהטבלה. ⚠️ התאמה לפי מילים ולא לפי ביטוי — שאלה היא משפט, לא שם (הבאג של 029). מוחזרות רק השורות עם מספר המילים התואמות הגבוה ביותר, כדי שמילה אחת מקרית לא תכניס מתקן זר להקשר. fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים". ⚠️ 038: max_height_requirement_cm הוא תקרה ולא רצפה, ומי שגבוה ממנה אינו מתאים.';

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
-- ⚠️ בודק את ההתנהגות ולא את קיום העמודה. עמודה שנוספה ופונקציה שאינה
-- מחזירה אותה נראות זהות מבחוץ, וזה בדיוק הפער שנתפס כאן שוב ושוב.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  n         int;
  tall      boolean;
  short     boolean;
  probe_key text := 'probe-038';
begin
  -- א. העמודה קיימת
  select count(*) into n
    from information_schema.columns
   where table_name = 'experience' and column_name = 'max_height_requirement_cm';
  if n = 0 then
    raise exception '❌ העמודה max_height_requirement_cm לא נוספה.';
  end if;

  -- ב. והפונקציה מחזירה אותה. עמודה שנוספה ופונקציה שלא עודכנה נראות
  --    זהות מבחוץ, וזה בדיוק הפער שנתפס כאן שוב ושוב.
  select count(*) into n
    from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
   where r.routine_name = 'find_experiences' and p.parameter_name = 'max_height_cm';
  if n = 0 then
    raise exception '❌ find_experiences אינה מחזירה max_height_cm. העמודה נוספה והפונקציה נשארה מאחור.';
  end if;

  -- ג. 🔴 **ההתנהגות, ולא ההגדרה.** שורת בדיקה אמיתית נכנסת לטבלה, נשאלת
  --    דרך הפונקציה בשני גבהים, ונמחקת. בלי זה הבדיקה מאשרת שהצינור בנוי
  --    ולא שהוא מוביל מים.
  insert into experience (id, key, park_id, kind, name, status,
                          height_requirement_cm, max_height_requirement_cm)
  select probe_key, probe_key, p.id, e.kind, 'Probe Tot Area 038', 'open', null, 122
    from park p, experience e
   limit 1;

  -- ילד בגובה 130 גבוה מהתקרה של 122 → **אינו** מתאים
  select f.fits into tall
    from find_experiences('Probe Tot Area 038', null, 130, 5) f
   limit 1;

  -- וילד בגובה 100 נמצא מתחתיה → מתאים
  select f.fits into short
    from find_experiences('Probe Tot Area 038', null, 100, 5) f
   limit 1;

  delete from experience where key = probe_key;

  if tall is distinct from false then
    raise exception '❌ ילד בגובה 130 קיבל fits=% על תקרה של 122. התקרה אינה נאכפת.', coalesce(tall::text, 'NULL');
  end if;
  if short is distinct from true then
    raise exception '❌ ילד בגובה 100 קיבל fits=% על תקרה של 122. התקרה חוסמת את מי שהיא נועדה לשרת.', coalesce(short::text, 'NULL');
  end if;

  raise notice '✅ 038 הותקנה — 130 ס"מ נחסם מתקרה של 122, ו-100 ס"מ עובר.';
exception when others then
  -- ⚠️ שורת הבדיקה נמחקת גם כשמשהו נכשל. שורה מלאכותית ששרדה במסד היא
  -- מתקן שלא קיים, והוא היה מופיע בתשובות של טים.
  delete from experience where key = probe_key;
  raise;
end $$;

COMMIT;

-- ── מה שרואים עכשיו ──────────────────────────────────────────────────
-- ⚠️ אחרי טעינת התוכן החדש, חמש השורות האלה צריכות להופיע כאן — ורק הן.
select name,
       height_requirement_cm     as "רצפה",
       max_height_requirement_cm as "תקרה"
  from experience
 where max_height_requirement_cm is not null
 order by name;
