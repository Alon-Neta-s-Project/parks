-- 045 — country על knowledge_doc (21.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 045 — country על knowledge_doc (21.09)
--
-- 🔴 **הערך שסוכן-האיסוף מתייג בקפידה לא היה נוחת בשום מקום.**
--
-- פולה שינתה (18.09) את שדה הסקרייפר מ"אזור" ל-country, כדי שלא יתנגש
-- עם "אזור" של המסדר — שהוא אזור בתוך הפארק. השם תוקן; העמודה לא
-- הייתה קיימת. כלומר פריט מבריטניה ופריט שמקורו לא ידוע היו נראים
-- זהים בשאילתה, בלי שום שגיאה.
--
-- ⚠️ **nullable ובלי default**, כמו 019 ו-025. `not null default 'XX'`
-- כאן היה המופע השמיני של אותו כלל: הצהרה שאיש לא בדק.
--   מספר = נלכד · NULL = לא נלכד · ואין ערך שלישי שמשמעו "אין מדינה".
--
-- ⚠️ **והבדיקה היא על תבנית, לא על רשימה.** ISO 3166-1 alpha-2 אינו
-- אוצר מילים סגור כמו purchase_type — הוא 249 ערכים שמשתנים. התבנית
-- תופסת את מה שבאמת נשבר: 'usa', 'ארה"ב', 'United States', מחרוזת
-- ריקה. קוד תקין־בתבנית אך שגוי ('FR' במקום 'GB') הוא באג מיפוי
-- במקור, ורשימה סגורה לא הייתה תופסת אותו גם היא.
--
-- ⚠️ **ואין upper() בטריגר.** נורמליזציה שקטה מסתירה כותב שגוי במקום
-- להפיל אותו. הכותב מנרמל, המסד דוחה.
--
-- ⚠️ **ו-IL אינו מוחרג.** ישראל מחוץ להיקף הסקרייפר האוטומטי — לא
-- מחוץ לשדה. הערוץ הידני הנפרד כותב אותה.

BEGIN;

set local search_path = public, extensions;

alter table knowledge_doc add column if not exists country text;

alter table knowledge_doc drop constraint if exists knowledge_doc_country_iso;
alter table knowledge_doc add constraint knowledge_doc_country_iso
  check (country is null or country ~ '^[A-Z]{2}$');

comment on column knowledge_doc.country is
  'ISO 3166-1 alpha-2 של מקור הפריט. NULL = לא נלכד, ואינו "אין מדינה". נגזר מהמקור, לעולם לא מתוכן הפריט.';

-- ── אימות ───────────────────────────────────────────────────────────
-- 🔴 עמודת "עובר" חייבת להיות ✅ בכל שורה.
select 'העמודה קיימת' as "הבדיקה",
       (select count(*)::text from information_schema.columns
         where table_name = 'knowledge_doc' and column_name = 'country') as "יצא",
       '1' as "צפוי"
union all
select 'והיא nullable',
       (select is_nullable from information_schema.columns
         where table_name = 'knowledge_doc' and column_name = 'country'), 'YES'
union all
select 'ובלי default',
       (select coalesce(column_default, 'אין') from information_schema.columns
         where table_name = 'knowledge_doc' and column_name = 'country'), 'אין'
union all
select 'האילוץ קיים',
       (select count(*)::text from pg_constraint
         where conname = 'knowledge_doc_country_iso'), '1';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('045_country.sql', 'sha256:6fe2287748ddec538af1f891d52a0f3b',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
