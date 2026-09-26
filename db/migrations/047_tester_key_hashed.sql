-- ── 047 · מפתח הבודק כגיבוב בטבלה סגורה, ולא בגוף פונקציה ──────────
--
-- 📍 להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- ⚠️ ממתינה לאישור גיא. אין להריץ לפניו.
--
-- 🔴 **נמצא בידי הסוכן של אלון, 25.09, ואומת אצלי על PostgreSQL 16.**
--
-- `tester_key()` החזיקה את המפתח בגוף הפונקציה:
--
--   as $$ select 'tester-...' $$
--
-- הסרתי ממנה `execute` מ-public, מ-anon ומ-authenticated — וזה מונע
-- **קריאה לה**, ולא קריאה **שלה**. `pg_proc` פתוח לכל משתמש במסד,
-- ו-`prosrc` מחזיק את הגוף כטקסט. בדקתי במסד מקומי:
--
--   set role reviewer_readonly;
--   select prosrc from pg_proc where proname = 'tester_key';
--   →  select 'PUT-YOUR-KEY-HERE'
--
-- כלומר תפקיד הקריאה החיצוני ראה את המפתח.
--
-- ⚠️ **ומה שזה לא אומר.** המפתח נוסע ממילא לדפדפן בתוך החבילה של
-- גרסת הבדיקה (VITE_TESTER_KEY), ולכן מי שיש לו הקישור מחזיק אותו.
-- מה שהתגלה כאן אינו שהמפתח דלף לציבור, אלא שהוא דלף **לכיוון
-- שאיש לא התכוון אליו**: תפקיד שהוגדר במפורש כקריאה בלבד, בלי שום
-- נתיב כתיבה, קיבל את המפתח לערוץ הכתיבה היחיד שקיים.
--
-- ⚠️ **ורוטציה לבדה אינה תיקון.** מפתח חדש בגוף הפונקציה נקרא בדיוק
-- כמו הישן. לכן המנגנון משתנה, ולא רק הערך.
--
-- התבנית היא זו של `ingest_key` (מיגרציה 027), שכבר אושרה: גיבוב
-- sha256 בטבלה עם RLS ובלי שום מדיניות, ו-security definer כדרך
-- הגישה היחידה.

BEGIN;

set local search_path = public, extensions;

create table if not exists tester_key_store (
  id     int primary key default 1 check (id = 1),
  hash   text not null,
  set_at timestamptz not null default now()
);

alter table tester_key_store enable row level security;
-- אין מדיניות, בכוונה. רק security definer רואה אותה.

revoke all on table tester_key_store from public, anon, authenticated;

/**
 * קביעת המפתח. בפעם הראשונה פתוחה; אחר כך דורשת את הקודם.
 *
 * ⚠️ בלי התנאי הזה כל מי שיכולה לקרוא ל-RPC הייתה יכולה להחליף את
 * המפתח ואז להשתמש בו. "אין עדיין מפתח" ו"יש מפתח ואיני יודעת אותו"
 * הם שני מצבים שונים, ורק הראשון פתוח. זה בדיוק הניסוח של 027.
 */
create or replace function public.tester_set_key(p_new text, p_current text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing text;
begin
  if length(coalesce(p_new, '')) < 8 then
    raise exception 'מפתח קצר מדי';
  end if;

  select hash into existing from tester_key_store where id = 1;

  if existing is not null
     and (p_current is null or encode(sha256(p_current::bytea), 'hex') <> existing) then
    raise exception 'כדי להחליף מפתח קיים יש למסור את הנוכחי';
  end if;

  insert into tester_key_store (id, hash, set_at)
  values (1, encode(sha256(p_new::bytea), 'hex'), now())
  on conflict (id) do update set hash = excluded.hash, set_at = now();

  return 'נקבע';
end;
$$;

revoke all on function public.tester_set_key(text, text) from public, anon, authenticated;

/**
 * 🔴 **`tester_key()` יורדת, ואינה מוחלפת בגרסה "בטוחה".**
 *
 * פונקציה שמחזירה את המפתח היא בדיוק הדבר שנסגר כאן. מה שנשאר הוא
 * **השוואה** בלבד, שאינה מחזירה דבר מלבד אמת או שקר.
 */
drop function if exists public.tester_key();

create or replace function public.tester_key_matches(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from tester_key_store
     where id = 1
       and hash = encode(sha256(coalesce(p_key, '')::bytea), 'hex')
  )
$$;

revoke all on function public.tester_key_matches(text) from public, anon, authenticated;

/**
 * `save_tester_note` נכתבת מחדש מול המנגנון החדש.
 *
 * ⚠️ הגוף זהה לזה של 046 מלבד שורת הבדיקה. `is distinct from` הוחלף
 * בהשוואה בוליאנית — והלקח מ-046 נשמר: `null <> 'x'` הוא NULL,
 * ו-`if NULL then` אינו נכנס, כלומר מפתח חסר היה עובר בשקט.
 */
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
  if not public.tester_key_matches(p_key) then
    raise exception 'מפתח בודק שגוי';
  end if;

  insert into tester_note (turn_ref, session_ref, note, question, answer)
  values (p_turn_ref, p_session_ref, p_note, p_question, p_answer);

  -- ⚠️ אותה גזירה כמו ב-046: 500 האחרונות, והשאר יורדות.
  delete from tester_note
   where id in (select id from tester_note order by created_at desc offset 500);
end;
$$;

grant execute on function public.save_tester_note(text, text, text, text, text, text) to anon;

COMMIT;

-- ── קביעת המפתח ───────────────────────────────────────────────────
-- 📍 להריץ בנפרד, ולהחליף את הערך. ⚠️ מפתח חדש — הישן נחשף.
select public.tester_set_key('tester-fin2vm4ggddp');

-- ── אימות ────────────────────────────────────────────────────────
-- 📍 להריץ בנפרד, אחרי הקודם.
select 'המפתח אינו קריא משום מקום' as "מה נבדק",
       (select count(*)::text from pg_proc
         where proname in ('tester_key_matches','save_tester_note','tester_set_key')
           and prosrc ilike '%tester-%'), '0' as "מצופה"
union all
select 'tester_key() הוסרה',
       (select count(*)::text from pg_proc where proname = 'tester_key'), '0'
union all
select 'הטבלה סגורה ואין לה מדיניות',
       (select count(*)::text from pg_policies where tablename = 'tester_key_store'), '0'
union all
select 'המפתח נקבע',
       (select count(*)::text from tester_key_store where id = 1), '1';

-- ── END-047 ───────────────────────────────────────────────────────
