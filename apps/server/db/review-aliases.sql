-- לפולה: המועמדים לשמות נרדפים, לסקירה.
--
-- ⚠️ שאילתת קריאה בלבד. שום דבר לא נכנס למסד מהרצה שלה.
--
-- כל שורה היא **הצעה של המודל, לא עובדה.** מועמד מאושר נכנס
-- ל-experience.aliases_i18n בשלב נפרד, ידני ומכוון.

select
  e.name                            as "מתקן",
  e.name_i18n->>'he'                as "כתיב במסד",
  c.candidate                       as "מועמד לנרדף",
  c.status                          as "סטטוס"
from alias_candidate c
join experience e on e.id = c.experience_id
where c.status = 'pending'
order by e.name, c.candidate;
