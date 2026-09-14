-- 028_match_knowledge.sql
-- השליפה. טים שואל, המסד מחזיר את הקטעים הקרובים.
--
-- ⚠️ **מבנה התוצאה הוא האכיפה** (סעיף 8 במסמך השליפה, אופציה ב').
-- טים חייב לדעת מה ה-volatility ומה ה-last_verified של כל קטע שנשלף:
-- הכלל "כשפרט עשוי להשתנות — לומר זאת" מופעל מ-volatility, ומסמך שעבר
-- זמן מאימותו צריך להיאמר בזהירות אחרת. השדות האלה יושבים ב-knowledge_doc
-- ולא בקטע.
--
-- שקלנו לשכפל אותם ל-knowledge_chunk כמו חמשת השדות שכבר משוכפלים שם.
-- **לא.** אלה נדרשים **אחרי** השליפה ולא בסינון שלה, והשכפול היה יוצר
-- מקור אמת שני לתאריך שמוצג למשתמש: מסמך שאומת מחדש בלי חיתוך מחדש
-- היה מציג תאריך ישן. במקום זה ה-join נעשה כאן, והם **חלק ממבנה
-- התוצאה** — אי אפשר לקבל את ה-content בלי לקבל גם אותם. האכיפה היא
-- בצורה, לא בזיכרון של מי שכותב את הקוד הקורא.
--
-- ⚠️ **ובלי source_urls.** הם קיימים ב-knowledge_doc ואינם יוצאים מכאן:
-- טים מדווח ערך ולעולם אינו מייחס אותו למקור, ומה שהשליפה לא מחזירה
-- אינו יכול לדלוף לתשובה.

BEGIN;

set local search_path = public, extensions;

create or replace function public.match_knowledge(
  p_embedding text,
  p_limit     int  default 5,
  p_resort    text default null
)
returns table (
  chunk_id      uuid,
  doc_id        text,
  title         text,
  content       text,
  authority_tier authority_tier,
  -- ⚠️ שני אלה אינם נוחות. בלעדיהם כלל הזהירות של טים אינו ניתן להפעלה.
  volatility    volatility_tier,
  last_verified date,
  similarity    float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    d.id,
    d.title,
    c.content,
    c.authority_tier,
    d.volatility,
    d.last_verified,
    -- <=> הוא מרחק קוסינוס: 0 זהה, 2 הפוך. ההמרה לדמיון היא כדי
    -- שהמספר שיוצא מכאן יגדל ככל שהקטע רלוונטי יותר, ולא להפך.
    1 - (c.embedding <=> p_embedding::vector) as similarity
  from knowledge_chunk c
  join knowledge_doc d on d.id = c.doc_id
  where c.embedding is not null
    -- ⚠️ תוכן שלא אושר אינו נשלף. הכלל קיים ב-RLS, אבל הפונקציה הזו היא
    -- security definer ולכן עוקפת אותו — ומה שנאכף במקום אחד ולא כאן
    -- היה נכנס לתשובה של טים דרך הדלת הזו.
    and c.review_status = 'approved'
    and d.review_status = 'approved'
    and (p_resort is null or d.scope_resort = p_resort)
  order by c.embedding <=> p_embedding::vector
  -- ⚠️ הגג נחתך כאן ואינו מתקבל מהקוראת (הלקח מ-026). חמישה קטעים הם
  -- מה שנכנס להקשר; מאה היו מנפחים את הקלט ואת העלות בלי לשפר תשובה.
  limit least(coalesce(p_limit, 5), 20)
$$;

comment on function public.match_knowledge(text, int, text) is
  'שליפה סמנטית. ⚠️ volatility ו-last_verified הם חלק ממבנה התוצאה ולא תוספת: בלעדיהם כלל הזהירות של טים אינו ניתן להפעלה. source_urls אינם מוחזרים — טים אינו מייחס למקור.';

revoke all on function public.match_knowledge(text, int, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.match_knowledge(text, int, text) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('028_match_knowledge.sql', 'sha256:e004bee033d83d0b459a2eb476a51e43',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
