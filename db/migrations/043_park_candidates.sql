-- 043 — מועמדים לפי פארק, לשאלות המלצה (09.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 043 — מועמדים לפי פארק (09.09)
--
-- 🔴 **על שאלת המלצה טים לא קיבל ולו מתקן אחד.**
--
-- `find_experiences` נקראת רק כששולפים שם מתקן מהשאלה. "מעדיפים פארקים
-- עם תפאורה יפה" אינה מכילה שם, ולכן חזרו אפס שורות — וכל מה שהיה לו
-- לענות ממנו היה מדריכי האופי, שהם פרוזה. לכן הוא ענה בפסקאות אווירה
-- בלי ולו מתקן אחד בשם.
--
-- ⚠️ **הכרעת פולה, 09.09:** לכל פארק שמוצג יש לצרף 2-3 מתקנים ספציפיים
-- בשם, מסוננים לפי מה שנאמר. שורת אווירה לבדה אינה המלצה.
--
-- ⚠️ **ואין כאן סינון עוצמה, בכוונה.** התפתיתי להוסיף p_max_intensity
-- ולגזור אותו מהשאלה — אבל "לא אוהבים אקסטרים מדי" הוא משפט שמודל קורא
-- נכון ו-regex קורא בערך. פרישה על פני רמות העוצמה נשלחת אליו, הוא
-- מסנן, וההוראות אומרות לו במפורש לפי מה. סינון שגוי בשרת היה מוחק
-- מתקנים מתאימים בלי שאיש יראה.

BEGIN;

drop function if exists public.park_candidates(int);

create function public.park_candidates(p_per_park int default 4)
returns table (
  park          text,
  name          text,
  name_he       text,
  land          text,
  category      text,
  intensity     int,
  height_cm     int,
  max_height_cm int,
  gets_wet      text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with ranked as (
    select
      p.name as park_name,
      e.name,
      e.name_i18n->>'he' as name_he,
      l.name as land_name,
      e.category,
      e.intensity,
      e.height_requirement_cm,
      e.max_height_requirement_cm,
      e.gets_wet,
      -- ⚠️ פרישה על פני העוצמות, ולא "הכי פופולרי". מטרת השורות האלה
      -- היא לתת למודל ממה לבחור בשני הכיוונים — מי שרוצה רגוע ומי
      -- שרוצה חזק — ולכן הדירוג הוא בתוך כל רמת עוצמה בנפרד.
      row_number() over (
        partition by p.id, e.intensity
        order by e.name
      ) as rn
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where p.park_kind = 'theme'
      -- ⚠️ שבעת פארקי הנושא בלבד (הכרעת פולה). פארק מים אינו תשובה
      -- לשאלה "איזה פארק מתאים לנו".
      and e.kind = 'attraction'
      -- ⚠️ מתקן סגור אינו מועמד להמלצה. זה שונה משאלה על מתקן שמות,
      -- שם סגור **כן** מוחזר עם הסטטוס שלו — כי שם נשאלנו עליו.
      and e.status = 'open'
      -- 🔴 **ומתקן בלי דירוג עוצמה אינו נכנס** (CLAUDE.md). הוא היה
      -- מגיע כ"עוצמה לא דורגה" לתוך תשובה שכל כולה על עוצמה.
      and e.intensity is not null
  )
  select park_name, name, name_he, land_name, category,
         intensity, height_requirement_cm, max_height_requirement_cm, gets_wet
    from ranked
   where rn <= greatest(coalesce(p_per_park, 4), 1)
   order by park_name, intensity, name
$$;

revoke all on function public.park_candidates(int) from public;
grant execute on function public.park_candidates(int) to anon, authenticated;

-- אימות: שבעה פארקים, פרישה על פני רמות העוצמה, ואפס לא־מדורגים.
select park as "פארק", count(*) as "מועמדים",
       min(intensity) as "עוצמה מינ׳", max(intensity) as "עוצמה מקס׳"
  from public.park_candidates(3)
 group by park order by park;

select count(*) filter (where intensity is null) as "בלי דירוג (צפוי: 0)"
  from public.park_candidates(3);

COMMIT;
