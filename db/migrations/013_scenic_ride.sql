-- 013_scenic_ride.sql
-- שינוי שם קטגוריה: transport → scenic_ride.
--
-- למה: השם "transport" קרא כאילו הוא עונה על "איך מגיעים מפארק לפארק".
-- הוא לא. חמש השורות שנפלו אליו — Hogwarts Express (×2), PeopleMover,
-- Wildlife Express Train, ורכבל בליזרד ביץ׳ — הן **אטרקציות** שעומדים
-- להן בתור ונהנים מהן, שהצורה שלהן היא כלי רכב שנוסע.
--
-- הסיכון שהשם ייצר: משתמש שואל "איך מגיעים לאפקוט", וטים עונה
-- "PeopleMover". התחבורה האמיתית בפארקים — אוטובוסים, מונורייל, סקיילינר,
-- מעבורות — **אינה בטבלה הזו בכלל.** היא תוכן לוגיסטי בשכבת הידע.
--
-- ו-type: חמש השורות הופכות ל-'attraction'. הן אטרקציות. 'transport'
-- יוצא מרשימת ה-type לגמרי, כי אין דבר כזה במוצר.
--
-- הערה על Hogwarts Express: הוא באמת גם הדרך היחידה לעבור בין שני פארקי
-- יוניברסל, ודורש כרטיס Park-to-Park. זו עובדה חשובה — ומקומה בשכבת
-- הידע ובעריכה, לא בקטגוריה. הקטגוריה מתארת צורה, לא לוגיסטיקה.

BEGIN;

alter table experience drop constraint experience_category_check;
update experience set category = 'scenic_ride' where category = 'transport';
alter table experience add constraint experience_category_check
  check (category in ('dark_ride','coaster','simulator','water_ride','show',
                      'walkthrough','playground','meet_greet','scenic_ride','360_film'));

alter table experience drop constraint experience_type_check;
update experience set type = 'attraction' where type = 'transport';
alter table experience add constraint experience_type_check
  check (type in ('attraction','show','parade','meet_greet','walkthrough'));

comment on column experience.category is
  'צורת החוויה. scenic_ride = נוסעים בכלי רכב והנוף הוא העניין — לא תחבורה בפארק.';

COMMIT;
