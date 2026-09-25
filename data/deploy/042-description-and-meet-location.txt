-- 042 — תיאור ומיקום מפגש (09.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 042 — תיאור ומיקום מפגש (09.09)
--
-- 🔴 **הנתיב שהיה חסר, ובגללו תוכן מאושר נעצר לפני הקוד.**
--
-- פולה אישרה ב-07.09 שמונה תיאורים מלאים עם מקורות. הדגלים שלהם נכנסו
-- (Kevin עם sens_loud_sudden=true), הטקסט לא — כי לייצוא שאנחנו מייבאים
-- ממנו לא הייתה בכלל עמודת תיאור. כלומר כל תיאור שרוני כותבת ופולה
-- מאשרת נעצר במקום שאיש לא הסתכל בו.
--
-- ⚠️ **וזה התגלה במקרה**, מהערה של פולה על The Record Setters: התיאור
-- שלה מכיל את המיקום המדויק ("בולוואר הוליווד ליד אגם אקו") בעוד
-- שבטבלה שלנו השורה רשומה בלי אזור כלל.
--
-- שני שדות, ושניהם nullable בלי ברירת מחדל:
--
-- · description_he — התיאור העובדתי. NULL = טרם נכתב.
--
-- · meet_location — **המקום בפועל, ואינו תחליף ל-land.** land הוא האזור
--   הרשמי של הפארק (Fantasyland, World Nature); meet_location הוא איפה
--   הדבר קורה ("Adventurers Outpost"). שמונה שורות נושאות land ריק —
--   ארבע מהן מפגשי דמויות שהמקום שלהן כתוב בשם עצמו — ולהן זה נועד.
--
-- ⚠️ **ולא NOT NULL DEFAULT ''.** זו התבנית שהפילה כאן שבעה שדות עד
-- כה: מחרוזת ריקה כברירת מחדל הופכת "טרם נכתב" ל"נכתב, וריק", ומוחקת
-- את ההבדל לפני שמישהו הספיק לשאול.

BEGIN;

alter table experience add column if not exists description_he  text;
alter table experience add column if not exists meet_location    text;

comment on column experience.description_he is
  'תיאור עובדתי, 2-3 משפטים. NULL = טרם נכתב, ולעולם לא מחרוזת ריקה.';
comment on column experience.meet_location is
  'המקום בפועל, כשאין land רשמי. NULL = לא נבדק. אינו תחליף ל-land_id.';

-- אימות: שתי העמודות קיימות, nullable, בלי ברירת מחדל.
select column_name as "עמודה", is_nullable as "מקבל NULL",
       coalesce(column_default, '— אין ברירת מחדל —') as "ברירת מחדל"
  from information_schema.columns
 where table_name = 'experience'
   and column_name in ('description_he', 'meet_location')
 order by column_name;

select count(*) as "שורות",
       count(description_he) as "עם תיאור (צפוי: 0)",
       count(meet_location)  as "עם מיקום מפגש (צפוי: 0)"
  from experience;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('042_description_and_meet_location.sql', 'sha256:dad982920aa4c925272c9b373d6c2856',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
