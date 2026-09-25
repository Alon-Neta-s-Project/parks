-- 044 — יומן תשובות: מה טים לא ידע, ולמה (14.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 044 — יומן תשובות (14.09)
--
-- 🔴 **אנחנו עיוורים.** אנחנו יודעים שמשהו בטים שבור רק אם נטע שואלת
-- במקרה את השאלה הנכונה. ב-09.09 זה קרה שש פעמים — כולל תשובה "אין לי
-- את הנתון" על מתקן שהעמודה שלו מלאה אצלנו, שחיה ימים בלי שאיש ידע.
--
-- ── למה טבלה נפרדת, ולא `conversation`/`message` מ-005 ───────────────
--
-- ⚠️ **הגרסה הקודמת של הקובץ הזה ניסתה למחזר את הטבלאות של 005 ונפלה:**
-- `conversation.user_id` הוא `not null references profile(id)`. זו לא
-- תקלה טכנית שצריך לעקוף — זו הטבלה **אומרת בקול** למה היא נועדה.
-- 005 בנוי לשיחות של משתמש מזוהה, עם RLS לפי `auth.uid()` (006).
-- היומן הזה בנוי להיות אנונימי. שני דברים מנוגדים.
--
-- 🔴 **ולעקוף היה עולה פעמיים.** היה צריך (א) להפוך `user_id` ל-nullable
-- — ואז שיחה אמיתית שנשמרת בלי בעלים נעלמת מתחת ל-RLS בשקט, בדיוק
-- הכשל שהמוצר בנוי נגדו; (ב) `revoke all` על הטבלאות, כלומר לנעול
-- מראש את השיחות המזוהות שנטע ביקשה שנאסוף.
--
-- ✅ **טבלה נפרדת פותרת את שתיהן, ומחזקת את תנאי 4 של גיא:** ל-`turn_log`
-- אין עמודה שיכולה להחזיק מזהה. לא `user_id`, לא `conversation_id`,
-- לא IP. זו אינה הבטחה בהערה — אין לאן לכתוב.
--
-- ── ארבעת התנאים של גיא (09.09), וכולם נאכפים כאן ולא בקריאה ──────
--
-- 1. **RLS בלי policy.** הטבלה נסגרת לחלוטין. PostgREST אינו יכול לקרוא
--    או לכתוב אליה ישירות — הכתיבה עוברת דרך פונקציה אחת.
-- 2. **90 יום, נאכף בקוד.** כל כתיבה מוחקת את מה שעבר את החלון. בלי
--    מתזמן, בלי משימה שמישהו צריך לזכור להריץ.
-- 3. **תקרת אורך**, כדי ששורה אחת לא תישא מסמך.
-- 4. **טקסט השאלה רק כשטים לא ידע לענות.**
--
-- 🔴 **ותנאי 4 נאכף בפונקציה ולא בקריאה אליה.** אילו הקורא היה מחליט
-- מה לשלוח, באג אחד בצד הלקוח היה שומר הכול — והתנאי של גיא היה הופך
-- להמלצה. הפונקציה מאפסת את הטקסט בעצמה כשהתשובה נענתה, ולכן גם קריאה
-- שגויה אינה יכולה לחרוג.

BEGIN;

set local search_path = public, extensions;

-- ── 1. הטבלה ────────────────────────────────────────────────────────
-- ⚠️ **שורה אחת לכל תור, בלי קישור בין תורות.** מזהה שיחה שנשמר לאורך
-- זמן הוא מזהה משתמש בתחפושת, וקישור בין תורות אינו נדרש לשום דבר
-- שהיומן הזה נועד לו.
create table if not exists turn_log (
  id             uuid primary key default gen_random_uuid(),

  -- 🔴 **null כאן פירושו "נענתה, ולכן לא נשמרה"** — לא "לא נבדק".
  -- זה המצב היחיד שבו העמודה ריקה, והפונקציה היא זו שמאפסת אותה.
  question       text check (length(question) <= 500),

  answered       boolean not null,
  refusal_reason text check (refusal_reason in
                    ('no_data','unverified','safety_official_only','out_of_scope')),
  model          text,
  input_tokens   int,
  output_tokens  int,
  created_at     timestamptz not null default now(),

  -- תנאי 4, גם ברמת הסכמה ולא רק בפונקציה: תשובה שנענתה לא נושאת טקסט.
  constraint turn_log_answered_has_no_question
    check (not (answered and question is not null))
);

create index if not exists turn_log_age_idx on turn_log (created_at);
create index if not exists turn_log_unanswered_idx on turn_log (created_at desc)
  where answered = false;

comment on table turn_log is
  'יומן תורות אנונימי. אין בו עמודה שיכולה להחזיק מזהה משתמש — זו ההגנה, לא הערה.';
comment on column turn_log.question is
  'טקסט השאלה נשמר רק כשטים לא ידע לענות. null = נענתה. נאכף ב-log_turn וב-check.';

-- ── 2. סגירה מלאה ───────────────────────────────────────────────────
-- ⚠️ **בלי policy בכוונה.** RLS בלי מדיניות פירושו שאיש אינו עובר —
-- וזו בדיוק הכוונה. security definer עוקף, וזה השער היחיד.
alter table turn_log enable row level security;
alter table turn_log force  row level security;
revoke all on turn_log from anon, authenticated;

-- ── 3. השער היחיד ───────────────────────────────────────────────────
create or replace function public.log_turn(
  p_question       text,
  p_answered       boolean,
  p_refusal_reason text default null,
  p_model          text default null,
  p_input_tokens   int  default null,
  p_output_tokens  int  default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_question text;
begin
  -- 🔴 **תנאי 4 של גיא, ונאכף כאן.** תשובה שנענתה אינה שומרת את השאלה,
  -- ולא משנה מה נשלח. הקורא אינו יכול לחרוג מזה גם בטעות.
  v_question := case when p_answered then null
                     else left(coalesce(p_question, ''), 500) end;
  if v_question = '' then v_question := null; end if;

  insert into turn_log (
    question, answered, refusal_reason, model, input_tokens, output_tokens
  ) values (
    v_question, p_answered,
    case when p_answered then null else p_refusal_reason end,
    p_model, p_input_tokens, p_output_tokens
  );

  -- 🔴 **תנאי 2, ונאכף בכל כתיבה.** מחיקה מתוזמנת היא משימה שמישהו
  -- צריך לזכור, וזה בדיוק סוג הדבר שנשכח כאן שלוש פעמים באותו יום.
  delete from turn_log t
   where t.id in (
     select t2.id from turn_log t2
      where t2.created_at < now() - interval '90 days'
      limit 200
   );
end;
$$;

revoke all on function public.log_turn(text, boolean, text, text, int, int) from public;
grant execute on function public.log_turn(text, boolean, text, text, int, int)
  to anon, authenticated;

-- ── 4. מה שנטע וגיא קוראים ──────────────────────────────────────────
-- ⚠️ ה-View יורש את ה-RLS של הטבלה, ולכן נקרא רק מה-SQL Editor.
create or replace view unanswered_turns as
  select created_at, refusal_reason, question, model
    from turn_log
   where answered = false
   order by created_at desc;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('044_turn_log.sql', 'sha256:2c1748938e0ab76ed2e507cffbc26254',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
