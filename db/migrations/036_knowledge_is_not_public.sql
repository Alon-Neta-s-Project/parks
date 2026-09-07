-- ── 036 · מאגר הידע יורד מהקריאה הציבורית ───────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- נמצא על ידי גיא, 07.09, בעקבות בקשת פולה.
--
-- ⚠️ מה שהיה חשוף, ואומת במסד: **259 קטעי ידע נראים לכל אנונימי
-- בקריאה ישירה ל-PostgREST.** ולא רק הטקסט:
--
--   knowledge_doc   — source_url · source_kind · reviewed_by ·
--                     submitted_by · authority_tier
--   knowledge_chunk — embedding (הווקטור הגולמי) · authority_tier
--
-- שלוש בעיות נפרדות בחשיפה אחת:
--
-- 1. 🔴 `source_url` — **המקום השני של אותו באג בדיוק.** הכלל אומר
--    "אין מקורות בממשק", והבדיקה שאוכפת אותו בודקת את הייצוא. כאן
--    הם יצאו מהדלת האחורית, בדיוק כמו ב-experience_source (מיגרציה
--    035). באג שנמצא פעמיים בשני מקומות אינו מקרה — הוא אומר
--    שההגנה נבדקת בצד הלא נכון.
--
-- 2. 🔴 `submitted_by` ו-`reviewed_by` — מזהי משתמשים. תוכן קהילתי
--    נכתב בהנחה שהכותב אינו מזוהה; הכלל על יומן השאלות ("מי שכותב
--    אינו יכול לקרוא, גם לא את מה שהוא עצמו כתב") קיים בדיוק בשביל
--    זה. עמודה שמחזירה uuid של כותב מבטלת אותו.
--
-- 3. ⚠️ `embedding` — הווקטור הוא ייצוג המשמעות של כל קטע. מי שמוריד
--    259 ווקטורים מקבל את שכבת השליפה עצמה, לא רק את הטקסט.
--
-- ── ולמה סגירה מלאה ולא view ─────────────────────────────────────────
--
-- גיא הציע view שחושף content · scope · locale. זה היה עובד — אבל
-- **הדפדפן אינו קורא את הטבלאות האלה בכלל.** מדדתי: אין ולו הפניה
-- אחת אליהן בקוד הלקוח. טים קורא דרך `match_knowledge`, שהיא
-- `security definer` — כלומר עוקפת RLS ואינה מושפעת.
--
-- ⚠️ ולכן view היה מוסיף משטח שאיש לא צריך. אין דבר בטוח יותר משטח
-- שאינו קיים.
--
-- **נמדד לפני שנכתב** (מסד מקומי, 259 קטעים אמיתיים):
--   קריאה ישירה כ-anon:  259 → 0
--   דרך match_knowledge:   5 → 5   ← טים אינו נפגע

BEGIN;

set local search_path = public, extensions;

drop policy if exists knowledge_chunk_read on knowledge_chunk;
drop policy if exists knowledge_doc_read   on knowledge_doc;

comment on table knowledge_doc is
  'מסמכי ידע. ⚠️ אינם קריאים לציבור — מכילים source_url, submitted_by ו-reviewed_by. טים קורא דרך match_knowledge (security definer). מיגרציה 036.';
comment on table knowledge_chunk is
  'קטעי ידע. ⚠️ אינם קריאים לציבור — מכילים embedding. טים קורא דרך match_knowledge (security definer). מיגרציה 036.';

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את שני הצדדים: שהדלת נסגרה, **ושטים עדיין עובר בה.** בדיקה
-- שרק מוודאת סגירה עוברת גם על מסד שבו טים שבור.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  open_policies int;
  through_tim   int;
  probe         text;
begin
  -- א. לא נותרה מדיניות קריאה שאינה מוגבלת לאדמין
  select count(*) into open_policies
    from pg_policies
   where schemaname = 'public'
     and tablename in ('knowledge_doc','knowledge_chunk')
     and cmd in ('SELECT','ALL')
     and coalesce(qual,'') not like '%is_admin%';
  if open_policies > 0 then
    raise exception '❌ נותרו % מדיניות קריאה פתוחות על טבלאות הידע.', open_policies;
  end if;

  -- ב. RLS פעילה. טבלה בלעדיה פתוחה לגמרי, והסרת מדיניות ממנה
  --    אינה סוגרת דבר.
  if not (select bool_and(relrowsecurity) from pg_class
           where oid in (to_regclass('public.knowledge_doc'),
                         to_regclass('public.knowledge_chunk'))) then
    raise exception '❌ RLS כבויה על אחת מטבלאות הידע.';
  end if;

  -- ג. 🔴 וטים עדיין שולף. security definer אמור לעקוף את RLS, אבל
  --    "אמור" אינו מדידה — וסגירה ששוברת את טים גרועה מהחשיפה.
  select embedding::text into probe
    from knowledge_chunk where embedding is not null limit 1;
  if probe is null then
    raise notice '⚠️ אין ווקטורים — הסגירה בוצעה אך לא נבדק שטים עובר. להריץ שוב אחרי החישוב.';
    return;
  end if;
  -- ⚠️ **כ-anon, ולא כמי שמריץ את המיגרציה.** בלוק שרץ כמנהל עוקף RLS
  -- ממילא, ולכן הוא היה מדווח ✅ גם על מסד שבו טים שבור לחלוטין —
  -- כלומר בודק את ההרשאות של האדם הלא נכון. זה נתפס בבדיקה ההפוכה.
  set local role anon;
  select count(*) into through_tim from match_knowledge(probe, 5, null);
  reset role;
  if through_tim = 0 then
    raise exception '❌ match_knowledge מחזירה אפס. הסגירה שברה את השליפה של טים.';
  end if;

  raise notice '✅ תקין — הידע סגור לקריאה ישירה, וטים שולף % קטעים דרך match_knowledge.', through_tim;
end $$;

COMMIT;

select '✅ 036 הותקנה' as "מצב";
