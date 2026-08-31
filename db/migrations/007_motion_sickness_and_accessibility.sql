-- 007 · אזהרת בחילה רשמית, נגישות מורחבת, ובוליאנים ארבעת-מצבים
--
-- מיישם את סעיף 5 ב-park-day-companion-data-spec-v2.md.
--
-- ⚠️  לא הורצה. מיגרציות 001–006 אינן ב-repo הזה, ולכן הטבלה experience
--     אינה קיימת כאן. ראה db/README.md. הסכמה החיה היא src/data/schema.ts.

BEGIN;

-- 1 ─ רמת חומרה יוצאת, אזהרה רשמית נכנסת ------------------------------------
-- השדה הישן החזיק דירוג חומרה שאנחנו לא יכולים לבסס. מה שכן ניתן לבסס הוא
-- קיומה של אזהרה רשמית מטעם המפעיל — עובדה, לא הערכה.
ALTER TABLE experience DROP COLUMN IF EXISTS sens_motion_sickness;

ALTER TABLE experience
  ADD COLUMN official_motion_sickness_warning text
    CHECK (official_motion_sickness_warning IN ('true', 'false', 'na'));

COMMENT ON COLUMN experience.official_motion_sickness_warning IS
  'האם המפעיל מפרסם אזהרת בחילה. NULL = לא נבדק. אין למלא false בהיעדר ממצא.';

-- 2 ─ שני מאפיינים שמסבירים אזהרת בחילה --------------------------------------
ALTER TABLE experience
  ADD COLUMN is_motion_simulator text
    CHECK (is_motion_simulator IN ('true', 'false', 'na')),
  ADD COLUMN uses_large_screens_or_3d text
    CHECK (uses_large_screens_or_3d IN ('true', 'false', 'na'));

-- 3 ─ בוליאנים קיימים עוברים ל-text ארבעת-מצבים ------------------------------
-- boolean ב-Postgres מחזיק שלושה מצבים בלבד ואינו יכול להבחין בין "לא ידוע"
-- (NULL) לבין "לא רלוונטי לסוג הפעילות". ההבחנה הזאת נדרשת, ולכן text + CHECK.
ALTER TABLE experience
  ALTER COLUMN big_drops       TYPE text USING (CASE WHEN big_drops       IS NULL THEN NULL WHEN big_drops       THEN 'true' ELSE 'false' END),
  ALTER COLUMN spinning        TYPE text USING (CASE WHEN spinning        IS NULL THEN NULL WHEN spinning        THEN 'true' ELSE 'false' END),
  ALTER COLUMN air_conditioned TYPE text USING (CASE WHEN air_conditioned IS NULL THEN NULL WHEN air_conditioned THEN 'true' ELSE 'false' END),
  ALTER COLUMN gets_wet        TYPE text USING (CASE WHEN gets_wet        IS NULL THEN NULL WHEN gets_wet        THEN 'true' ELSE 'false' END);

ALTER TABLE experience
  ADD CONSTRAINT experience_big_drops_check       CHECK (big_drops       IN ('true', 'false', 'na')),
  ADD CONSTRAINT experience_spinning_check        CHECK (spinning        IN ('true', 'false', 'na')),
  ADD CONSTRAINT experience_air_conditioned_check CHECK (air_conditioned IN ('true', 'false', 'na')),
  ADD CONSTRAINT experience_gets_wet_check        CHECK (gets_wet        IN ('true', 'false', 'na'));

-- 4 ─ נגישות: שלושה ערכים הופכים לחמישה --------------------------------------
-- המקורות הרשמיים מבחינים בין חמישה מצבי העברה. כיווץ לשלושה היה מאבד הבחנה
-- שמשנה בפועל למי שמתכנן יום עם כיסא גלגלים.
ALTER TABLE experience DROP CONSTRAINT IF EXISTS experience_wheelchair_check;

ALTER TABLE experience
  ADD CONSTRAINT experience_wheelchair_check CHECK (wheelchair IN (
    'remain_in_wheelchair',
    'transfer_ecv_to_wheelchair',
    'transfer_to_ride_vehicle',
    'transfer_wheelchair_then_ride',
    'must_be_ambulatory'
  ));

-- 5 ─ height_requirement_in לא נוספת -----------------------------------------
-- ערך המקור באינצ'ים הוא ערך ביקורת ונשאר במאסטר. במוצר מוצגים סנטימטרים בלבד,
-- מעוגלים לשלם הקרוב.

-- 6 ─ ארבעת שדות הרגישות נשארים, ריקים, ולא נחשפים ---------------------------
-- לא מוסרים: הכיסוי ריק ממילא, והשארתם חוסכת הסרה והוספה מחדש. אי-חשיפה
-- בטקסונומיה, בכלים ובממשק היא מה שמונע שימוש בהם בטעות.
COMMENT ON COLUMN experience.sens_enclosed_dark IS 'לא בשלב 1. ריק, ואינו נחשף בטקסונומיה, בכלים או בממשק.';
COMMENT ON COLUMN experience.sens_heights       IS 'לא בשלב 1. ריק, ואינו נחשף בטקסונומיה, בכלים או בממשק.';
COMMENT ON COLUMN experience.sens_loud_sudden   IS 'לא בשלב 1. ריק, ואינו נחשף בטקסונומיה, בכלים או בממשק.';
COMMENT ON COLUMN experience.sens_strobe        IS 'לא בשלב 1. ריק, ואינו נחשף בטקסונומיה, בכלים או בממשק.';

COMMIT;
