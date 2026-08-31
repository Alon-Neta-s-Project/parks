-- 012_height_none.sql
-- "אין מגבלת גובה" הוא ערך, לא היעדר ערך.
--
-- הסוכן מילא 136 שורות ב-'none' — כלומר **נבדק, ואין מגבלה**. העמודה היא
-- integer, ולכן הערך הזה לא יכול להיכנס, ו-NULL היה מוחק את ההבחנה בין
-- "נבדק ואין" ל"לא נבדק". זו אותה משפחת באגים של gets_wet ושל ארבעת
-- דגלי הרגישות.
--
-- הפתרון: 0 הוא הערך הנכון ולא מספר קסם — הגובה המזערי לעלייה הוא באמת
-- אפס. ⚠️ **אסור להציג אותו כמספר.** ב-UI: "אין מגבלת גובה".

BEGIN;

alter table experience drop constraint experience_height_requirement_cm_check;
alter table experience add constraint experience_height_requirement_cm_check
  check (height_requirement_cm = 0
      or (height_requirement_cm >= 50 and height_requirement_cm <= 200));

comment on column experience.height_requirement_cm is
  '0 = נבדק, אין מגבלת גובה (מוצג כטקסט, לעולם לא כמספר). NULL = לא נבדק. 50-200 = המגבלה בפועל.';

COMMIT;
