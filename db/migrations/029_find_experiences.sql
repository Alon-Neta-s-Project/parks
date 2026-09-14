-- 029_find_experiences.sql
-- הכלי. עובדות על מתקנים נשלפות מהטבלה, לא מחיפוש סמנטי.
--
-- ⚠️ **זו ההפרדה שהארכיטקטורה נועדה לשמור** (הערה ב-003_knowledge.sql):
-- "עובדות קשות יושבות ב-experience ונשלפות דרך כלים. כאן יושב רק מה
-- שהוא פרוזה. **ערבוב השניים הוא בדיוק הטעות שהארכיטקטורה נועדה
-- למנוע.**"
--
-- חיפוש סמנטי מצוין לפרוזה וגרוע לעובדות. "מה גובה המינימום" צריכה את
-- **המספר מהשורה**, לא את הקטע שנשמע הכי דומה. 112 הוא ערך, לא טקסט
-- שמתאים בערך — והפרש של קטע אחד בדירוג הוא מתקן אחר לגמרי.
--
-- ⚠️ **וזה גם מה שמונע מטים לענות מהאימון שלו.** הוא "יודע" גבהים של
-- מתקנים בדיסני מהאינטרנט, והם עשויים להיות נכונים ועשויים להיות ישנים
-- בשנתיים. הפונקציה הזו נותנת לו את המספר **שלנו**, שנבדק ויש לו תאריך.

BEGIN;

set local search_path = public, extensions;

/**
 * מתקנים לפי שם, פארק וגובה.
 *
 * ⚠️ החיפוש בשם עובר על שלושה שדות: השם האנגלי, השם העברי, והשמות
 * הנרדפים. משפחה ישראלית תכתוב "אוורסט" ולא "Expedition Everest",
 * וחיפוש באנגלית בלבד היה מחזיר ריק על שאלה שיש לה תשובה.
 */
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
  select
    e.id,
    e.name,
    e.name_i18n->>'he',
    p.name,
    l.name,
    e.category,
    e.status,
    e.status_note,
    e.intensity,
    e.height_requirement_cm,
    e.gets_wet,
    e.wheelchair,
    e.motion_sickness_warning,
    e.skip_line_system,
    e.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   גובה נדרש 0     → נבדק ואין מגבלה → מתאים
    --   גובה נדרש מספר  → מתאים אם הילד/ה מגיע/ה
    --   גובה נדרש NULL  → **לא נבדק** → NULL, ולא true
    -- הערך הזה נגזר בזמן ריצה ואינו מאוחסן בשום מקום — אחרת הוא היה
    -- מקור אמת שני שמתיישן ברגע שהגובה של הילד/ה משתנה.
    case
      when p_height_cm is null then null
      when e.height_requirement_cm is null then null
      else p_height_cm >= e.height_requirement_cm
    end
  from experience e
  join park p on p.id = e.park_id
  left join land l on l.id = e.land_id
  where
    (p_park is null or p.id = p_park or p.name ilike '%' || p_park || '%')
    and (
      p_name is null
      or e.name ilike '%' || p_name || '%'
      or e.name_i18n->>'he' ilike '%' || p_name || '%'
      -- ⚠️ גם השמות הנרדפים. "מסע אל ההר" ו-"אוורסט" הם אותו מתקן.
      or exists (
        select 1 from jsonb_array_elements_text(
          coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
        where a ilike '%' || p_name || '%'
      )
    )
  -- ⚠️ מתקן סגור **מוחזר**, עם הסטטוס שלו. סינון שקט של סגורים היה גורם
  -- לטים לומר "לא מצאתי מתקן כזה" על מתקן שקיים ופשוט סגור — וזו תשובה
  -- שגויה שנשמעת כמו תשובה.
  order by
    case when e.name ilike p_name || '%' then 0 else 1 end,
    e.name
  limit least(coalesce(p_limit, 8), 25)
$$;

comment on function public.find_experiences(text, text, int, int) is
  'עובדות על מתקנים, מהטבלה. ⚠️ לא חיפוש סמנטי: "מה גובה המינימום" צריכה את המספר מהשורה, לא את הקטע שנשמע דומה. fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים".';

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

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('029_find_experiences.sql', 'sha256:df969b0e6b22357e56b7069a9df283fa',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
