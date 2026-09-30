-- ════════════════════════════════════════════════════════════════════
-- park_candidates moves to the server — the database function is dropped
-- ════════════════════════════════════════════════════════════════════
--
-- The query now lives in apps/server/src/db/park-candidates.ts, a copy of the
-- function's body (local parity: 16/16 inputs identical, and a rolled-back fixture
-- shows neither side returns a ride without an intensity rating). Tim on Netlify
-- runs it when the site has DATABASE_URL, and never calls the function.
--
-- 🔴 **Not for production before the cut-over.** Production's Tim still runs on
-- Supabase Edge and calls the function over RPC. Staging only, like 20260930170000
-- and 20260930180000. Production runs migrations only through migrate.yml, behind
-- its approval gate (O2).
--
-- down restores the function and its grants exactly as the baseline has them.

-- migrate:up
drop function public.park_candidates(integer);

-- migrate:down
CREATE FUNCTION public.park_candidates(p_per_park integer DEFAULT 4) RETURNS TABLE(park text, name text, name_he text, land text, category text, intensity integer, height_cm integer, max_height_cm integer, gets_wet text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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

-- A new function is executable by PUBLIC; the baseline revokes that before it grants.
revoke all on function public.park_candidates(p_per_park integer) from public;
grant execute on function public.park_candidates(p_per_park integer) to anon;
grant execute on function public.park_candidates(p_per_park integer) to authenticated;
