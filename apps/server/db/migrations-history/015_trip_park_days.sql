-- 015_trip_park_days.sql
-- "כמה ימי פארק" הוא שדה משלו, לא נגזרת של התאריכים.
--
-- למחקר: מי שמבקש עזרה בתכנון פותח בעצמו עם כמה ימים באורלנדו **וכמה
-- מהם ימי פארק** — אלה שני מספרים שונים, ומשפחה שנמצאת עשרה ימים
-- ומתכננת ארבעה ימי פארק היא מקרה שכיח ולא חריג.
--
-- ⚠️ ואי אפשר לגזור: end_date - start_date נותן את אורך החופשה, לא את
-- מספר ימי הפארק. גזירה כזו הייתה מייצרת תוכנית לעשרה ימים למי שתכנן
-- ארבעה — בדיוק סוג ההנחה השקטה שהמוצר נמנע ממנה.
--
-- NULL = לא נשאל או לא נענה. אין ברירת מחדל.

BEGIN;

alter table trip add column park_days int
  check (park_days is null or (park_days >= 1 and park_days <= 30));

comment on column trip.park_days is
  'כמה ימי פארק מתוכננים. נפרד מ-start_date/end_date, שהם אורך השהות. NULL = לא ידוע, ולעולם אינו מוחלף באורך השהות.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('015_trip_park_days.sql', 'sha256:e27135b6a662d3c0ee7e71797ece82dd',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
