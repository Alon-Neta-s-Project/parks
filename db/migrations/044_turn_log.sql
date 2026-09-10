-- 044 — יומן תשובות: מה טים לא ידע, ולמה (10.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 044 — יומן תשובות (10.09)
--
-- 🔴 **אנחנו עיוורים.** אנחנו יודעים שמשהו בטים שבור רק אם נטע שואלת
-- במקרה את השאלה הנכונה. ב-09.09 זה קרה שש פעמים — כולל תשובה "אין לי
-- את הנתון" על מתקן שהעמודה שלו מלאה אצלנו, שחיה ימים בלי שאיש ידע.
--
-- ⚠️ **הטבלאות כבר קיימות מ-005**, עם `answered`, `refusal_reason`,
-- ספירת טוקנים ו-View בשם `unanswered_questions`. טים פשוט לא כתב לשם
-- כלום. זו ההופעה השלישית של אותה תבנית באותו יום: מנגנון בנוי שאיש
-- לא הפעיל.
--
-- ── ארבעת התנאים של גיא (09.09), וכולם נאכפים כאן ולא בקריאה ──────
--
-- 1. **RLS.** הטבלאות נסגרות לחלוטין. אין policy, ולכן PostgREST אינו
--    יכול לקרוא או לכתוב אליהן ישירות — הכתיבה עוברת דרך פונקציה אחת.
-- 2. **90 יום, נאכף בקוד.** כל כתיבה מוחקת את מה שעבר את החלון. בלי
--    מתזמן, בלי משימה שמישהו צריך לזכור להריץ.
-- 3. **תקרת אורך**, כדי ששורה אחת לא תישא מסמך.
-- 4. **טקסט השאלה רק כשטים לא ידע לענות.**
--
-- 🔴 **ותנאי 4 נאכף בפונקציה ולא בקריאה אליה.** אילו הקורא היה מחליט
-- מה לשלוח, באג אחד בצד הלקוח היה שומר הכול — והתנאי של גיא היה הופך
-- להמלצה. הפונקציה מאפסת את הטקסט בעצמה כשהתשובה נענתה, ולכן גם קריאה
-- שגויה אינה יכולה לחרוג.
--
-- ⚠️ **ואין שום מזהה משתמש.** לא IP, לא מזהה מכשיר, לא מזהה שיחה שנשמר
-- מעבר לחלון. מי ששאל אינו ניתן לשחזור מהטבלה הזו.

BEGIN;

-- ── 1. סגירה מלאה ────────────────────────────────────────────────────
-- ⚠️ **בלי policy בכוונה.** RLS בלי מדיניות פירושו שאיש אינו עובר —
-- וזו בדיוק הכוונה. security definer עוקף, וזה השער היחיד.
alter table conversation enable row level security;
alter table message      enable row level security;
alter table conversation force row level security;
alter table message      force row level security;

revoke all on conversation from anon, authenticated;
revoke all on message      from anon, authenticated;

-- ── 2. חלון השמירה ──────────────────────────────────────────────────
create index if not exists message_age_idx on message (created_at);

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
  v_conv uuid;
  v_question text;
begin
  -- 🔴 **תנאי 4 של גיא, ונאכף כאן.** תשובה שנענתה אינה שומרת את השאלה,
  -- ולא משנה מה נשלח. הקורא אינו יכול לחרוג מזה גם בטעות.
  v_question := case when p_answered then null
                     else left(coalesce(p_question, ''), 500) end;
  if v_question = '' then v_question := null; end if;

  -- ⚠️ שיחה חדשה לכל תור. **מזהה שיחה שנשמר לאורך זמן הוא מזהה משתמש
  -- בתחפושת**, וקישור בין תורות אינו נדרש לשום דבר שהיומן הזה נועד לו.
  insert into conversation default values returning id into v_conv;

  if v_question is not null then
    insert into message (conversation_id, role, content)
    values (v_conv, 'user', v_question);
  end if;

  insert into message (
    conversation_id, role, content, answered, refusal_reason,
    model, input_tokens, output_tokens
  ) values (
    v_conv, 'assistant', null, p_answered,
    case when p_answered then null else p_refusal_reason end,
    p_model, p_input_tokens, p_output_tokens
  );

  -- 🔴 **תנאי 2, ונאכף בכל כתיבה.** מחיקה מתוזמנת היא משימה שמישהו
  -- צריך לזכור, וזה בדיוק סוג הדבר שנשכח כאן שלוש פעמים היום.
  delete from conversation c
   where c.id in (
     select c2.id from conversation c2
      where c2.created_at < now() - interval '90 days'
      limit 200
   );
end;
$$;

revoke all on function public.log_turn(text, boolean, text, text, int, int) from public;
grant execute on function public.log_turn(text, boolean, text, text, int, int)
  to anon, authenticated;

-- ── אימות ───────────────────────────────────────────────────────────
select relname as "טבלה", relrowsecurity as "RLS פעיל"
  from pg_class where relname in ('conversation', 'message');

-- ⚠️ שתי קריאות: אחת שנענתה ואחת שלא. הראשונה **אסור** שתשמור טקסט.
select public.log_turn('שאלת בדיקה שנענתה', true,  null,     'test', 10, 20);
select public.log_turn('שאלת בדיקה שלא נענתה', false, 'no_data', 'test', 10, 5);

select count(*) filter (where content is not null) as "שאלות שנשמרו (צפוי: 1)",
       count(*) filter (where answered = false)    as "לא נענו (צפוי: 1)"
  from message;

-- ניקוי הבדיקה
delete from conversation;

COMMIT;
