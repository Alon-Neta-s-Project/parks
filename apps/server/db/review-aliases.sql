-- For Paula: the alias candidates, for review.
--
-- ⚠️ Read-only query. Nothing enters the database from running it.
--
-- Every row is **a suggestion by the model, not a fact.** An approved candidate goes
-- into experience.aliases_i18n in a separate step, manual and deliberate.

select
  e.name                            as "מתקן",
  e.name_i18n->>'he'                as "כתיב במסד",
  c.candidate                       as "מועמד לנרדף",
  c.status                          as "סטטוס"
from alias_candidate c
join experience e on e.id = c.experience_id
where c.status = 'pending'
order by e.name, c.candidate;
