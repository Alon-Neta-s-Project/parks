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
-- להחזרה כעמודה נגזרת, אם תידרש שאילתה עליה — שורה אחת:
--   alter table experience add column skip_line_extra_cost boolean
--     generated always as (skip_line_system = 'single_pass') stored;
-- (NULL ב-skip_line_system מייצר NULL, וזה נכון.)

BEGIN;

set local search_path = public, extensions;

alter table experience drop column if exists skip_line_extra_cost;

COMMIT;
