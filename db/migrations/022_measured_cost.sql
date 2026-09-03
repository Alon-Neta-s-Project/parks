-- 022_measured_cost.sql
-- מעדכן את הערכת העלות ב-usage_today מ-0.023 ל-0.0079 ש"ח להודעה.
--
-- ⚠️ המספר הישן לא היה שגוי — הוא היה מדוד תחת הגדרות אחרות, והן השתנו.
-- זה בדיוק המקרה שבו מספר שנכתב ביד מתחיל לשקר בשקט: אף אחד לא היה
-- רואה שהתצוגה מכפילה פי שלושה, כי היא נראית בדיוק אותו דבר.
--
-- המדידה, מתשובה אמיתית של טים (usageMetadata):
--   קלט 275 · פלט 174 · חשיבה 0     ← GEMINI_THINKING_LEVEL = minimal
--   275 × 6/1M  +  174 × 36/1M  =  0.0079 ש"ח
--
-- לפני כן, בלי ההגדרה: קלט 275 · פלט 154 · **חשיבה 505**. אסימוני חשיבה
-- מחויבים כפלט, והם היו 72% מעלות ההודעה — בשביל טיוטה פנימית שאיש אינו
-- קורא. minimal הוריד אותם לאפס, והתשובה לא נפגעה.
--
-- ⚠️ המספר תלוי בשתי הגדרות שיושבות ב-Secrets ולא כאן:
--   GEMINI_THINKING_LEVEL — אם יימחק, החשיבה חוזרת והעלות משלשת.
--   GEMINI_MODEL          — 3.6 Flash מוזיל את הפלט מ-36 ל-30.
-- ולכן המקור האמיתי הוא שדה usage שחוזר מכל תשובה של טים, וזה כאן הערכה
-- לקריאה מהירה לפני דמו — לא חשבונית.

BEGIN;

set local search_path = public, extensions;

-- מקור אמת אחד למחיר, כמו rate_limit_daily_cap() לגובה הגדר.
create or replace function public.estimated_cost_per_message() returns numeric
language sql immutable parallel safe
as $$ select 0.0079::numeric $$;

comment on function public.estimated_cost_per_message() is
  'ש"ח להודעה, מדוד ב-3.9.2026: קלט 275 · פלט 174 · חשיבה 0 (thinking level = minimal).';

create or replace view usage_today as
select
  count(*)                                        as "שאלות ב-24 שעות",
  public.rate_limit_daily_cap() - count(*)        as "נשאר עד הגדר",
  round(count(*) * public.estimated_cost_per_message(), 2)
                                                  as "עלות מוערכת בשקלים",
  count(distinct bucket)                          as "מבקרות שונות"
from api_call
where created_at > now() - interval '24 hours';

revoke all on table usage_today from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table usage_today from %I', r);
    end if;
  end loop;
end
$$;

comment on view usage_today is
  'כמה שאלות נשאלו ב-24 השעות האחרונות, וכמה נשאר עד הגדר. העלות מוערכת לפי estimated_cost_per_message().';

COMMIT;
