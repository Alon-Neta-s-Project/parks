-- ── 035 · המקורות יורדים מהקריאה הציבורית ───────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- אושר על ידי גיא, 07.09.
--
-- ⚠️ הבעיה, ולמה היא לא נראתה:
--
-- כלל הפרויקט אומר "אין מקורות בממשק. הייצוא נושא תאריך בלבד. בדיקה
-- נכשלת אם URL מגיע לשורה." והבדיקה הזו קיימת ועובדת — אבל היא בודקת
-- את **הייצוא**.
--
-- `experience_source` מחזיקה url · title · tier · retrieved_at, והיא
-- נכללה ב-006 ברשימת הטבלאות שנפתחו ל-select(true) יחד עם שאר טבלאות
-- התוכן. כלומר המקורות אינם מוצגים במסך — ונשלפים בקריאה אחת ישירה
-- ל-PostgREST על ידי כל אנונימי.
--
-- 🔴 וזו התבנית: **הגנה שנבדקת בצד אחד ופתוחה בצד השני.** הטבלה ריקה
-- היום, ולכן שום דבר עוד לא דלף — היא הייתה מתחילה להזיק בדיוק ברגע
-- שמישהו ימלא אותה, וזה הרגע שבו איש לא יחשוב לבדוק שוב.
--
-- ⚠️ ומה שזה **אינו**: זו אינה הכרעה על 242 השורות. הן נשארות ציבוריות,
-- והשאלה אם להגן עליהן היא החלטת מוצר של נטע ופולה (גיא, 07.09). כאן
-- יורד רק מה שהכלל כבר אוסר להציג.

BEGIN;

set local search_path = public, extensions;

-- מדיניות הקריאה בלבד. ⚠️ מדיניות האדמין נשארת — אדמין צריך לראות
-- מקורות כדי לבדוק שורה, וזה בדיוק מה שהיא קיימת בשבילו.
drop policy if exists experience_source_read on experience_source;

comment on table experience_source is
  'מקורות. ⚠️ אינה קריאה לציבור — הכלל אוסר מקורות בממשק, ומיגרציה 035 הורידה אותה מ-select(true). רק אדמין.';

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את ההתנהגות ולא את היעדר השורה ב-pg_policies. מדיניות שנמחקה
-- בעוד טבלה אחרת פותחת את אותה גישה נראית זהה למדיניות שהוסרה.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  readable boolean;
  others   int;
begin
  -- א. לאנונימי אין יותר מדיניות קריאה על הטבלה
  select exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'experience_source'
       and cmd in ('SELECT', 'ALL')
       and 'anon' = any(coalesce(roles, array['public']))
  ) into readable;

  -- ⚠️ `using (true)` נכתב ל-role ציבורי, ולכן הבדיקה למעלה עלולה
  -- לפספס. השנייה היא הישירה: האם נותרה מדיניות SELECT כלשהי שאינה
  -- מותנית ב-is_admin().
  select count(*) into others
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'experience_source'
     and cmd in ('SELECT', 'ALL')
     and coalesce(qual, '') not like '%is_admin%';

  if others > 0 then
    raise exception '❌ נותרה מדיניות קריאה שאינה מוגבלת לאדמין על experience_source (% מדיניות).', others;
  end if;

  -- ב. ו-RLS עצמה חייבת להישאר פעילה. טבלה בלי RLS פתוחה לגמרי,
  -- והסרת המדיניות האחרונה ממנה לא הייתה סוגרת דבר.
  if not (select relrowsecurity from pg_class
           where oid = to_regclass('public.experience_source')) then
    raise exception '❌ RLS כבויה על experience_source. הסרת מדיניות בלעדיה אינה סוגרת כלום.';
  end if;

  -- ג. ⚠️ ושאר טבלאות התוכן **נשארות** קריאות. זו אינה הכרעה על
  -- הפתיחות הכללית, וסגירה שלהן כאן הייתה חורגת ממה שאושר.
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='experience'
                    and cmd in ('SELECT','ALL')
                    and coalesce(qual,'') not like '%is_admin%') then
    raise exception '❌ experience נסגרה בטעות. 035 נוגעת ב-experience_source בלבד.';
  end if;

  raise notice '✅ תקין — המקורות סגורים, RLS פעילה, ושאר התוכן נשאר קריא.';
end $$;

COMMIT;

select '✅ 035 הותקנה' as "מצב";

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('035_sources_are_not_public.sql', 'sha256:8cb16bb8493d794a21962391abbaf216',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
