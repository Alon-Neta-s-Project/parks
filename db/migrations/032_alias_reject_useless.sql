-- 032_alias_reject_useless.sql
-- שני סוגי מועמדים שאין טעם שיגיעו לסקירה של פולה.
--
-- ⚠️ נמדד על 60 המועמדים הראשונים, לא נצפה מראש:
--
--   Advanced Training Lab → "אדוונסד טריינינג לאב"   ← זהה לשם שכבר במסד
--   Acrobatico!           → "אקרובטיקו אפקוט"        ← שם + פארק
--   Astro Orbiter         → "אסטרו אורביטר מג'יק קינגדום"
--   Awesome Planet        → "אוסום פלאנט אפקוט"
--
-- הראשון הוא רעש. **השני מזיק:** ההתאמה היא לפי מילים, ולכן המילה
-- "אפקוט" בשאלה כלשהי הייתה מתאימה לנרדף "אקרובטיקו אפקוט" ומחזירה את
-- Acrobatico על כל שאלה שמזכירה את אפקוט. נרדף שמכיל שם פארק הוא
-- מחולל התאמות שגויות.
--
-- ⚠️ **וזו הגנה שנייה ולא ראשונה.** הראשונה היא שמילים גנריות נופלות
-- מהשאלה בצד של טים — כי מילה גנרית מופיעה גם בנרדף לגיטימי
-- ("מופע היפה והחיה"), ואי אפשר לפסול אותה כאן בלי לאבד אותו.

BEGIN;

set local search_path = public, extensions;

create or replace function public.alias_add(
  p_secret text, p_experience_id text, p_candidate text, p_source text)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  c text := btrim(p_candidate);
  e record;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;

  select name, name_i18n->>'he' as he into e
  from experience where id = p_experience_id;
  if not found then
    return false;
  end if;

  -- ⚠️ נרדף שזהה לשם הקיים אינו מוסיף דבר. הוא רק שורה שפולה צריכה
  -- לקרוא ולדחות.
  if lower(c) = lower(coalesce(e.he, '')) or lower(c) = lower(e.name) then
    return false;
  end if;

  -- ⚠️ **נרדף שמכיל שם פארק מזיק.** ראה ההערה בראש הקובץ.
  if exists (
    select 1 from park p
    where c ilike '%' || p.name || '%'
       or (p.name_i18n->>'he' is not null and c ilike '%' || (p.name_i18n->>'he') || '%')
  ) then
    return false;
  end if;

  insert into alias_candidate (experience_id, candidate, source, status)
  values (p_experience_id, c, p_source, 'pending')
  on conflict (experience_id, candidate) do nothing;
  return found;
end
$$;

comment on function public.alias_add(text, text, text, text) is
  'כתיבת מועמד לנרדף. ⚠️ דוחה כפילות של השם הקיים, ונרדף שמכיל שם פארק — האחרון מחזיר את המתקן על כל שאלה שמזכירה את הפארק.';

-- ── איפוס המנה הראשונה ──────────────────────────────────────────────
-- 60 המועמדים שנוצרו לפני התיקון נוצרו בהוראה הישנה, וחלקם מהסוג
-- שהפונקציה עכשיו דוחה. מוחקים ומייצרים מחדש — זול (₪0.31 לכל 232)
-- ועדיף על סקירה ידנית של רעש.
--
-- ⚠️ **התנאי צר בכוונה: רק מה שהמודל ייצר ואיש עוד לא נגע בו.**
-- מועמד שאושר או נדחה על ידי אדם אינו נמחק, גם לא בטעות.
delete from alias_candidate where source = 'model' and status = 'pending';

COMMIT;
