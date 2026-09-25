-- 019_content_fields_from_export.sql
-- שבע העמודות שהאפליקציה מציגה ולמסד לא היה בית עבורן.
--
-- נמדד: מתוך 38 השדות הסקלריים בסכמת האפליקציה, 31 היו מכוסים ושבעה לא.
-- בלעדיהן "האפליקציה קוראת מהמסד" אינו אפשרי — חלק מהמסך היה ממשיך להגיע
-- מקובץ שקפא בזמן הבנייה, וזו נפילה שקטה בלבוש של הצלחה.
--
-- ⚠️ כולן nullable ובלי ברירת מחדל. NOT NULL DEFAULT על שדה שמגיע מאיסוף
-- חיצוני הוא הצהרה שאיש לא בדק — התבנית שנתפסה שבע פעמים בפרויקט הזה.
-- ריק כאן פירושו "לא הגיע בייצוא", ולא ערך.

BEGIN;

set local search_path = public, extensions;

alter table experience add column if not exists key text;
alter table experience add column if not exists kind text
  check (kind in ('attraction','entertainment'));
alter table experience add column if not exists subtype text;
alter table experience add column if not exists admission text;
alter table experience add column if not exists reservation text;
alter table experience add column if not exists included_with_admission text;
alter table experience add column if not exists status_note text;

-- מפתח היציבות של הייצוא בין ייבואים. ייחודי כשהוא קיים, ומרשה NULL
-- לשורות שטרם נטענו מחדש.
create unique index if not exists experience_key_uidx on experience (key)
  where key is not null;

comment on column experience.key is
  'ה-Key מהייצוא. מפתח היציבות בין ייבואים — id נגזר משם, וזה לא.';
comment on column experience.kind is
  'attraction / entertainment. ⚠️ אינו נגזר מ-type: הייצוא מתפלג 166/66 בעוד type מתפלג 161/41/13/13/4.';
comment on column experience.status_note is
  'המשפט של הייצוא על הסטטוס. נושא תאריכים — "Opens Sep 14, 2026" — ובלעדיו coming_soon הוא סטטוס בלי מתי.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('019_content_fields_from_export.sql', 'sha256:b01b39e913d0b678813c0dbd2418e0f2',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
