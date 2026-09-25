-- ── שמונה שמות עבריים למפגשי הדמויות ────────────────────────────────
-- להריץ ב: סופהבייס → SQL Editor → קוורי חדש. פעם אחת.
--
-- זה כל ההבדל בין מה שטעון אצלך עכשיו לבין הייצוא החדש. שמונה שורות,
-- שדה אחד בכל אחת. אין צורך בקבצי התוכן הגדולים.
--
-- למה זה חשוב: החיפוש של טים עובר על השם האנגלי, השם העברי והנרדפים.
-- בלי שם עברי, מי שמקלידה "מפגש עם מואנה" מקבלת אפס תוצאות וטים אומר
-- "אין לי את המידע" — וזה שקר, השורה קיימת.

BEGIN;

update experience set name_i18n = jsonb_set(coalesce(name_i18n, '{}'::jsonb), '{he}', to_jsonb(v.he))
  from (values
    ('EPCOT|Entertainment|JAMMitors', 'ג''אמיטורס'),
    ('Disney''s Animal Kingdom|Entertainment|Adventures with Kevin on Discovery Island', 'הרפתקאות עם קווין באי הגילוי'),
    ('Disney''s Animal Kingdom|Entertainment|Meet Favorite Disney Pals at Adventurers Outpost', 'פגישה עם מיקי ומיני ב-Adventurers Outpost'),
    ('Disney''s Animal Kingdom|Entertainment|Meet Moana at Character Landing', 'פגישה עם מואנה ב-Character Landing'),
    ('Disney''s Animal Kingdom|Entertainment|Zoogether Day Gathering Spot', 'נקודת המפגש של יום זוגות-יחד'),
    ('Disney''s Hollywood Studios|Entertainment|Green Army Drum Corps', 'חיל התופים של חיילי הצעצוע הירוקים'),
    ('Disney''s Hollywood Studios|Entertainment|Hollygroove Swingin''', 'הוליגרוב סווינגין'''),
    ('Disney''s Hollywood Studios|Entertainment|The Record Setters', 'שוברי השיאים')
  ) as v(key, he)
 where experience.key = v.key;

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
select count(*) filter (where name_i18n->>'he' is null or name_i18n->>'he' = '') as "בלי שם עברי (צפוי: 0)",
       count(*) as "סך השורות (צפוי: 242)"
  from experience;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('034_eight_hebrew_names.sql', 'sha256:9c3815daa05b88913c37951a9641db64',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
