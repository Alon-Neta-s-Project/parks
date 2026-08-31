-- 011_conformance_fixes.sql
-- ארבעה ממצאים שהתגלו כשנטענו 232 שורות אמיתיות למסד ונדחו 125.
-- הבדיקה הזו — לתת למסד לפסוק במקום להשוות בעין — היא שמצאה אותם.

BEGIN;

-- 1 ─ intensity מותר להיות NULL --------------------------------------------
-- הכלל שסוכם: "מתקן בלי דירוג מוצג עם עובדות וציון מפורש שאין דירוג".
-- NOT NULL סתר אותו ישירות — אי אפשר להציג מה שאי אפשר לשמור.
alter table experience alter column intensity drop not null;

comment on column experience.intensity is
  'NULL = אין דירוג. מוצג במפורש כ"אין דירוג", ו**לעולם אינו נכלל בתוצאות של פילטר עוצמה** — לא בשקט ולא כברירת מחדל.';

-- 2 ─ gets_wet: אין ברירת מחדל ---------------------------------------------
-- 'none' כברירת מחדל הפך "לא נבדק" ל"נבדק ואינו מרטיב", בניגוד לכלל
-- "שדה ריק אינו שדה שאין לו ערך".
alter table experience alter column gets_wet drop default;
alter table experience alter column gets_wet drop not null;

comment on column experience.gets_wet is
  'NULL = לא נבדק. ''none'' = נבדק ונמצא שאינו מרטיב. שני מצבים שונים.';

-- 3 ─ סוג הפארק: נושא מול מים ------------------------------------------------
-- הייצוא נושא Park Type, ולא הייתה לו עמודה. פארקי המים דורשים טיפול
-- שונה (gets_wet חסר משמעות, air_conditioned לא רלוונטי).
alter table park add column park_kind text not null default 'theme'
  check (park_kind in ('theme','water'));
alter table park alter column park_kind drop default;

-- 4 ─ אותם ארבעה דגלי רגישות שיצאו מהיקף שלב 1 --------------------------------
-- היו NOT NULL DEFAULT false, כלומר "נבדק ואין" — בעוד שהם כלל לא נאספים.
alter table experience alter column sens_enclosed_dark drop not null;
alter table experience alter column sens_enclosed_dark drop default;
alter table experience alter column sens_heights       drop not null;
alter table experience alter column sens_heights       drop default;
alter table experience alter column sens_loud_sudden   drop not null;
alter table experience alter column sens_loud_sudden   drop default;
alter table experience alter column sens_strobe        drop not null;
alter table experience alter column sens_strobe        drop default;

COMMIT;
