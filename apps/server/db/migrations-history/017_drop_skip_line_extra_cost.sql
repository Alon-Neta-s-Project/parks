-- 017_drop_skip_line_extra_cost.sql
-- העמודה מוסרת. היא אינה שדה, היא נגזרת.
--
-- זו אינה בעיית ברירת מחדל אלא כפילות. `skip_line_extra_cost` נגזרת
-- במלואה מ-`skip_line_system`, בלי חריג אחד:
--
--     single_pass → true   (Single Pass *הוא* התשלום מעבר ל-Multi Pass)
--     multi_pass  → false
--     express     → false
--     none        → false
--     NULL        → NULL   ← וזה העיקר
--
-- אומת על 232 השורות: `extraCost = true` אם ורק אם `Single Pass`. אפס חריגים.
--
-- ⚠️ ולמה nullable לא היה מספיק: העמודה הישנה החזיקה `false` גם ב-176
-- השורות שבהן לא היה מידע — כלומר "נבדק, אין עלות נוספת" על 74 מתקנים
-- שאיש לא בדק. הפיכתה ל-nullable הייתה משמרת מקום שני שיכול לסתור את
-- הראשון. שדה אחד מאוחסן, השאר נגזרים ממנו.
--
-- 📌 הסייג שכדאי שיישאר כתוב: הגזירה נכונה **בהגדרה** במבנה המוצרים של
-- דיסני היום. אם דיסני תשנה את המבנה, עמודה נגזרת תישבר **בקול** —
-- שאילתה תיפול, מיגרציה תידרש. חמש עמודות שנכתבות ביד היו משקרות בשקט.
-- זה ההבדל, וזו הסיבה לגזירה.
--
-- להחזרה כעמודה נגזרת, אם תידרש שאילתה עליה:
--
--   alter table experience add column skip_line_extra_cost boolean
--     generated always as (
--       case when skip_line_system in ('multi_pass','single_pass')
--            then skip_line_system = 'single_pass' end
--     ) stored;
--
-- ⚠️ ולא `skip_line_system = 'single_pass'` לבדו. הביטוי הפשוט מחזיר
-- `false` ל-`express`, כלומר "אין עלות נוספת מעבר ל-Multi Pass" על שורות
-- יוניברסל — שם אין Multi Pass והשאלה כלל לא רלוונטית. אותה תשובה שקרית
-- בדיוק שהעמודה הישנה נתנה, רק בלבוש של נגזרת.
--
-- הסייג הזה חל גם על `none`, ולא רק על `express`: מתקן דיסני בלי מוצר
-- Lightning Lane כלל אינו נשאל "האם יש עלות מעבר ל-Multi Pass". השאלה
-- משמעותית רק היכן שקיימת מדרגת Multi Pass — כלומר `multi_pass` או
-- `single_pass`. בכל השאר `NULL`, כלומר "לא רלוונטי", ולא "לא".
--
-- ה-CASE בלי ELSE מחזיר NULL, וזה בדיוק ההתנהגות הרצויה.

BEGIN;

set local search_path = public, extensions;

alter table experience drop column if exists skip_line_extra_cost;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('017_drop_skip_line_extra_cost.sql', 'sha256:6f77d1fab9c67752db3c52674f336155',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
