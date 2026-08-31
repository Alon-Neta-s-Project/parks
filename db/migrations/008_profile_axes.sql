-- 008_profile_axes.sql
-- צירי הפרופיל מהמחקר (park-day-companion-user-profile-axes.md).
--
-- שלושה שינויים. אף אחד מהם אינו מבני — הטבלה כבר בנויה נכון למודל
-- של שדות עצמאיים, ולא לשיוך לפרסונה אחת.

-- ── 1. הרחבת רשימת המפתחות ──────────────────────────────────────────
-- הרשימה היא allowlist בכוונה: מפתח חדש מחייב מיגרציה, ולכן אי אפשר
-- להמציא שדה פרופיל בשקט בקוד.
BEGIN;

alter table profile_fact drop constraint if exists profile_fact_key_check;
alter table profile_fact add constraint profile_fact_key_check check (key in (
  -- קיימים
  'planner_type','sensitivities','party','split_logistics',
  'experience_by_resort','deliberate_non_planning','staying_at_park_hotel',
  'travel_dates','ticket_type','intensity_tolerance','mobility',
  'price_sensitivity','dietary',
  -- ציר 1 — עומק התכנון. שני השדות עצמאיים ויכולים להיות true יחד.
  'planning_focus_fit',      -- התאמת אטרקציות ופארקים
  'planning_focus_cost',     -- עלויות, כרטיסים, לינה
  'planning_depth',          -- כמה מאמץ מושקע מראש בכלל
  -- ציר 2 — סגנון מיצוי היום
  'park_style',
  -- ציר 3 — לינה ותחבורה
  'lodging_pref',
  -- תווית פרסונה: ייחוס לצוות בלבד. הקוד לא מסתעף לפיה.
  'persona_labels'
));

-- ── 2. ותק נשאל, לעולם לא מוסק ──────────────────────────────────────
-- דרישה מפורשת מהמחקר: ידע ממבקר חוזר רלוונטי רק לאותו פארק/מדינה
-- בדיוק, ואי אפשר להסיק אותו משום נתון אחר. נאכף במסד ולא בהסכמה.
alter table profile_fact add constraint experience_must_be_stated
  check (key <> 'experience_by_resort' or source = 'stated');

-- תווית פרסונה היא תמיד מסקנה, לעולם לא הצהרה של המשתמש.
alter table profile_fact add constraint persona_must_be_inferred
  check (key <> 'persona_labels' or source = 'inferred');

-- ── 3. מוצהר ומוסק חיים זה לצד זה ───────────────────────────────────
-- היה: unique (user_id, trip_id, key) — מפתח אחד, שורה אחת. המשמעות
-- הייתה שכתיבת ערך מוצהר **דורסת** את המוסק, והמידע מה הנחנו נעלם.
--
-- הכלל "מוצהר גובר על מוסק" מיושם עכשיו בקריאה ולא בכתיבה:
-- שתי השורות מתקיימות במקביל, והקורא מעדיף stated.
--
-- שלוש תמורות: אין אובדן מידע · אפשר להראות במסך "מה טים יודע עליי"
-- גם מה הנחנו וגם מה תוקן · ומוסק לא יכול לדרוס מוצהר בטעות, כי הוא
-- כותב לשורה אחרת לגמרי.
alter table profile_fact drop constraint if exists profile_fact_user_id_trip_id_key_key;
create unique index profile_fact_unique_idx
  on profile_fact (user_id, coalesce(trip_id, '00000000-0000-0000-0000-000000000000'::uuid), key, source);

-- הקריאה שכל האפליקציה עוברת דרכה. stated מנצח, ובלעדיו מוסק.
create or replace view profile_effective as
  select distinct on (user_id, trip_id, key)
         user_id, trip_id, key, value, source, confidence, updated_at
    from profile_fact
   order by user_id, trip_id, key,
            (source = 'stated') desc,   -- מוצהר קודם
            updated_at desc;            -- ובתוך אותו סוג, המאוחר

comment on view profile_effective is
  'הפרופיל האפקטיבי. מוצהר גובר על מוסק. זהו המקור לטעינת הפרופיל בכל תור.';

COMMIT;
