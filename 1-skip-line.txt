-- 016_skip_line_neutral.sql
-- skip_line_system — אוצר מילים ניטרלי למפעיל, ו-NULL מותר.
--
-- ⚠️ השם הוא מה שגרם לבאג. `Lightning Lane` הוא שם המוצר של דיסני, אבל
-- העמודה שימשה כשדה הכללי של שני המפעילים. ליוניברסל אין Lightning Lane —
-- יש להם Universal Express — ולכן `N/A` בעמודת המקור של דיסני היה *נכון*
-- לכל 101 שורות יוניברסל, והמידע שלהן ישב כל הזמן בעמודה אחרת.
--
-- זו הפעם החמישית לאותה תבנית: `transport` שנראה כמו תחבורה בפארק,
-- `dark_ride` שנראה כמו מפחיד, הבלוק המשפטי של דיסני שנראה כמו סיכון
-- בחילה. אינדיקטור שנראה כמו הדבר ואינו הדבר. הערכים כאן נקראים על שם
-- מה שהם, ולא על שם המוצר של מפעיל אחד.
--
-- שלושת המצבים:
--   'none'  — נבדק, ואין מוצר דילוג
--   ערך     — נבדק, וזה המוצר
--   NULL    — לא נבדק
--
-- הסרנו את 'virtual_queue' מאוצר המילים. אף שורה לא השתמשה בו, והייצוא
-- אינו נושא אותו. אם יידרש — מיגרציה של שורה אחת.

BEGIN;

set local search_path = public, extensions;

alter table experience alter column skip_line_system drop not null;
alter table experience alter column skip_line_system drop default;

alter table experience drop constraint if exists experience_skip_line_system_check;

-- כל השורות מוחזרות ל-NULL. הן מעולם לא נטענו מנתונים — 'none' הגיע
-- מברירת המחדל של העמודה, כלומר המסד הצהיר "נבדק ואין מוצר דילוג" על 232
-- מתקנים שאיש לא בדק. זו בדיוק ההצהרה השקטה שהמיגרציה הזו מבטלת.
-- קובץ התוכן ימלא מחדש את מה שידוע.
update experience set skip_line_system = null;

alter table experience add constraint experience_skip_line_system_check
  check (skip_line_system in ('multi_pass','single_pass','express','none'));

comment on column experience.skip_line_system is
  'מוצר דילוג בתור, בשם ניטרלי למפעיל. multi_pass/single_pass = דיסני · express = יוניברסל · none = נבדק ואין · NULL = לא נבדק, ולעולם אינו "אין".';

COMMIT;
