-- ════════════════════════════════════════════════════════════════════
-- find_experiences moves to the server — the database function is dropped
-- ════════════════════════════════════════════════════════════════════
--
-- The query now lives in apps/server/src/db/find-experiences.ts, a copy of the
-- function's body (local parity: 1312/1312 inputs identical). Tim on Netlify runs
-- it when the site has DATABASE_URL, and never calls the function.
--
-- 🔴 **Not for production before the cut-over.** Production's Tim still runs on
-- Supabase Edge and calls the function over RPC; dropping it there first breaks the
-- ride lookup. Alon's decision (30.09): staging only. Production runs migrations only
-- through migrate.yml, behind its approval gate (O2).
--
-- down restores the function and its grants exactly as the baseline has them.

-- migrate:up
drop function public.find_experiences(text, text, integer, integer);

-- migrate:down
CREATE FUNCTION public.find_experiences(p_name text DEFAULT NULL::text, p_park text DEFAULT NULL::text, p_height_cm integer DEFAULT NULL::integer, p_limit integer DEFAULT 8) RETURNS TABLE(id text, name text, name_he text, park text, land text, category text, status text, status_note text, intensity integer, height_cm integer, max_height_cm integer, gets_wet text, wheelchair text, motion_sickness text, sens_dark text, sens_heights text, sens_loud text, sens_strobe text, skip_line text, last_verified date, fits boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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

-- A new function is executable by PUBLIC; the baseline revokes that before it grants.
revoke all on function public.find_experiences(p_name text, p_park text, p_height_cm integer, p_limit integer) from public;
grant execute on function public.find_experiences(p_name text, p_park text, p_height_cm integer, p_limit integer) to anon;
grant execute on function public.find_experiences(p_name text, p_park text, p_height_cm integer, p_limit integer) to authenticated;
grant execute on function public.find_experiences(p_name text, p_park text, p_height_cm integer, p_limit integer) to service_role;
