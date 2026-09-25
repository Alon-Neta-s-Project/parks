-- 046 — הערות בודק, מגרסת הבדיקה של טים (22.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 046 — הערות בודק (22.09)
--
-- ⛔ **לפני ההרצה: להחליף את מפתח הבודק בשורה המסומנת.** לייצר
-- מחרוזת אקראית ארוכה, ולהדביק אותה גם כאן וגם במסך גרסת הבדיקה.
-- לא לשלוח אותה בצ'אט.
--
-- 🔴 **למה זה קיים:** ההערות של נטע נשמרו ב-localStorage של הדפדפן.
-- ניקוי נתוני אתר מוחק אותן, ומעבר למחשב אחר מאבד אותן. מקור יחיד
-- שאפשר לאבד בלחיצה אינו מקור.
--
-- ── מה זה לא ─────────────────────────────────────────────────────────
-- ⚠️ **זו אינה עמודה על `message`.** פולה הציעה `tester_note text`
-- שם. טבלה נפרדת, ומשלוש סיבות: מי שכותב אינו בעל השיחה ולכן צריך
-- מדיניות אחרת; סבב בדיקה נגמר וההערות נמחקות בלי לגעת בשיחות; ו-
-- `insert` לטבלה ריקה אינו אותו סיכון כמו `update` על טבלת השיחות.
--
-- ⚠️ **ואין `author_id`.** הבודקים הם נטע והצוות, וזהות הכותב אינה
-- נדרשת למטרה. אם תידרש — זו החלטה, לא שדה שמוסיפים כי נוח.

BEGIN;

set local search_path = public, extensions;

create table if not exists tester_note (
  id          uuid primary key default gen_random_uuid(),
  -- ⚠️ מזהה התור מהמסך (`q0`, `q1`…) ולא מפתח זר ל-`message`.
  -- גרסת הבדיקה אינה כותבת ל-`message` כלל, ומפתח זר לשורה שאינה
  -- קיימת היה מפיל את הכתיבה.
  turn_ref    text not null check (length(turn_ref) between 1 and 64),
  session_ref text not null check (length(session_ref) between 1 and 64),
  question    text check (length(question) <= 2000),
  answer      text check (length(answer) <= 8000),
  note        text not null check (length(note) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists tester_note_session_idx on tester_note (session_ref, created_at);

alter table tester_note enable row level security;
alter table tester_note force  row level security;

-- 🔴 **אין policy, בכוונה — כמו `turn_log`.** `force row level security`
-- בלי policy חוסם את כולם, כולל הבעלים. הכתיבה עוברת דרך הפונקציה
-- למטה בלבד, והקריאה דרך פונקציה נפרדת.
revoke all on tester_note from anon, authenticated;

-- ── מפתח הבודק ──────────────────────────────────────────────────────
-- ⚠️ **המפתח אינו סוד חזק, והוא לא מתיימר להיות.** הוא יושב בדפדפן
-- של נטע ומי שפותח את כלי המפתחים רואה אותו. מה שהוא כן עושה: מונע
-- ממי שנתקל בכתובת לכתוב שורות. זה הסיכון הריאלי, והטבלה מחזיקה
-- הערות של נטע ולא נתוני משתמשים.
create or replace function public.tester_key() returns text
language sql immutable parallel safe
as $$ select 'YOUR-TESTER-KEY-HERE' $$;  -- ⛔ להחליף לפני ההרצה

revoke all on function public.tester_key() from public, anon, authenticated;

create or replace function public.save_tester_note(
  p_key         text,
  p_turn_ref    text,
  p_session_ref text,
  p_note        text,
  p_question    text default null,
  p_answer      text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- ⚠️ **נופל, ולא מחזיר בשקט.** כתיבה שנדחתה ולא נאמרה נראית למי
  -- שכותבת בדיוק כמו כתיבה שהצליחה — וההערה תיעלם בלי שתדע.
  if p_key is distinct from public.tester_key() then
    raise exception 'מפתח בודק שגוי';
  end if;

  if coalesce(trim(p_note), '') = '' then
    raise exception 'הערה ריקה אינה נשמרת';
  end if;

  insert into tester_note (turn_ref, session_ref, note, question, answer)
  values (
    left(p_turn_ref, 64),
    left(p_session_ref, 64),
    left(trim(p_note), 2000),
    left(p_question, 2000),
    left(p_answer, 8000)
  );

  -- ⚠️ תקרה, כדי שדף שנתקע בלולאה לא ימלא את המסד. 500 הערות הן
  -- הרבה מעבר לסבב בדיקה אמיתי.
  delete from tester_note
   where id in (
     select id from tester_note order by created_at desc offset 500
   );
end;
$$;

revoke all on function public.save_tester_note(text, text, text, text, text, text) from public;
grant execute on function public.save_tester_note(text, text, text, text, text, text) to anon, authenticated;

-- ── קריאה — דרך שער, לא דרך גרנט ────────────────────────────────────
create or replace function public.tester_notes(p_limit int default 200)
returns table (created_at timestamptz, session_ref text, turn_ref text,
               note text, question text, answer text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select created_at, session_ref, turn_ref, note, question, answer
    from tester_note
   order by created_at desc
   limit least(coalesce(p_limit, 200), 500);
$$;

revoke all on function public.tester_notes(int) from public, anon, authenticated;

-- 🔴 **ולמי כן — `ci_verify`, וזו הכרעה שצריכה את גיא.**
--
-- נטע קבעה (14.09) שהיא אינה מריצה בדיקות ידניות, והצעתי לה קובץ
-- להרצה. זו הייתה חזרה לאחור. הקריאה צריכה לקרות בלי שהיא תיגע בכלום,
-- ולכן היא עוברת ל-CI — אותו דפוס כמו כל שאר הסודות כאן.
--
-- ⚠️ **ו-`ci_verify` ולא תפקיד רביעי חדש**, כי הוא כבר קיים ויש לו
-- סוד ב-GitHub. תפקיד נוסף פירושו סיסמה נוספת שנטע מדביקה.
--
-- ⚠️ **ומה שזה כן מותח:** גיא פיצל את `ci_verify` מ-`ci_content`
-- בכוונה, והערות בודק אינן אף אחד משניהם. הטיעון בעד: הטבלה מחזיקה
-- מילים של נטע על תשובות של טים — אין בה נתוני משתמשים, ואין בה מה
-- לדלוף. הטיעון נגד: זו הרחבה שלישית לתפקיד שהוגדר למשימה אחת.
--
-- **זו שאלה לגיא ולא החלטה שלי.** אם הוא מעדיף תפקיד נפרד — השורה
-- הזו יורדת ונכתב קובץ תפקיד משלו.
grant execute on function public.tester_notes(int) to ci_verify;

COMMIT;

-- ── אימות ───────────────────────────────────────────────────────────
-- 🔴 עמודת "עובר" חייבת להיות ✅ בכל שורה.
select 'הטבלה קיימת' as "הבדיקה",
       (select count(*)::text from information_schema.tables
         where table_schema = 'public' and table_name = 'tester_note') as "יצא",
       '1' as "צפוי"
union all
select 'RLS כפוי בלי policy',
       (select count(*)::text from pg_policies where tablename = 'tester_note'), '0'
union all
select 'ל-anon אין גישה ישירה לטבלה',
       (select count(*)::text from information_schema.role_table_grants
         where grantee = 'anon' and table_name = 'tester_note'), '0'
union all
select 'ול-anon יש רק את פונקציית הכתיבה',
       (select count(*)::text from information_schema.role_routine_grants
         where grantee = 'anon' and routine_name in ('save_tester_note','tester_notes','tester_key')), '1'
union all
select '⛔ המפתח הוחלף',
       case when public.tester_key() = 'YOUR-TESTER-KEY-HERE'
            then '🔴 לא הוחלף' else 'כן' end, 'כן';

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('046_tester_note.sql', 'sha256:2987c9f9e159b5d032f0eeb909c3c931',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
