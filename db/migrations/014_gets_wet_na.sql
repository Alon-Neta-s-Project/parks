-- 014_gets_wet_na.sql
-- `gets_wet` מקבל ערך רביעי: 'na'.
--
-- למה: המאסטר מבחין בין ארבעה מצבים, והמסד ידע להחזיק רק שלושה.
--   ערך  = נבדק, וזו התשובה
--   'none' = נבדק, אינו מרטיב
--   'na'   = **מופע במה. השאלה לא רלוונטית.**  ← זה מה שנפל
--   NULL   = לא נבדק
--
-- בלי הערך הזה 66 שורות הבידור נטענו כ-NULL, כלומר "לא בדקנו" —
-- וטים היה אומר "אין לי מידע" על שאלה שיש לה תשובה ברורה.
-- זו אותה משפחת באגים, הפעם בשכבת המסד.
--
-- ⚠️ אין ברירת מחדל ואין NOT NULL. NULL נשאר "לא נבדק".

BEGIN;

alter table experience drop constraint experience_gets_wet_check;
alter table experience add constraint experience_gets_wet_check
  check (gets_wet in ('none','may_get_wet','may_get_soaked','na'));

comment on column experience.gets_wet is
  'ערך = נבדק · ''none'' = נבדק ואינו מרטיב · ''na'' = לא רלוונטי (מופע) · NULL = לא נבדק. ארבעה מצבים, לא שלושה.';

COMMIT;
