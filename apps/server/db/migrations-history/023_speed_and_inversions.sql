-- 023_speed_and_inversions.sql
-- מהירות מרבית ומספר היפוכים יוצאים מהשק ומקבלים עמודות משלהם.
--
-- ⚠️ הערכים אינם אובדים והם לא היו חסרים: 22 שורות נושאות מהירות ו-20
-- נושאות היפוכים, ושתיהן יושבות היום בתוך intensity_factors jsonb.
-- המיגרציה הזו מעבירה אותן, לא מצילה אותן.
--
-- **למה בכל זאת:** intensity_factors הוא
--   intensity_factors jsonb not null default '{}'::jsonb
-- כלומר NOT NULL DEFAULT על שדה שמגיע מאיסוף חיצוני — התבנית שנתפסה
-- בפרויקט הזה שבע פעמים, וזו השמינית. 210 מתוך 232 השורות נושאות {},
-- ו-{} כאן נקרא "נבדק, אין מה לדווח" בזמן שהאמת היא "לא נבדק". אחרי
-- המעבר NULL אומר "לא נבדק", ו-0 היפוכים אומר "נבדק ואין" — וזה הבדל
-- שהמסך צריך, כי Facts.tsx מציג את שניהם.
--
-- ⚠️ ההערה ב-002 הבטיחה שהשק יחזיק "inversions, max_speed_kmh, big_drops,
-- spinning, loud". big_drops ו-spinning כבר קודמו לעמודות משלהן, ו-loud
-- מעולם לא נכתב. הערה שמתארת מבנה שאינו קיים היא בדיוק סוג הכיסוי שנראה
-- כמו כיסוי — וזו הסיבה ש-019, שנגזרה מהשוואת שמות שדות, לא ראתה כאן פער.
--
-- והשק עצמו יורד: עמודה שמחזיקה את מה שכבר יש בעמודה אחרת היא מקור אמת
-- שני, ומקור אמת שני מתפצל בשקט.

BEGIN;

set local search_path = public, extensions;

-- nullable ובלי ברירת מחדל, כמו 019. NULL = לא נבדק.
alter table experience add column if not exists max_speed_kmh numeric
  check (max_speed_kmh is null or (max_speed_kmh > 0 and max_speed_kmh < 300));
alter table experience add column if not exists inversions int
  check (inversions is null or (inversions >= 0 and inversions <= 20));

-- העברה מהשק. ⚠️ ->> מחזיר טקסט, ו-'null' של JSON חוזר כ-NULL של SQL
-- דרך ->>, ולכן ההשמה בטוחה. נעשה כאן ולא בטעינה חוזרת, כדי שלא יידרש
-- להריץ מחדש את 232 השורות בשביל שתי עמודות.
update experience set
  max_speed_kmh = nullif(intensity_factors->>'max_speed_kmh', '')::numeric,
  inversions    = nullif(intensity_factors->>'inversions', '')::int
where intensity_factors is not null;

-- ⚠️ נעצר בקול אם ההעברה לא כיסתה את מה שהיה בשק. עמודה חדשה שנשארה
-- ריקה נראית בדיוק כמו עמודה שאין לה נתונים.
do $$
declare in_bag int; in_col int;
begin
  select count(*) filter (where intensity_factors->>'max_speed_kmh' is not null),
         count(*) filter (where max_speed_kmh is not null)
    into in_bag, in_col from experience;
  if in_bag <> in_col then
    raise exception 'העברת המהירות חסרה: % בשק, % בעמודה', in_bag, in_col;
  end if;
  select count(*) filter (where intensity_factors->>'inversions' is not null),
         count(*) filter (where inversions is not null)
    into in_bag, in_col from experience;
  if in_bag <> in_col then
    raise exception 'העברת ההיפוכים חסרה: % בשק, % בעמודה', in_bag, in_col;
  end if;
end
$$;

alter table experience drop column if exists intensity_factors;

comment on column experience.max_speed_kmh is
  'קמ"ש. NULL = לא נבדק. 22 שורות בייצוא נושאות ערך.';
comment on column experience.inversions is
  'מספר היפוכים. NULL = לא נבדק · 0 = נבדק ואין. 20 שורות נושאות ערך.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('023_speed_and_inversions.sql', 'sha256:3d6d140682399ec1c1c3c66456989978',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
