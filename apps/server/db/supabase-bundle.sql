-- ==========================================================================
-- Park Day Companion — קובץ הקמה למסד הנתונים ב-Supabase
-- ==========================================================================
--
-- מה זה
--   כל המיגרציות והנתונים הקבועים, בקובץ אחד, בסדר הנכון. להדביק ל-
--   Supabase Studio ← SQL Editor ← New query, וללחוץ Run פעם אחת.
--   נוצר אוטומטית על ידי scripts/build-supabase-bundle.py. אין לערוך אותו
--   ביד — לערוך את הקבצים ב-apps/server/db/migrations ולהריץ את הסקריפט מחדש.
--
-- הסדר
--   1. מיגרציה 000_schema_migration.sql
--   2. מיגרציה 001_extensions_and_taxonomy.sql
--   3. מיגרציה 002_content.sql
--   4. מיגרציה 003_knowledge.sql
--   5. מיגרציה 004_users_trips.sql
--   6. מיגרציה 005_conversations.sql
--   7. מיגרציה 006_rls.sql
--   8. מיגרציה 007_content_fields.sql
--   9. מיגרציה 008_profile_axes.sql
--   10. מיגרציה 009_plan_item_interest.sql
--   11. מיגרציה 010_trip_members.sql
--   12. מיגרציה 011_conformance_fixes.sql
--   13. מיגרציה 012_height_none.sql
--   14. מיגרציה 013_scenic_ride.sql
--   15. מיגרציה 014_gets_wet_na.sql
--   16. מיגרציה 015_trip_park_days.sql
--   17. מיגרציה 016_skip_line_neutral.sql
--   18. מיגרציה 017_drop_skip_line_extra_cost.sql
--   19. מיגרציה 018_rate_limit.sql
--   20. מיגרציה 019_content_fields_from_export.sql
--   21. מיגרציה 020_rate_limit_rpc.sql
--   22. מיגרציה 021_global_daily_cap.sql
--   23. מיגרציה 022_measured_cost.sql
--   24. מיגרציה 023_speed_and_inversions.sql
--   25. מיגרציה 024_embedding_1536.sql
--   26. מיגרציה 025_knowledge_taxonomy.sql
--   27. מיגרציה 026_rate_limit_caps_not_arguments.sql
--   28. מיגרציה 027_ingest_rpc.sql
--   29. מיגרציה 028_match_knowledge.sql
--   30. מיגרציה 029_find_experiences.sql
--   31. מיגרציה 030_find_experiences_by_words.sql
--   32. מיגרציה 031_alias_candidates.sql
--   33. מיגרציה 032_alias_reject_useless.sql
--   34. מיגרציה 033_embedding_follows_content.sql
--   35. מיגרציה 034_eight_hebrew_names.sql
--   36. מיגרציה 034_sensitivities_vocabulary.sql
--   37. מיגרציה 035_sources_are_not_public.sql
--   38. מיגרציה 036_knowledge_is_not_public.sql
--   39. מיגרציה 037_bucket_daily_cap.sql
--   40. מיגרציה 038_max_height.sql
--   41. מיגרציה 039_sensitivity_flags_to_tim.sql
--   42. מיגרציה 040_sensitivity_four_states.sql
--   43. מיגרציה 041_park_intro.sql
--   44. מיגרציה 042_description_and_meet_location.sql
--   45. מיגרציה 043_park_candidates.sql
--   46. מיגרציה 044_turn_log.sql
--   47. מיגרציה 045_country.sql
--   48. מיגרציה 046_tester_note.sql
--   49. seed 010_reference.sql
--   50. seed 011_water_parks.sql
--   51. בלוק אימות — שאילתה אחת שמדווחת מה נוצר בפועל.
--
-- מה שאין כאן, בכוונה
--   apps/server/db/local/000_auth_shim.sql. הוא מפגם מקומי לסכמת auth. ב-Supabase
--   הסכמה הזו שייכת לפלטפורמה וכבר קיימת, והפיגום היה מתנגש בה.
--
-- אם משהו נופל
--   כל קובץ עטוף ב-BEGIN/COMMIT משלו, ולכן כישלון מגלגל אחורה רק את הקובץ
--   שנפל. אין מצב של מיגרציה חצי-מיושמת.
--
--   1. ב-Supabase Studio, הודעת השגיאה מופיעה למטה. הקובץ שנפל הוא הקובץ
--      שכותרתו האחרונה מופיעה מעל השגיאה — כל בלוק פותח בשורת
--      "-- מיגרציה: NNN_...". לשלוח לי את שם הקובץ ואת נוסח השגיאה.
--   2. כל מה שלפניו כבר בוצע והוא תקין. אין צורך להתחיל מהתחלה.
--   3. אחרי תיקון — להדביק רק את הבלוק שנפל ואת כל מה שאחריו.
--   4. אפשר תמיד להריץ את בלוק האימות שבסוף הקובץ לבדו, כדי לראות מה קיים.
--
--   ⚠️ אין להריץ את הקובץ כולו פעמיים. הרצה שנייה נעצרת מיד ב-001 עם
--   ERROR: type "authority_tier" already exists. זה לא נזק — הבלוק
--   התגלגל אחורה ושום דבר לא השתנה. זו פשוט הדרך של המסד להגיד
--   "אני כבר מותקן". במקרה כזה מריצים רק את בלוק האימות שבסוף.
--
-- ההרחבות
--   ב-Supabase ההרחבות יושבות בסכמת extensions ולא ב-public. מיגרציה 001
--   יוצרת את הסכמה אם היא חסרה, מתקינה לתוכה, ומוסיפה את extensions ל-
--   search_path — כי 002 משתמש ב-gin_trgm_ops ו-003 בטיפוס vector(1024)
--   בלי הסמכת סכמה. ב-Supabase pgcrypto כבר מותקנת שם, ו-
--   create extension if not exists פשוט מדלג עליה.
--
-- ==========================================================================

-- search_path מוגדר גם כאן, לפני הכול, כדי שהקובץ יעבוד גם אם מדביקים
-- אותו מאמצע. הוא נקבע שוב לפני כל בלוק, מאותה סיבה.
set search_path = public, extensions;


-- ==========================================================================
-- מיגרציה: 000_schema_migration.sql
-- ==========================================================================

set search_path = public, extensions;

-- 000 — יומן המיגרציות: מה רץ על המסד, ומתי (14.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 000 — יומן המיגרציות (14.09)
-- 🔵 **גרסה 2** — מוסיפה את המצב `verified`, ומשדרגת טבלה שכבר קיימת.
--    אם הרצת גרסה קודמת של הקובץ הזה — להריץ שוב. הוא בטוח להרצה חוזרת.
--
-- 🔴 **המסד אינו יודע אילו מ-45 המיגרציות רצו עליו.** הידע הזה חי
-- ברשימת השאילתות השמורות ב-SQL Editor ובהיסטוריית הצ'אט. זה עבד כל
-- עוד הרצנו קובץ ביום; זה נשבר ברגע שקובץ אחד ידולג, יורץ פעמיים, או
-- יתוקן אחרי שכבר רץ.
--
-- ⚠️ **ושאילתה שמורה אינה הרצה שהצליחה.** 044 יושבת ברשימה הזו, קיבלה
-- שם, הודבקה — ונפלה. מי שיקרא את הרשימה יראה אותה ויסיק שהיא רצה.
--
-- ── מפתח לפי שם קובץ, לא לפי מספר ─────────────────────────────────
-- 🔴 יש **שתי** מיגרציות 034: `034_eight_hebrew_names.sql` ו-
-- `034_sensitivities_vocabulary.sql`. מפתח לפי מספר היה מאבד אחת מהן
-- בשקט. השם המלא הוא המזהה.
--
-- ── `evidence` — שלושה מצבים, ולא שניים ───────────────────────────
-- ל-44 המיגרציות שכבר רצו אין רישום שנכתב בזמן ההרצה. אבל **יש להן
-- טביעות אצבע במסד עצמו** — עמודה, אילוץ, הערה על עמודה, או גוף
-- פונקציה. `verify-migration-log` בודק אותן אחת אחת.
--
-- 🔴 **ולכן שלושה מצבים, ולכל אחד מילה:**
--   `observed` — נרשם ברגע שהמיגרציה רצה.
--   `verified` — לא ראינו אותה רצה, אבל התוצאה שלה נמצאת במסד.
--   `assumed`  — הנחנו, ואיש לא בדק.
--
-- ⚠️ **וההפרדה בין השניים האחרונים היא כל העניין.** שורה שהייתה
-- נכתבת כ-`observed` בלי שאיש בדק הייתה בדיוק `NOT NULL DEFAULT`
-- על שדה שאיש לא בדק — התבנית שנספרה כאן שבע פעמים.

BEGIN;

set local search_path = public, extensions;

create table if not exists schema_migration (
  filename   text primary key,
  checksum   text not null,          -- sha256 של גוף הקובץ, בלי בלוק הרישום
  applied_at timestamptz not null default now(),
  applied_by text not null check (applied_by in ('sql-editor','ci','verify','backfill')),
  evidence   text not null check (evidence in ('observed','verified','assumed'))
);

comment on table schema_migration is
  'אילו מיגרציות רצו על המסד הזה. מפתח לפי שם קובץ — יש שתי 034.';
comment on column schema_migration.checksum is
  'sha256 של הקובץ בלי בלוק הרישום. שינוי בקובץ שכבר רץ נתפס כסטייה.';
comment on column schema_migration.evidence is
  'observed = נרשם בזמן ההרצה · verified = לא ראינו, אבל התוצאה נמצאת במסד · assumed = הנחנו, ואיש לא בדק.';

-- ── שדרוג טבלה קיימת ────────────────────────────────────────────────
-- 🔴 **`create table if not exists` אינו משנה טבלה שכבר קיימת.** אם
-- הורצה כאן גרסה מוקדמת של הקובץ, האילוצים שלה נשארו — ו-`verified`
-- היה נופל על אילוץ שאינו מכיר אותו.
--
-- ⚠️ **קרה בפועל:** גרסה ראשונה של הקובץ הזה הורצה עם שני מצבי ראיה
-- בלבד, ועם `backfill` כמקור. שתי השורות הבאות מעדכנות את האילוצים
-- במקום להניח שהטבלה חדשה. `backfill` נשאר מותר כי יש שורות שנושאות
-- אותו, ומחיקת ערך שקיים בנתונים אינה שדרוג — היא שבירה.
alter table schema_migration drop constraint if exists schema_migration_evidence_check;
alter table schema_migration add  constraint schema_migration_evidence_check
  check (evidence in ('observed','verified','assumed'));

alter table schema_migration drop constraint if exists schema_migration_applied_by_check;
alter table schema_migration add  constraint schema_migration_applied_by_check
  check (applied_by in ('sql-editor','ci','verify','backfill'));

-- ⚠️ הטבלה סגורה. היא נכתבת מה-SQL Editor או מ-CI, לא מהאפליקציה.
alter table schema_migration enable row level security;
alter table schema_migration force  row level security;
revoke all on schema_migration from anon, authenticated;

-- ── הרישום עצמו ─────────────────────────────────────────────────────
-- ⚠️ **upsert, ולא insert.** קובץ שרץ פעם שנייה (תיקון, הרצה חוזרת)
-- מעדכן את החתימה ואת הזמן במקום ליפול — ההרצה החוזרת היא עובדה,
-- והרישום צריך לשקף אותה ולא להתעלם ממנה.
--
-- 🔴 **ורישום בזמן הרצה דורס `verified`.** ראיה ישירה גוברת על בדיקה
-- עקיפה, לעולם לא להפך.
create or replace function public.record_migration(
  p_filename text,
  p_checksum text,
  p_by       text default 'sql-editor'
)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  insert into schema_migration (filename, checksum, applied_by, evidence)
  values (p_filename, p_checksum, p_by, 'observed')
  on conflict (filename) do update
    set checksum   = excluded.checksum,
        applied_at = now(),
        applied_by = excluded.applied_by,
        evidence   = 'observed';
$$;

-- 🔴 **בלי grant ל-anon.** האפליקציה לא רושמת מיגרציות. רק SQL Editor
-- ו-CI, ושניהם רצים כבעלים.
revoke all on function public.record_migration(text, text, text) from public;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('000_schema_migration.sql', 'sha256:8ce64729b52ffa50f9ceb0681e0b550f',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 001_extensions_and_taxonomy.sql
-- ==========================================================================

set search_path = public, extensions;

-- 001_extensions_and_taxonomy.sql
-- Park Day Companion — הרחבות ודומיינים
--
-- החלטה: ערכי ה-enum נאכפים ב-CHECK על עמודות text, ולא כטיפוסי enum מקומיים
-- של Postgres. הסיבה: הוספת ערך ל-enum מקומי אפשרית, אבל שינוי שם או הסרה
-- דורשים מיגרציה כואבת. CHECK מאפשר לשנות ערך במיגרציה אחת פשוטה.
-- מקור האמת הוא src/data/taxonomy.ts — הקבצים כאן חייבים להישאר תואמים לו.

BEGIN;

-- ── הרחבות ──────────────────────────────────────────────────────────
-- ב-Supabase ההרחבות יושבות בסכמת extensions ולא ב-public. מקומית הסכמה
-- הזו אינה קיימת, ולכן היא נוצרת כאן. הבדיקה נעשית ב-DO ולא ב-
-- create schema if not exists, כי האחרון בודק הרשאת CREATE על מסד הנתונים
-- לפני שהוא בודק קיום, ולכן היה יכול ליפול על סכמה שכבר קיימת.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    create schema extensions;
  end if;
end
$$;

-- create extension if not exists מתעלם מ-with schema כשההרחבה כבר קיימת
-- (הודעת notice, לא שגיאה). לכן שלוש השורות בטוחות גם ב-Supabase, שבו
-- pgcrypto כבר מותקנת ב-extensions, וגם מקומית, שבו אף אחת לא מותקנת.
create extension if not exists "pgcrypto" with schema extensions;  -- gen_random_uuid()
create extension if not exists "vector"   with schema extensions;  -- pgvector
create extension if not exists "pg_trgm"  with schema extensions;  -- דמיון תווים, פתרון חלקי להיעדר stemmer עברי

-- 002 כותב gin_trgm_ops ו-003 כותב vector(1024) בלי הסמכת סכמה. הם נפתרים
-- רק אם extensions נמצאת ב-search_path. ב-Supabase היא שם כברירת מחדל,
-- אבל ברירת מחדל אינה ערובה — כאן זה מפורש.
-- SET רגיל (לא SET LOCAL) שורד את ה-COMMIT ותקף לשאר הסשן.
set search_path = public, extensions;

-- ── דומיינים משותפים ────────────────────────────────────────────────
-- שימוש ב-domain ולא ב-CHECK חוזר: הגדרה אחת, נאכפת בכל טבלה שמשתמשת בה.

create domain authority_tier as text
  check (value in ('T1','T2','T3','T4','T5'));

create domain volatility_tier as text
  check (value in ('static','seasonal','volatile'));

create domain source_type as text
  check (value in ('official','blog','video','community'));

create domain locale_code as text
  check (value in ('he','en'));

create domain sensitivity_level as text
  check (value in ('none','low','medium','high'));

comment on domain authority_tier is
  'שכבת סמכות. T1/T2 לעולם אינם נסתרים על ידי T3-T5. ראה tim-retrieval-and-memory-architecture.md';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('001_extensions_and_taxonomy.sql', 'sha256:febd46240e77a8da36dea66f41ed0e65',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 002_content.sql
-- ==========================================================================

set search_path = public, extensions;

-- 002_content.sql
-- שכבת התוכן: destination → resort → park → land → experience
--
-- החלטת עיצוב מרכזית — עמודות מול JSONB:
--   כל שדה ש-search_experiences מסננת לפיו הוא **עמודה אמיתית עם אינדקס**.
--   כל שדה שרק מוצג ואף פעם לא מסונן יושב ב-JSONB.
--   הסיבה: פילטור על JSONB עובד אבל לא מקבל אינדקס טוב, ובדיוק השדות
--   האלה (אינטנסיביות, גובה, רגישויות) הם מה שמייצר את הערך של המוצר.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

create table destination (
  id            text primary key,
  name          text not null,
  name_i18n     jsonb not null default '{}'::jsonb,
  country_code  char(2) not null,
  timezone      text not null,
  is_active     boolean not null default false,
  sort_order    int not null default 0
);

create table resort (
  id                text primary key,
  destination_id    text not null references destination(id) on delete restrict,
  operator          text not null check (operator in ('disney','universal')),
  name              text not null,
  name_i18n         jsonb not null default '{}'::jsonb,
  skip_line_system  text not null check (skip_line_system in ('lightning_lane','express_pass')),
  sort_order        int not null default 0
);

create table park (
  id             text primary key,
  resort_id      text not null references resort(id) on delete restrict,
  name           text not null,
  short_name     text,
  name_i18n      jsonb not null default '{}'::jsonb,
  status         text not null default 'open'
                 check (status in ('open','coming_soon','closed')),
  typical_hours  jsonb not null default '{}'::jsonb,
  hero_image_url text,
  icon           text,
  sort_order     int not null default 0
);
create index park_resort_idx on park (resort_id);

create table land (
  id          text primary key,
  park_id     text not null references park(id) on delete cascade,
  name        text not null,
  name_i18n   jsonb not null default '{}'::jsonb,
  -- קירוב גיאוגרפי גס בלבד. מאפשר "סדר הגיוני לפי מיקום" בלי מפה ובלי גרף.
  zone        text check (zone in ('hub','north','south','east','west')),
  sort_order  int not null default 0,   -- סדר הליכה טבעי בפארק
  unique (park_id, name)
);
create index land_park_idx on land (park_id);

-- ── experience — ישות אחת למתקנים ולהופעות ──────────────────────────
create table experience (
  id          text primary key,          -- {resort}-{park}-{slug}. לעולם לא משתנה.
  park_id     text not null references park(id) on delete cascade,
  land_id     text references land(id) on delete set null,

  type        text not null check (type in
                ('attraction','show','parade','meet_greet','walkthrough','transport')),
  status      text not null default 'open' check (status in
                ('open','seasonal','temporarily_closed','coming_soon','closed')),

  name            text not null,                                  -- השם הרשמי באנגלית. קנוני.
  name_i18n       jsonb not null default '{}'::jsonb,             -- {"he":"..."} אופציונלי
  aliases         text[] not null default '{}',                   -- לקישור ישויות ולחיפוש
  aliases_i18n    jsonb not null default '{}'::jsonb,

  -- ── עובדות: עמודות מסוננות ──
  category    text not null check (category in
                ('dark_ride','coaster','simulator','water_ride','show','walkthrough',
                 'playground','meet_greet','transport','360_film')),
  opened_year       int check (opened_year between 1900 and 2100),
  duration_minutes  int check (duration_minutes > 0),
  intensity         int not null check (intensity between 1 and 4),
  height_requirement_cm int check (height_requirement_cm between 50 and 200),
  gets_wet    text not null default 'none'
              check (gets_wet in ('none','may_get_wet','may_get_soaked')),
  environment text check (environment in ('indoor','outdoor','mixed')),
  air_conditioned boolean,
  wheelchair  text check (wheelchair in ('full_access','must_transfer','not_accessible')),
  skip_line_system text not null default 'none' check (skip_line_system in
                ('none','lightning_lane_multi','lightning_lane_single',
                 'express_pass','virtual_queue')),
  skip_line_extra_cost boolean not null default false,
  popularity  int check (popularity between 1 and 5),

  -- ── רגישויות: בלוק נפרד, לא נגזר מ-intensity ──
  -- מתקן יכול להיות intensity=1 ובכל זאת בלתי נסבל. ראה סעיף 2.5 במסמך הסכמה.
  -- שדות בטיחות: T1 בלבד, לא ממקורות קהילתיים.
  sens_motion_sickness sensitivity_level not null default 'none',
  sens_enclosed_dark   boolean not null default false,
  sens_heights         boolean not null default false,
  sens_loud_sudden     boolean not null default false,
  sens_strobe          boolean not null default false,

  -- ── שאר העובדות: מוצג, לא מסונן ──
  intensity_factors jsonb not null default '{}'::jsonb,  -- inversions, max_speed_kmh, big_drops, spinning, loud
  type_data         jsonb not null default '{}'::jsonb,  -- show_times, runs_continuously, seasonal_window
  location          jsonb,                               -- ריק ב-V1. שמור ל-V1.2.

  -- ── דעה שאינה טקסט: אחת לכל השפות, לא מוכפלת ──
  verdict          text check (verdict in ('must_do','worth_it','if_time','skip')),
  recommendation   int check (recommendation between 1 and 5),
  best_time_of_day text check (best_time_of_day in
                     ('must_early','morning','noon','afternoon','evening','anytime','show_time')),

  -- ── טריות ──
  volatility     volatility_tier not null default 'static',
  last_verified  date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index experience_park_idx      on experience (park_id);
create index experience_land_idx      on experience (land_id);
create index experience_type_idx      on experience (type, status);
create index experience_intensity_idx on experience (intensity);
create index experience_height_idx    on experience (height_requirement_cm);
create index experience_sens_idx      on experience (sens_motion_sickness, sens_enclosed_dark);
create index experience_skipline_idx  on experience (skip_line_system);
-- קישור ישויות: חיפוש שם ואליאס. הצעד עם ההחזר הגבוה ביותר במנוע השליפה.
create index experience_aliases_idx   on experience using gin (aliases);
create index experience_name_trgm_idx on experience using gin (name gin_trgm_ops);

comment on column experience.sens_motion_sickness is
  'בחילה/מחלת תנועה. לא נגזר מ-intensity: סימולטור בעצימות 1 יכול להיות high.';

-- ── תוכן עריכתי: שורה לכל שפה, לא עמודה לכל שפה ──
-- הוספת אנגלית = הוספת שורות, לא מיגרציה של טבלה.
create table experience_editorial (
  experience_id text not null references experience(id) on delete cascade,
  locale        locale_code not null,
  summary       text,
  good_for      text[] not null default '{}',
  skip_if       text[] not null default '{}',
  tips          text[] not null default '{}',
  author        text,
  last_reviewed date,
  primary key (experience_id, locale)
);

create table experience_media (
  id            uuid primary key default gen_random_uuid(),
  experience_id text not null references experience(id) on delete cascade,
  kind          text not null check (kind in ('hero','gallery','video')),
  url           text,
  youtube_id    text,
  video_kind    text check (video_kind in ('pov','review','overview')),
  title_i18n    jsonb not null default '{}'::jsonb,
  alt_i18n      jsonb not null default '{}'::jsonb,
  credit        text,
  sort_order    int not null default 0,
  check (kind <> 'video' or youtube_id is not null),
  check (kind = 'video' or url is not null)
);
create index experience_media_exp_idx on experience_media (experience_id, kind);

-- מקורות אינם מטא-דאטה טכני — הם פיצ'ר. טים מצטט מהם.
create table experience_source (
  id            uuid primary key default gen_random_uuid(),
  experience_id text not null references experience(id) on delete cascade,
  title         text,
  url           text not null,
  kind          source_type not null,
  tier          authority_tier not null,
  retrieved_at  date
);
create index experience_source_exp_idx on experience_source (experience_id);

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('002_content.sql', 'sha256:007b31bbf386302575564d417f0f7a5f',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 003_knowledge.sql
-- ==========================================================================

set search_path = public, extensions;

-- 003_knowledge.sql
-- מאגר הידע הלא-מובנה: מה שנשלף ב-RAG.
--
-- שים לב להפרדה: עובדות קשות יושבות ב-experience ונשלפות דרך כלים.
-- כאן יושב רק מה שהוא פרוזה — דעה, טיפים, מדריכים, תוכן קהילתי.
-- ערבוב השניים הוא בדיוק הטעות שהארכיטקטורה נועדה למנוע.

-- ממד ה-embedding נגזר מהמודל. 1024 = Cohere embed-multilingual-v3.0.
-- שינוי מודל בעל ממד אחר מחייב מיגרציה — להכריע לפני שנבנים על זה.
BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

create table knowledge_doc (
  id            text primary key,               -- מזהה יציב מה-frontmatter. ingest אידמפוטנטי לפיו.
  title         text not null,
  doc_type      text not null check (doc_type in
                  ('guide','attraction_note','faq','policy','tip','community_qa')),
  authority_tier authority_tier not null,
  locale        locale_code not null default 'he',

  scope_resort  text references resort(id) on delete set null,
  scope_park    text references park(id) on delete set null,
  scope_experience text references experience(id) on delete set null,

  source_url    text,
  source_kind   source_type,
  volatility    volatility_tier not null default 'static',
  last_verified date,
  last_seen     date,                            -- לתפוגה של טיפים קהילתיים

  -- תוכן קהילתי אינו נכנס לאינדקס לפני אישור אדמין. אף פעם.
  review_status text not null default 'draft' check (review_status in
                  ('draft','pending_review','approved','rejected')),
  reviewed_by   uuid,
  reviewed_at   timestamptz,

  corroboration_count int not null default 1,    -- בכמה מקורות בלתי-תלויים חזר הטיפ
  submitted_by  uuid,

  body          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index knowledge_doc_status_idx on knowledge_doc (review_status, authority_tier);
create index knowledge_doc_scope_idx  on knowledge_doc (scope_park, scope_experience);

create table knowledge_chunk (
  id             uuid primary key default gen_random_uuid(),
  doc_id         text not null references knowledge_doc(id) on delete cascade,
  chunk_index    int not null,
  content        text not null,

  -- משוכפל מה-doc בכוונה: השליפה מסננת על השדות האלה, ו-join לכל שאילתה
  -- על טבלה קטנה הוא בזבוז. ingest אחראי לעקביות.
  authority_tier authority_tier not null,
  locale         locale_code not null,
  scope_park     text,
  scope_experience text,
  review_status  text not null,

  embedding      vector(1024),
  embedding_model text not null,   -- אסור לערבב מודלים באותו אינדקס. שאילתה במודל
                                   -- אחד מול מסמכים באחר מחזירה רעש בלי שום שגיאה.
  created_at     timestamptz not null default now(),
  unique (doc_id, chunk_index)
);

-- אין אינדקס ANN בכוונה. מתחת ל-10,000 שורות סריקה מדויקת מהירה יותר מ-HNSW
-- וגם לא מאבדת recall. להוסיף רק כשהקורפוס גדל — ראה נספח 6א במסמך השליפה.
create index knowledge_chunk_filter_idx on knowledge_chunk
  (review_status, authority_tier, locale, scope_park);
create index knowledge_chunk_exp_idx on knowledge_chunk (scope_experience);

-- תור אימות האדמין: אדם מאשר, לא רובוט מעדכן.
create view verification_queue as
  select 'experience' as kind, e.id, e.name as title,
         e.volatility, e.last_verified,
         current_date - e.last_verified as days_since
    from experience e
   where e.last_verified is null
      or (e.volatility = 'seasonal' and e.last_verified < current_date - interval '90 days')
      or (e.volatility = 'static'   and e.last_verified < current_date - interval '365 days')
  union all
  select 'knowledge', d.id, d.title, d.volatility, d.last_verified,
         current_date - d.last_verified
    from knowledge_doc d
   where d.review_status = 'approved'
     and (d.last_verified is null
       or (d.volatility = 'seasonal' and d.last_verified < current_date - interval '90 days')
       or (d.volatility = 'static'   and d.last_verified < current_date - interval '365 days'));

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('003_knowledge.sql', 'sha256:113dc2b23be1e8c5803b4d76200d22bd',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 004_users_trips.sql
-- ==========================================================================

set search_path = public, extensions;

-- 004_users_trips.sql
-- משתמשים, זיכרון פרופיל, וטיולים.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

create table profile (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user' check (role in ('user','admin')),
  display_name text,
  locale     locale_code not null default 'he',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── זיכרון פרופיל ───────────────────────────────────────────────────
-- כל עובדה היא שורה, לא עמודה. שלוש סיבות:
--   1. כל עובדה חייבת לשאת source/confidence/updated_at לחוד.
--   2. scope מתבטא מבנית: trip_id ריק = עובדה על האדם (נשארת תמיד),
--      trip_id מלא = עובדה על הנסיעה הזו. בלי זה הטיול הבא יורש תאריכים ישנים.
--   3. הוספת שדה חדש היא ערך ב-CHECK, לא ALTER TABLE.
-- הטיפוסיות מגיעה משכבת Zod באפליקציה. הטבלה קטנה וחסומה, ולכן
-- **נטענת במלואה בכל תור** — אין כאן שליפה סמנטית של עובדות על המשתמש.
create table profile_fact (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profile(id) on delete cascade,
  trip_id    uuid,                              -- null = scope:person, אחרת scope:trip
  key        text not null check (key in (
               'planner_type','sensitivities','party','split_logistics',
               'experience_by_resort','deliberate_non_planning','staying_at_park_hotel',
               'travel_dates','ticket_type','intensity_tolerance','mobility',
               'price_sensitivity','dietary')),
  value      jsonb not null,
  source     text not null check (source in ('stated','inferred')),
  confidence real not null default 1.0 check (confidence between 0 and 1),
  updated_at timestamptz not null default now(),
  unique (user_id, trip_id, key)
);
create index profile_fact_user_idx on profile_fact (user_id);

comment on table profile_fact is
  'עובדות מוקלדות על המשתמש. נטען במלואו לכל תור. לעולם לא זיכרון וקטורי.';
comment on column profile_fact.source is
  'inferred לעולם לא דורס stated. נאכף בשכבת האפליקציה.';

-- ── טיולים ──────────────────────────────────────────────────────────
create table trip (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profile(id) on delete cascade,
  name           text,
  destination_id text not null references destination(id),
  start_date     date,
  end_date       date,
  party          jsonb not null default '{}'::jsonb,   -- [{age, height_cm}]
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index trip_user_idx on trip (user_id);

create table trip_day (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid not null references trip(id) on delete cascade,
  day_index int not null,
  date      date not null,                       -- תמיד ISO. הפורמט הוא תצוגה בלבד.
  park_ids  text[] not null default '{}',        -- מערך מסודר: park-hopper. ריק = יום מנוחה.
  notes     text,
  unique (trip_id, day_index)
);
create index trip_day_trip_idx on trip_day (trip_id);

create table plan_item (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trip(id) on delete cascade,
  -- NULL = הפריט במאגר המשאלות, נבחר אך עוד לא שובץ ליום.
  -- זו ההחלטה שמפרידה בין "מה מעניין אותי" ל"מתי אעשה את זה".
  trip_day_id   uuid references trip_day(id) on delete set null,

  experience_id text references experience(id) on delete cascade,
  custom_title  text,

  priority        int check (priority between 1 and 5),
  time_preference jsonb,     -- {mode:'bucket'|'exact', bucket?, exact?}
  booking_note    text,      -- טקסט חופשי. ללא לוגיקה ב-V1.
  personal_notes  text,
  status        text not null default 'wishlist'
                check (status in ('wishlist','planned','done','skipped')),
  sort_order    int not null default 0,
  -- דריסה מפורשת של המשתמש. כל שאר העובדות נקראות דרך experience_id ולא מועתקות.
  overrides     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  check (experience_id is not null or custom_title is not null)
);
create index plan_item_trip_idx on plan_item (trip_id, trip_day_id);
create index plan_item_exp_idx  on plan_item (experience_id);

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('004_users_trips.sql', 'sha256:b5ef6a32ad6597498ce3e7a7335fcf6b',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 005_conversations.sql
-- ==========================================================================

set search_path = public, extensions;

-- 005_conversations.sql
-- שיחות טים + יומן השאלות שלא נענו.
--
-- היומן אינו לוג תפעולי — הוא מכשיר מדידה. רשימת השאלות שטים לא ידע
-- לענות עליהן היא מפת הדרכים של התוכן הבא, והיא רצה 24/7 על משתמשים
-- אמיתיים בזמן שהם באמת מתכננים.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

create table conversation (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profile(id) on delete cascade,
  trip_id    uuid references trip(id) on delete set null,
  title      text,
  summary    text,                    -- סיכום מתגלגל. שדה טקסט, לא נשלף וקטורית.
  locale     locale_code not null default 'he',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversation_user_idx on conversation (user_id, updated_at desc);

create table message (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversation(id) on delete cascade,
  role            text not null check (role in ('user','assistant','tool','system')),
  content         text,
  tool_calls      jsonb,     -- מה נקרא ועם אילו פרמטרים. עליו רצות בדיקות סט הזהב.
  citations       jsonb,     -- [{chunk_id|experience_id, tier, source_url}]
  -- טים מסמן בעצמו כשלא ידע לענות. זה מה שמזין את היומן.
  answered        boolean,
  refusal_reason  text check (refusal_reason in
                    ('no_data','unverified','safety_official_only','out_of_scope')),
  proactive       boolean not null default false,  -- שכבת "כדאי שתדע"
  model           text,
  input_tokens    int,
  output_tokens   int,
  created_at      timestamptz not null default now()
);
create index message_conv_idx on message (conversation_id, created_at);
create index message_unanswered_idx on message (created_at desc)
  where answered = false;

-- שאלות שטים לא ידע לענות עליהן, מוכנות להפוך לתוכן או למקרה בסט הזהב.
create view unanswered_questions as
  select m.id            as message_id,
         m.conversation_id,
         m.refusal_reason,
         m.created_at,
         (select prev.content
            from message prev
           where prev.conversation_id = m.conversation_id
             and prev.role = 'user'
             and prev.created_at < m.created_at
           order by prev.created_at desc
           limit 1) as question
    from message m
   where m.role = 'assistant'
     and m.answered = false;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('005_conversations.sql', 'sha256:449870fb67f196bbf5b03d1e6a57f82a',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 006_rls.sql
-- ==========================================================================

set search_path = public, extensions;

-- 006_rls.sql
-- הרשאות ברמת המסד, לא בבדיקות ב-UI. יותר בטוח ופחות קוד.
--
-- הכלל: שכבת התוכן פתוחה לקריאה לכולם — כולל מי שלא נרשם. חסימת התוכן
-- הייתה הורגת את ערוץ ה-SEO שהוא הנכס העיקרי. נרשמים רק כדי לשמור טיול.
-- אדמין אינו רואה טיולים או שיחות של משתמשים אחרים — החלטה מודעת.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from profile where id = auth.uid() and role = 'admin');
$$;

-- ── תוכן: קריאה לכולם, כתיבה לאדמין ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['destination','resort','park','land','experience',
                           'experience_editorial','experience_media','experience_source']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_read on %I for select using (true)', t, t);
    execute format('create policy %I_admin on %I for all using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;

-- ── ידע: רק מאושר נראה לציבור ──────────────────────────────────────
alter table knowledge_doc   enable row level security;
alter table knowledge_chunk enable row level security;

create policy knowledge_doc_read on knowledge_doc
  for select using (review_status = 'approved' or is_admin());
create policy knowledge_doc_submit on knowledge_doc
  for insert with check (auth.uid() = submitted_by and review_status = 'pending_review');
create policy knowledge_doc_admin on knowledge_doc
  for all using (is_admin()) with check (is_admin());

create policy knowledge_chunk_read on knowledge_chunk
  for select using (review_status = 'approved' or is_admin());
create policy knowledge_chunk_admin on knowledge_chunk
  for all using (is_admin()) with check (is_admin());

-- ── פרופיל, טיולים, שיחות: הבעלים בלבד ─────────────────────────────
alter table profile enable row level security;
create policy profile_self on profile
  for all using (id = auth.uid()) with check (id = auth.uid());

alter table profile_fact enable row level security;
create policy profile_fact_self on profile_fact
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table trip enable row level security;
create policy trip_self on trip
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table trip_day enable row level security;
create policy trip_day_self on trip_day for all
  using (exists (select 1 from trip where trip.id = trip_day.trip_id and trip.user_id = auth.uid()))
  with check (exists (select 1 from trip where trip.id = trip_day.trip_id and trip.user_id = auth.uid()));

alter table plan_item enable row level security;
create policy plan_item_self on plan_item for all
  using (exists (select 1 from trip where trip.id = plan_item.trip_id and trip.user_id = auth.uid()))
  with check (exists (select 1 from trip where trip.id = plan_item.trip_id and trip.user_id = auth.uid()));

alter table conversation enable row level security;
create policy conversation_self on conversation
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table message enable row level security;
create policy message_self on message for all
  using (exists (select 1 from conversation c where c.id = message.conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from conversation c where c.id = message.conversation_id and c.user_id = auth.uid()));

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('006_rls.sql', 'sha256:e2181e2c7d0f8293e7372df689e708f0',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 007_content_fields.sql
-- ==========================================================================

set search_path = public, extensions;

-- 007_content_fields.sql
-- שדות התוכן שנגזרו מהמחקר ומהחלטות איסוף המידע.
-- מחליף כל גרסה מוקדמת של 007. מיישם את park-day-companion-data-spec-v2.md.

-- 1 ─ בחילה: לא רמת חומרה, ולא אזהרת הבטיחות המשפטית של דיסני ---------------
-- הגרסה הקודמת (official_motion_sickness_warning) סימנה בפועל את בלוק
-- האזהרה הכללי שדיסני מדביקה למחלקת מתקנים שלמה, ולכן לא אמרה דבר על
-- הסיכוי לבחילה. השדה הנוכחי נקבע משני מקורות איכותיים שמדרגים בחילה בפועל.
BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table experience drop column if exists sens_motion_sickness;

alter table experience
  add column motion_sickness_warning text
    check (motion_sickness_warning in ('true','false','na'));

comment on column experience.motion_sickness_warning is
  'אינדיקציה אמינה שהמתקן עלול להבחיל. נקבע משני מקורות איכותיים (TouringPlans, Orlando Informer וכו''), לא מאזהרת הבטיחות הכללית. NULL = אין מספיק מידע. השדה יצא מהחרגת ה-T1.';

-- 2 ─ שני מאפיינים שתומכים בקביעת הבחילה --------------------------------------
alter table experience
  add column is_motion_simulator text check (is_motion_simulator in ('true','false','na')),
  add column uses_large_screens_or_3d text check (uses_large_screens_or_3d in ('true','false','na'));

-- 3 ─ מאפיינים מכניים כעמודות, וארבעת-מצבים ------------------------------------
-- big_drops ו-spinning היו מפתחות בתוך intensity_factors. הם נדרשים ב-Export
-- וב-importer, ולכן הופכים לעמודות אמיתיות. boolean מחזיק שלושה מצבים ואינו
-- מבחין בין "לא ידוע" ל"לא רלוונטי" — ולכן text עם CHECK.
alter table experience
  add column big_drops text check (big_drops in ('true','false','na')),
  add column spinning  text check (spinning  in ('true','false','na'));

alter table experience
  alter column air_conditioned type text using (case when air_conditioned is null then null when air_conditioned then 'true' else 'false' end);
alter table experience
  add constraint experience_air_conditioned_check check (air_conditioned in ('true','false','na'));

-- 4 ─ נגישות: שלושה ערכים → חמישה --------------------------------------------
-- כדי לא לאבד הבחנות שקיימות במקורות הרשמיים.
alter table experience drop constraint if exists experience_wheelchair_check;
alter table experience add constraint experience_wheelchair_check check (wheelchair in (
  'remain_in_wheelchair','transfer_ecv_to_wheelchair','transfer_to_ride_vehicle',
  'transfer_wheelchair_then_ride','must_be_ambulatory'));

-- 5 ─ ארבעת דגלי הרגישות יורדים מהיקף שלב 1 -----------------------------------
-- נשארים בסכמה, ריקים, ואינם נחשפים בטקסונומיה, בכלים או בממשק.
comment on column experience.sens_enclosed_dark is 'לא בהיקף שלב 1. לא לאסוף, לא לחשוף.';
comment on column experience.sens_heights       is 'לא בהיקף שלב 1. לא לאסוף, לא לחשוף.';
comment on column experience.sens_loud_sudden   is 'לא בהיקף שלב 1. לא לאסוף, לא לחשוף.';
comment on column experience.sens_strobe        is 'לא בהיקף שלב 1. לא לאסוף, לא לחשוף.';

create index experience_motion_sickness_idx on experience (motion_sickness_warning);

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('007_content_fields.sql', 'sha256:ba04dc1d8636c84d0e41db0bf0159584',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 008_profile_axes.sql
-- ==========================================================================

set search_path = public, extensions;

-- 008_profile_axes.sql
-- צירי הפרופיל מהמחקר (park-day-companion-user-profile-axes.md).
--
-- שלושה שינויים. אף אחד מהם אינו מבני — הטבלה כבר בנויה נכון למודל
-- של שדות עצמאיים, ולא לשיוך לפרסונה אחת.

-- ── 1. הרחבת רשימת המפתחות ──────────────────────────────────────────
-- הרשימה היא allowlist בכוונה: מפתח חדש מחייב מיגרציה, ולכן אי אפשר
-- להמציא שדה פרופיל בשקט בקוד.
BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

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

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('008_profile_axes.sql', 'sha256:a9ad8de88a58e9334065170cb6938e7f',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 009_plan_item_interest.sql
-- ==========================================================================

set search_path = public, extensions;

-- 009_plan_item_interest.sql
-- כן / לא / אולי — כוונת המשתמש לגבי מתקן.
--
-- נפרד מ-status בכוונה. status הוא מחזור חיים (wishlist→planned→done),
-- ו-interest הוא כוונה. "לא" הוא לא היעדר "כן": דחייה מפורשת היא מידע
-- שמנוע המסלול חייב לכבד, אחרת הוא יציע שוב את מה שכבר נדחה.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table plan_item
  add column interest text check (interest in ('yes','maybe','no'));

comment on column plan_item.interest is
  'כוונת המשתמש מהגיליון. NULL = טרם סומן. no = נדחה מפורשות, לעולם לא יוצע במסלול.';

-- עוגן זמן: הזמנת דילוג-תור שהמשתמש הזין ידנית. אין אינטגרציה עם
-- אפליקציות הפארקים, ולכן זהו קלט ידני שהמנוע מתייחס אליו כאילוץ קשיח.
alter table plan_item
  add column anchor_time time;

comment on column plan_item.anchor_time is
  'שעת הזמנה שהמשתמש הזין (Lightning Lane / Express). אילוץ קשיח למנוע המסלול.';

create index plan_item_interest_idx on plan_item (trip_id, interest);

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('009_plan_item_interest.sql', 'sha256:5f6beab9801549e1a1b6edce10191fc4',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 010_trip_members.sql
-- ==========================================================================

set search_path = public, extensions;

-- 010_trip_members.sql
-- הרכב הקבוצה: שורה לכל חבר/ה, לא מערך בתוך שדה אחד.
--
-- הדרישה שהוגדרה: עדכון על member אחד לא דורס את השאר, ו-stated גובר על
-- inferred ברזולוציה של member בודד. שורה לכל member נותנת את זה בחינם —
-- עדכון של הילד האמצעי הוא UPDATE על שורה אחת. במערך jsonb היה צריך
-- לממש את זה ידנית, וכל עדכון היה קריאה-שינוי-כתיבה של כל המערך.
--
-- העיקרון שנקבע נשמר: אין שדות-סיכום ברמת קבוצה ("יש ילד קטן?").
-- הם נגזרים בזמן ריצה מהשורות כאן, כדי שלא ייווצר מקור אמת כפול.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

create table trip_member (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trip(id) on delete cascade,
  member_key text not null,                    -- 'm1' וכו', יציב לאורך הטיול
  role       text not null check (role in ('adult','child')),

  -- גיל נאסף לכולם. גובה נאסף **רק מתחת לגיל 14** — מבוגרים עוברים כל
  -- מגבלה, ולכן השאלה מיותרת. התנאי נגזר מ-age בזמן ריצה, אין דגל נפרד.
  -- מינימיזציה: גיל כמספר ולא תאריך לידה, ואין שדה שם — הנתון הוא
  -- מגבלה טכנית של נוסע, לא פרופיל של ילד.
  age        int check (age between 0 and 120),
  height_cm  int check (height_cm between 30 and 220),

  intensity_tolerance text check (intensity_tolerance in ('low','medium','high','extreme')),
  sensitivities       text[] not null default '{}',   -- motion_sickness · fear_dark · fear_heights · claustrophobia

  -- מקור ורמת ביטחון **לכל שדה בנפרד**, לא לשורה כולה:
  -- {"intensity_tolerance": {"source":"stated","confidence":1,"updated_at":"..."}}
  field_provenance jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, member_key)
);

create index trip_member_trip_idx on trip_member (trip_id);

comment on table trip_member is
  'חבר/ה אחד/ת בקבוצה. שורה לכל אחד/ת כדי שעדכון בודד לא ידרוס את השאר.';
comment on column trip_member.field_provenance is
  'source/confidence לכל שדה בנפרד. stated גובר על inferred ברזולוציה של שדה בודד.';
comment on column trip_member.height_cm is
  'נאסף באונבורדינג. משמש לזכאות למתקן ול-Child Swap. ניתן לעריכה ומחיקה על ידי המשתמש.';

alter table trip_member enable row level security;
create policy trip_member_self on trip_member for all
  using (exists (select 1 from trip where trip.id = trip_member.trip_id and trip.user_id = auth.uid()))
  with check (exists (select 1 from trip where trip.id = trip_member.trip_id and trip.user_id = auth.uid()));

-- הרכב הקבוצה יוצא מ-profile_fact: הוא חי בטבלה משלו.
alter table profile_fact drop constraint if exists profile_fact_key_check;
alter table profile_fact add constraint profile_fact_key_check check (key in (
  'planner_type','sensitivities','split_logistics',
  'experience_by_resort','deliberate_non_planning','staying_at_park_hotel',
  'travel_dates','ticket_type','mobility','price_sensitivity','dietary',
  'planning_focus_fit','planning_focus_cost','planning_depth',
  'park_style','lodging_pref','persona_labels'
));

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('010_trip_members.sql', 'sha256:96fa5d133486ccd82b91215c7587c92d',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 011_conformance_fixes.sql
-- ==========================================================================

set search_path = public, extensions;

-- 011_conformance_fixes.sql
-- ארבעה ממצאים שהתגלו כשנטענו 232 שורות אמיתיות למסד ונדחו 125.
-- הבדיקה הזו — לתת למסד לפסוק במקום להשוות בעין — היא שמצאה אותם.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

-- 1 ─ intensity מותר להיות NULL --------------------------------------------
-- הכלל שסוכם: "מתקן בלי דירוג מוצג עם עובדות וציון מפורש שאין דירוג".
-- NOT NULL סתר אותו ישירות — אי אפשר להציג מה שאי אפשר לשמור.
alter table experience alter column intensity drop not null;

comment on column experience.intensity is
  'NULL = אין דירוג. מוצג במפורש כ"אין דירוג", ו**לעולם אינו נכלל בתוצאות של פילטר עוצמה** — לא בשקט ולא כברירת מחדל.';

-- 2 ─ gets_wet: אין ברירת מחדל ---------------------------------------------
-- 'none' כברירת מחדל הפך "לא נבדק" ל"נבדק ואינו מרטיב", בניגוד לכלל
-- "שדה ריק אינו שדה שאין לו ערך".
alter table experience alter column gets_wet drop default;
alter table experience alter column gets_wet drop not null;

comment on column experience.gets_wet is
  'NULL = לא נבדק. ''none'' = נבדק ונמצא שאינו מרטיב. שני מצבים שונים.';

-- 3 ─ סוג הפארק: נושא מול מים ------------------------------------------------
-- הייצוא נושא Park Type, ולא הייתה לו עמודה. פארקי המים דורשים טיפול
-- שונה (gets_wet חסר משמעות, air_conditioned לא רלוונטי).
alter table park add column park_kind text not null default 'theme'
  check (park_kind in ('theme','water'));
alter table park alter column park_kind drop default;

-- 4 ─ אותם ארבעה דגלי רגישות שיצאו מהיקף שלב 1 --------------------------------
-- היו NOT NULL DEFAULT false, כלומר "נבדק ואין" — בעוד שהם כלל לא נאספים.
alter table experience alter column sens_enclosed_dark drop not null;
alter table experience alter column sens_enclosed_dark drop default;
alter table experience alter column sens_heights       drop not null;
alter table experience alter column sens_heights       drop default;
alter table experience alter column sens_loud_sudden   drop not null;
alter table experience alter column sens_loud_sudden   drop default;
alter table experience alter column sens_strobe        drop not null;
alter table experience alter column sens_strobe        drop default;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('011_conformance_fixes.sql', 'sha256:b1281393d538698f09aaba3699ba166c',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 012_height_none.sql
-- ==========================================================================

set search_path = public, extensions;

-- 012_height_none.sql
-- "אין מגבלת גובה" הוא ערך, לא היעדר ערך.
--
-- הסוכן מילא 136 שורות ב-'none' — כלומר **נבדק, ואין מגבלה**. העמודה היא
-- integer, ולכן הערך הזה לא יכול להיכנס, ו-NULL היה מוחק את ההבחנה בין
-- "נבדק ואין" ל"לא נבדק". זו אותה משפחת באגים של gets_wet ושל ארבעת
-- דגלי הרגישות.
--
-- הפתרון: 0 הוא הערך הנכון ולא מספר קסם — הגובה המזערי לעלייה הוא באמת
-- אפס. ⚠️ **אסור להציג אותו כמספר.** ב-UI: "אין מגבלת גובה".

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table experience drop constraint experience_height_requirement_cm_check;
alter table experience add constraint experience_height_requirement_cm_check
  check (height_requirement_cm = 0
      or (height_requirement_cm >= 50 and height_requirement_cm <= 200));

comment on column experience.height_requirement_cm is
  '0 = נבדק, אין מגבלת גובה (מוצג כטקסט, לעולם לא כמספר). NULL = לא נבדק. 50-200 = המגבלה בפועל.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('012_height_none.sql', 'sha256:32705b093ef3b15f4b1dab642ef86294',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 013_scenic_ride.sql
-- ==========================================================================

set search_path = public, extensions;

-- 013_scenic_ride.sql
-- שינוי שם קטגוריה: transport → scenic_ride.
--
-- למה: השם "transport" קרא כאילו הוא עונה על "איך מגיעים מפארק לפארק".
-- הוא לא. חמש השורות שנפלו אליו — Hogwarts Express (×2), PeopleMover,
-- Wildlife Express Train, ורכבל בליזרד ביץ׳ — הן **אטרקציות** שעומדים
-- להן בתור ונהנים מהן, שהצורה שלהן היא כלי רכב שנוסע.
--
-- הסיכון שהשם ייצר: משתמש שואל "איך מגיעים לאפקוט", וטים עונה
-- "PeopleMover". התחבורה האמיתית בפארקים — אוטובוסים, מונורייל, סקיילינר,
-- מעבורות — **אינה בטבלה הזו בכלל.** היא תוכן לוגיסטי בשכבת הידע.
--
-- ו-type: חמש השורות הופכות ל-'attraction'. הן אטרקציות. 'transport'
-- יוצא מרשימת ה-type לגמרי, כי אין דבר כזה במוצר.
--
-- הערה על Hogwarts Express: הוא באמת גם הדרך היחידה לעבור בין שני פארקי
-- יוניברסל, ודורש כרטיס Park-to-Park. זו עובדה חשובה — ומקומה בשכבת
-- הידע ובעריכה, לא בקטגוריה. הקטגוריה מתארת צורה, לא לוגיסטיקה.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table experience drop constraint experience_category_check;
update experience set category = 'scenic_ride' where category = 'transport';
alter table experience add constraint experience_category_check
  check (category in ('dark_ride','coaster','simulator','water_ride','show',
                      'walkthrough','playground','meet_greet','scenic_ride','360_film'));

alter table experience drop constraint experience_type_check;
update experience set type = 'attraction' where type = 'transport';
alter table experience add constraint experience_type_check
  check (type in ('attraction','show','parade','meet_greet','walkthrough'));

comment on column experience.category is
  'צורת החוויה. scenic_ride = נוסעים בכלי רכב והנוף הוא העניין — לא תחבורה בפארק.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('013_scenic_ride.sql', 'sha256:537b8b77b11e65ad212fad1550c6d577',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 014_gets_wet_na.sql
-- ==========================================================================

set search_path = public, extensions;

-- 014_gets_wet_na.sql
-- `gets_wet` מקבל ערך רביעי: 'na'.
--
-- למה: המאסטר מבחין בין ארבעה מצבים, והמסד ידע להחזיק רק שלושה.
--   ערך  = נבדק, וזו התשובה
--   'none' = נבדק, אינו מרטיב
--   'na'   = **מופע במה. השאלה לא רלוונטית.**  ← זה מה שנפל
--   NULL   = לא נבדק
--
-- בלי הערך הזה 66 שורות הבידור נטענו כ-NULL, כלומר "לא בדקנו" —
-- וטים היה אומר "אין לי מידע" על שאלה שיש לה תשובה ברורה.
-- זו אותה משפחת באגים, הפעם בשכבת המסד.
--
-- ⚠️ אין ברירת מחדל ואין NOT NULL. NULL נשאר "לא נבדק".

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table experience drop constraint experience_gets_wet_check;
alter table experience add constraint experience_gets_wet_check
  check (gets_wet in ('none','may_get_wet','may_get_soaked','na'));

comment on column experience.gets_wet is
  'ערך = נבדק · ''none'' = נבדק ואינו מרטיב · ''na'' = לא רלוונטי (מופע) · NULL = לא נבדק. ארבעה מצבים, לא שלושה.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('014_gets_wet_na.sql', 'sha256:e1c81fbefd428f39dd19e287bb2c470d',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 015_trip_park_days.sql
-- ==========================================================================

set search_path = public, extensions;

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


-- ==========================================================================
-- מיגרציה: 016_skip_line_neutral.sql
-- ==========================================================================

set search_path = public, extensions;

-- 016_skip_line_neutral.sql
-- skip_line_system — אוצר מילים ניטרלי למפעיל, ו-NULL מותר.
--
-- ⚠️ השם הוא מה שגרם לבאג. `Lightning Lane` הוא שם המוצר של דיסני, אבל
-- העמודה שימשה כשדה הכללי של שני המפעילים. ליוניברסל אין Lightning Lane —
-- יש להם Universal Express — ולכן `N/A` בעמודת המקור של דיסני היה *נכון*
-- לכל 101 שורות יוניברסל, והמידע שלהן ישב כל הזמן בעמודה אחרת.
--
-- זו הפעם החמישית לאותה תבנית: `transport` שנראה כמו תחבורה בפארק,
-- `dark_ride` שנראה כמו מפחיד, הבלוק המשפטי של דיסני שנראה כמו סיכון
-- בחילה. אינדיקטור שנראה כמו הדבר ואינו הדבר. הערכים כאן נקראים על שם
-- מה שהם, ולא על שם המוצר של מפעיל אחד.
--
-- שלושת המצבים:
--   'none'  — נבדק, ואין מוצר דילוג
--   ערך     — נבדק, וזה המוצר
--   NULL    — לא נבדק
--
-- הסרנו את 'virtual_queue' מאוצר המילים. אף שורה לא השתמשה בו, והייצוא
-- אינו נושא אותו. אם יידרש — מיגרציה של שורה אחת.

BEGIN;

set local search_path = public, extensions;

alter table experience alter column skip_line_system drop not null;
alter table experience alter column skip_line_system drop default;

alter table experience drop constraint if exists experience_skip_line_system_check;

-- כל השורות מוחזרות ל-NULL. הן מעולם לא נטענו מנתונים — 'none' הגיע
-- מברירת המחדל של העמודה, כלומר המסד הצהיר "נבדק ואין מוצר דילוג" על 232
-- מתקנים שאיש לא בדק. זו בדיוק ההצהרה השקטה שהמיגרציה הזו מבטלת.
-- קובץ התוכן ימלא מחדש את מה שידוע.
update experience set skip_line_system = null;

alter table experience add constraint experience_skip_line_system_check
  check (skip_line_system in ('multi_pass','single_pass','express','none'));

comment on column experience.skip_line_system is
  'מוצר דילוג בתור, בשם ניטרלי למפעיל. multi_pass/single_pass = דיסני · express = יוניברסל · none = נבדק ואין · NULL = לא נבדק, ולעולם אינו "אין".';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('016_skip_line_neutral.sql', 'sha256:9a5c76a1bd5fd8c4ec7f34c188111e6e',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 017_drop_skip_line_extra_cost.sql
-- ==========================================================================

set search_path = public, extensions;

-- 017_drop_skip_line_extra_cost.sql
-- העמודה מוסרת. היא אינה שדה, היא נגזרת.
--
-- זו אינה בעיית ברירת מחדל אלא כפילות. `skip_line_extra_cost` נגזרת
-- במלואה מ-`skip_line_system`, בלי חריג אחד:
--
--     single_pass → true   (Single Pass *הוא* התשלום מעבר ל-Multi Pass)
--     multi_pass  → false
--     express     → false
--     none        → false
--     NULL        → NULL   ← וזה העיקר
--
-- אומת על 232 השורות: `extraCost = true` אם ורק אם `Single Pass`. אפס חריגים.
--
-- ⚠️ ולמה nullable לא היה מספיק: העמודה הישנה החזיקה `false` גם ב-176
-- השורות שבהן לא היה מידע — כלומר "נבדק, אין עלות נוספת" על 74 מתקנים
-- שאיש לא בדק. הפיכתה ל-nullable הייתה משמרת מקום שני שיכול לסתור את
-- הראשון. שדה אחד מאוחסן, השאר נגזרים ממנו.
--
-- 📌 הסייג שכדאי שיישאר כתוב: הגזירה נכונה **בהגדרה** במבנה המוצרים של
-- דיסני היום. אם דיסני תשנה את המבנה, עמודה נגזרת תישבר **בקול** —
-- שאילתה תיפול, מיגרציה תידרש. חמש עמודות שנכתבות ביד היו משקרות בשקט.
-- זה ההבדל, וזו הסיבה לגזירה.
--
-- להחזרה כעמודה נגזרת, אם תידרש שאילתה עליה:
--
--   alter table experience add column skip_line_extra_cost boolean
--     generated always as (
--       case when skip_line_system in ('multi_pass','single_pass')
--            then skip_line_system = 'single_pass' end
--     ) stored;
--
-- ⚠️ ולא `skip_line_system = 'single_pass'` לבדו. הביטוי הפשוט מחזיר
-- `false` ל-`express`, כלומר "אין עלות נוספת מעבר ל-Multi Pass" על שורות
-- יוניברסל — שם אין Multi Pass והשאלה כלל לא רלוונטית. אותה תשובה שקרית
-- בדיוק שהעמודה הישנה נתנה, רק בלבוש של נגזרת.
--
-- הסייג הזה חל גם על `none`, ולא רק על `express`: מתקן דיסני בלי מוצר
-- Lightning Lane כלל אינו נשאל "האם יש עלות מעבר ל-Multi Pass". השאלה
-- משמעותית רק היכן שקיימת מדרגת Multi Pass — כלומר `multi_pass` או
-- `single_pass`. בכל השאר `NULL`, כלומר "לא רלוונטי", ולא "לא".
--
-- ה-CASE בלי ELSE מחזיר NULL, וזה בדיוק ההתנהגות הרצויה.

BEGIN;

set local search_path = public, extensions;

alter table experience drop column if exists skip_line_extra_cost;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('017_drop_skip_line_extra_cost.sql', 'sha256:6f77d1fab9c67752db3c52674f336155',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 018_rate_limit.sql
-- ==========================================================================

set search_path = public, extensions;

-- 018_rate_limit.sql
-- דלי הגבלת קצב לנקודת הקצה של המודל.
--
-- ⚠️ זו ההגנה האמיתית על נקודת קצה שעולה כסף. הרשמה עם מייל אינה הגנה
-- מבוטים — בוט פותח תיבת דואר. מה שמגן הוא גג לכל דלי בחלון זמן, בשרת.
--
-- אין כאן כתובות IP. הדלי הוא גיבוב SHA-256 של הכתובת עם מלח, ולכן אי
-- אפשר לקרוא ממנו מי ביקר. זה מספיק להגבלה ולא מספיק למעקב, וזה בדיוק
-- מה שרוצים.

BEGIN;

set local search_path = public, extensions;

create table if not exists api_call (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null,
  created_at timestamptz not null default now()
);

-- השאילתה היחידה היא "כמה בדלי הזה מאז X", ולכן זה האינדקס.
create index if not exists api_call_bucket_time_idx on api_call (bucket, created_at desc);

-- RLS פעיל ובלי אף מדיניות: אין דרך להגיע לטבלה עם מפתח anon, לא לקריאה
-- ולא לכתיבה. רק service_role — כלומר רק Edge Function — נוגע בה.
alter table api_call enable row level security;

comment on table api_call is
  'דלי הגבלת קצב. bucket הוא גיבוב של כתובת עם מלח, לא הכתובת. שורות ישנות מ-24 שעות חסרות ערך וניתן למחוק אותן.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('018_rate_limit.sql', 'sha256:0e6a6814952cf9f9e553c9e2549d0f32',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 019_content_fields_from_export.sql
-- ==========================================================================

set search_path = public, extensions;

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


-- ==========================================================================
-- מיגרציה: 020_rate_limit_rpc.sql
-- ==========================================================================

set search_path = public, extensions;

-- 020_rate_limit_rpc.sql
-- ההגבלה עוברת לפונקציה במסד. נקודת הקצה מפסיקה להיות תלויה ב-service_role.
--
-- ⚠️ למה: האבחון החזיר 403 ולא 401. ההבדל מכריע — 401 פירושו "המפתח לא
-- התקבל", ו-403 פירושו "התקבל, אבל אין הרשאה". כלומר הבקשה כן אומתה,
-- והתפקיד שהיא נפתרה אליו אינו service_role ולכן RLS חסם אותה, כמתוכנן.
--
-- וגם: המפתחות שהוזרקו הם באורך 41 ו-46 תווים. JWT הוא כ-200. הפרויקט על
-- מערכת המפתחות החדשה, ואיני יכול לאמת מכאן לאיזה תפקיד כל אחד נפתר.
-- לכן במקום לנחש — הפונקציה הזו עובדת ללא תלות בתפקיד.
--
-- security definer: היא רצה בהרשאות הבעלים ולכן עוקפת RLS מבפנים, והטבלה
-- נשארת סגורה לחלוטין מבחוץ. משטח החשיפה היחיד הוא הפונקציה הזו, שמקבלת
-- מחרוזת ומחזירה כן/לא.
--
-- ובונוס שלא היה קודם: הספירה וההכנסה אטומיות. בגרסה הקודמת היו שתי
-- בקשות נפרדות, ושתי קריאות במקביל יכלו לעבור את הגג יחד.

BEGIN;

set local search_path = public, extensions;

create or replace function public.check_rate_limit(
  p_bucket   text,
  p_window   int default 60,   -- דקות
  p_max      int default 20
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  used int;
begin
  if p_bucket is null or length(p_bucket) < 8 then
    raise exception 'bucket חסר או קצר מדי';
  end if;

  select count(*) into used
  from api_call
  where bucket = p_bucket
    and created_at > now() - make_interval(mins => p_window);

  if used >= p_max then
    return false;
  end if;

  insert into api_call (bucket) values (p_bucket);

  -- ניקוי בתוך אותה קריאה. שורות ישנות משני חלונות חסרות ערך — הספירה
  -- ממילא מסננת אותן — והן מה שהיה גורם לטבלה לגדול לנצח.
  delete from api_call where created_at < now() - make_interval(mins => p_window * 2);

  return true;
end
$$;

-- מי שאינו מזוהה יכול לקרוא לפונקציה, ולא לגעת בטבלה. זה כל ההבדל.
revoke all on function public.check_rate_limit(text, int, int) from public;

-- ההענקה נעשית רק לתפקידים שקיימים בפועל. ב-Supabase שלושתם קיימים;
-- במסד מקומי נקי אין service_role, ו-grant לתפקיד חסר מפיל את המיגרציה
-- כולה. זה הכשיל אותה כאן, לא בשדה.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.check_rate_limit(text, int, int) to %I', r);
    end if;
  end loop;
end
$$;

comment on function public.check_rate_limit(text, int, int) is
  'גג קריאות לדלי בחלון זמן. אטומית. security definer כדי שנקודת הקצה לא תזדקק ל-service_role — 403 מ-PostgREST הראה שהתפקיד אינו נפתר לשם.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('020_rate_limit_rpc.sql', 'sha256:2b5f1dc15ec0cd8a51ead08816057caa',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 021_global_daily_cap.sql
-- ==========================================================================

set search_path = public, extensions;

-- 021_global_daily_cap.sql
-- גדר יומי גלובלי, בנוסף לגדר לכל מבקרת.
--
-- ⚠️ הבעיה שזה פותר: הגדר הקיים מבוסס על דלי לכל כתובת. מאה מבקרות =
-- מאה דליים = פי מאה קריאות. הוא מגן מפני התעללות, לא מפני הצלחה.
--
-- ובלי גדר גלובלי, מה שעוצר הוא תקרת החיוב של גוגל — וכשהיא נוגעת, טים
-- נכבה לכולן עד סוף החודש, בלי הודעה ובלי שנדע. יום אחד יכול לאכול חודש.
--
-- המספרים, מחושבים ולא מנוחשים:
--   עלות הודעה ≈ 0.023 ש"ח (קלט 6 ש"ח/מיליון · פלט 36 ש"ח/מיליון,
--   והפלט הוא 94% מהעלות).
--   600 ליום = כ-14 ש"ח ליום במקרה הגרוע — כלומר יום בריחה אחד אינו
--   מוחק את החודש, ויום דמו מלא (כ-550) עדיין עובר.
--
-- ⚠️ ההחזרה משתנה מבוליאני לטקסט, כדי שנקודת הקצה תדע **איזה** גדר נגע
-- ותאמר למשתמש את הדבר הנכון. "נסי בעוד שעה" ו"נסי מחר" אינם אותה
-- הודעה, וסתימה גורפת היא בדיוק סוג הכשל השקט שנמנע ממנו.

BEGIN;

set local search_path = public, extensions;

drop function if exists public.check_rate_limit(text, int, int);

-- מקור אמת אחד לגובה הגדר. המספר הופיע קודם גם בברירת המחדל של הפונקציה
-- וגם בתצוגה — שני מספרים שאפשר לשנות אחד מהם ולא את השני, וזו בדיוק
-- הצורה שבה גדר מפסיקה להיות מה שכתוב עליה.
create or replace function public.rate_limit_daily_cap() returns int
language sql immutable parallel safe
as $$ select 600 $$;

create or replace function public.check_rate_limit(
  p_bucket     text,
  p_window     int default 60,    -- דקות, לגדר האישי
  p_max        int default 20,    -- קריאות לחלון, לכל דלי
  p_daily_max  int default null   -- קריאות ליום, לכולם ביחד; null = הגדר הרשמי
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  used_bucket int;
  used_global int;
  cap_global  int := coalesce(p_daily_max, public.rate_limit_daily_cap());
begin
  if p_bucket is null or length(p_bucket) < 8 then
    raise exception 'bucket חסר או קצר מדי';
  end if;

  -- הגדר הגלובלי נבדק ראשון. אם כולם חסומים, אין טעם לספור דלי בודד.
  select count(*) into used_global
  from api_call
  where created_at > now() - interval '24 hours';

  if used_global >= cap_global then
    return 'global';
  end if;

  select count(*) into used_bucket
  from api_call
  where bucket = p_bucket
    and created_at > now() - make_interval(mins => p_window);

  if used_bucket >= p_max then
    return 'user';
  end if;

  insert into api_call (bucket) values (p_bucket);

  -- שורות ישנות מיומיים חסרות ערך: שתי הספירות מסננות אותן ממילא.
  delete from api_call where created_at < now() - interval '48 hours';

  return 'ok';
end
$$;

revoke all on function public.check_rate_limit(text, int, int, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.check_rate_limit(text, int, int, int) to %I', r);
    end if;
  end loop;
end
$$;

-- ── כמה נשאל היום, ומה נשאר ─────────────────────────────────────────
-- הבעיה עם גדרות היא שאיש אינו יודע כמה קרוב הוא אליהן. זה נועד להיקרא
-- לפני הדמו, לא אחריו.
create or replace view usage_today as
select
  count(*)                                   as "שאלות ב-24 שעות",
  public.rate_limit_daily_cap() - count(*)   as "נשאר עד הגדר",
  round(count(*) * 0.023, 2)                 as "עלות מוערכת בשקלים",
  count(distinct bucket)                     as "מבקרות שונות"
from api_call
where created_at > now() - interval '24 hours';

-- התצוגה רצה בהרשאות הבעלים ולכן עוקפת את ה-RLS של api_call. היא נועדה
-- לעיניים שלנו לפני דמו, לא לדפדפן — ולכן היא נסגרת במפורש.
revoke all on table usage_today from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table usage_today from %I', r);
    end if;
  end loop;
end
$$;

comment on view usage_today is
  'כמה שאלות נשאלו ב-24 השעות האחרונות, וכמה נשאר עד הגדר. העלות מוערכת לפי 0.023 ש"ח להודעה.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('021_global_daily_cap.sql', 'sha256:6a77b32f3cac6170e5d8d4654f71cadd',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 022_measured_cost.sql
-- ==========================================================================

set search_path = public, extensions;

-- 022_measured_cost.sql
-- מעדכן את הערכת העלות ב-usage_today מ-0.023 ל-0.0079 ש"ח להודעה.
--
-- ⚠️ המספר הישן לא היה שגוי — הוא היה מדוד תחת הגדרות אחרות, והן השתנו.
-- זה בדיוק המקרה שבו מספר שנכתב ביד מתחיל לשקר בשקט: אף אחד לא היה
-- רואה שהתצוגה מכפילה פי שלושה, כי היא נראית בדיוק אותו דבר.
--
-- המדידה, מתשובה אמיתית של טים (usageMetadata):
--   קלט 275 · פלט 174 · חשיבה 0     ← GEMINI_THINKING_LEVEL = minimal
--   275 × 6/1M  +  174 × 36/1M  =  0.0079 ש"ח
--
-- לפני כן, בלי ההגדרה: קלט 275 · פלט 154 · **חשיבה 505**. אסימוני חשיבה
-- מחויבים כפלט, והם היו 72% מעלות ההודעה — בשביל טיוטה פנימית שאיש אינו
-- קורא. minimal הוריד אותם לאפס, והתשובה לא נפגעה.
--
-- ⚠️ המספר תלוי בשתי הגדרות שיושבות ב-Secrets ולא כאן:
--   GEMINI_THINKING_LEVEL — אם יימחק, החשיבה חוזרת והעלות משלשת.
--   GEMINI_MODEL          — 3.6 Flash מוזיל את הפלט מ-36 ל-30.
-- ולכן המקור האמיתי הוא שדה usage שחוזר מכל תשובה של טים, וזה כאן הערכה
-- לקריאה מהירה לפני דמו — לא חשבונית.

BEGIN;

set local search_path = public, extensions;

-- מקור אמת אחד למחיר, כמו rate_limit_daily_cap() לגובה הגדר.
create or replace function public.estimated_cost_per_message() returns numeric
language sql immutable parallel safe
as $$ select 0.0079::numeric $$;

comment on function public.estimated_cost_per_message() is
  'ש"ח להודעה, מדוד ב-3.9.2026: קלט 275 · פלט 174 · חשיבה 0 (thinking level = minimal).';

create or replace view usage_today as
select
  count(*)                                        as "שאלות ב-24 שעות",
  public.rate_limit_daily_cap() - count(*)        as "נשאר עד הגדר",
  round(count(*) * public.estimated_cost_per_message(), 2)
                                                  as "עלות מוערכת בשקלים",
  count(distinct bucket)                          as "מבקרות שונות"
from api_call
where created_at > now() - interval '24 hours';

revoke all on table usage_today from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table usage_today from %I', r);
    end if;
  end loop;
end
$$;

comment on view usage_today is
  'כמה שאלות נשאלו ב-24 השעות האחרונות, וכמה נשאר עד הגדר. העלות מוערכת לפי estimated_cost_per_message().';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('022_measured_cost.sql', 'sha256:a182cff4178674577faa5db87b224389',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 023_speed_and_inversions.sql
-- ==========================================================================

set search_path = public, extensions;

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


-- ==========================================================================
-- מיגרציה: 024_embedding_1536.sql
-- ==========================================================================

set search_path = public, extensions;

-- 024_embedding_1536.sql
-- ממד ה-embedding עובר מ-1024 ל-1536.
--
-- 1024 היה הממד של Cohere embed-multilingual-v3.0, שהומלץ כברירת מחדל
-- במסמך הארכיטקטורה. אנחנו הולכים על Gemini, ולכן הממד משתנה.
--
-- ⚠️ ותיקון לדבר שאמרתי: טענתי שהחלפת מודל היא "הרצה חוזרת של ingest,
-- לא מיגרציה". המסמך אומר את זה בסעיף 6ב, ואומר את ההפך ב-003 עצמו —
-- "שינוי מודל בעל ממד אחר מחייב מיגרציה". ציטטתי את החצי הנוח. פיליפ
-- תפס.
--
-- **למה 1536 ולא 3072:** gemini-embedding-001 מייצא 3072 · 1536 · 768,
-- כלומר הממד הוא בחירה שלנו. אינדקס ANN ב-pgvector (hnsw ו-ivfflat)
-- מוגבל ל-2000 ממדים. היום אין אינדקס בכוונה — מתחת ל-10,000 שורות
-- סריקה מדויקת מהירה יותר וגם אינה מאבדת recall — אבל 3072 היה **נועל
-- אותנו מחוץ לאינדקס לתמיד**, בלי שנרוויח מזה דבר היום. 1536 שומר את
-- הדלת פתוחה ועולה חצי מהאחסון.
--
-- ⚠️ הטבלה ריקה, ולכן זו מיגרציה של שורה אחת. היא לא תישאר זולה לנצח,
-- אבל היא תישאר זולה: 53 מסמכים הם דקות של חישוב, ו-ingest אידמפוטנטי
-- לפי id. שער M4 (recall@5 ומבחן עיוור) רץ **אחרי** הטעינה הראשונה,
-- כי אי אפשר למדוד שליפה בלי קורפוס.

BEGIN;

set local search_path = public, extensions;

-- ⚠️ נעצר בקול אם יש כבר וקטורים. שינוי ממד על טבלה מלאה היה מוחק אותם
-- בשקט, ו-embedding שנמחק נראה בדיוק כמו embedding שטרם חושב.
do $$
declare n int;
begin
  select count(*) into n from knowledge_chunk where embedding is not null;
  if n > 0 then
    raise exception 'יש כבר % וקטורים בטבלה. הרצת ingest מחדש חייבת לקרות ביודעין, לא כתופעת לוואי של מיגרציה', n;
  end if;
end
$$;

alter table knowledge_chunk alter column embedding type vector(1536);

comment on column knowledge_chunk.embedding is
  '1536 ממדים, gemini-embedding-001. ⚠️ נבחר ולא ברירת מחדל: המודל מייצא גם 3072, ומעל 2000 אין אינדקס ANN ב-pgvector.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('024_embedding_1536.sql', 'sha256:53083620830633412a6d721d4db03129',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 025_knowledge_taxonomy.sql
-- ==========================================================================

set search_path = public, extensions;

-- 025_knowledge_taxonomy.sql
-- ארבעת שדות הטקסונומיה של מסמכי הידע, ו-source_url כרשימה.
--
-- 53 המסמכים נושאים 12 שדות ב-frontmatter. שמונה מהם יש להם בית ב-003;
-- לארבעה אין: product_family · audience · v1_priority · purchase_type.
--
-- ⚠️ ולמה זה לא קוסמטי (פולה): **שדה שמסננים עליו וחסר בו ערך אינו חוסר
-- מידע אלא הדרה שקטה.** 14 מסמכים היו חסרים audience, והם דמויות, גשם,
-- עגלות והחלפת הורים — כלומר בדיוק מה שמשפחה שואלת. שליפה שמסננת על
-- audience הייתה מחזירה אותם כלא-קיימים, בלי שגיאה.
--
-- ⚠️ purchase_type מקבל 'N/A' כערך מפורש, ולא NULL. שלושת המצבים באותה
-- שכבה: ריק = לא בדקנו · N/A = השאלה לא קיימת (לעגלות ולגשם אין סוג
-- רכישה) · כל השאר = תשובה. שאילתה שמסננת על purchase_type חייבת להחליט
-- ביודעין אם N/A נכנס — ואם היא מתעלמת, השורות האלה נעלמות.
--
-- ⚠️ source_url הופך למערך, ולא לעמודה שנייה. source_url_2 בוטל בכוונה
-- (פולה): הוא נשבר ברגע שיש מקור שלישי, ו-source_url_3 אינו פתרון.
-- שבעה מסמכים נושאים היום שני קישורים, והשאר אחד — מערך גדל בלי לשנות
-- סכמה. **גם כשיש בו איבר אחד הוא מערך**, כי שתי צורות לאותו דבר הן שני
-- מקורות אמת.

BEGIN;

set local search_path = public, extensions;

-- ── ארבעת שדות הטקסונומיה ────────────────────────────────────────────
-- nullable ובלי ברירת מחדל, כמו 019. NOT NULL DEFAULT על שדה שמגיע
-- מאיסוף חיצוני הוא הצהרה שאיש לא בדק.
alter table knowledge_doc add column if not exists product_family text
  check (product_family in (
    'queue_access', 'admission', 'park_hopping', 'hotel_benefit',
    'eligibility_program', 'event_ticket',
    'characters', 'guest_services', 'photo', 'weather', 'park_logistics'));

alter table knowledge_doc add column if not exists audience text
  check (audience in (
    'international_guest', 'hotel_guest', 'annual_passholder',
    'florida_resident', 'military'));

alter table knowledge_doc add column if not exists v1_priority text
  check (v1_priority in ('core', 'appendix'));

alter table knowledge_doc add column if not exists purchase_type text
  check (purchase_type in (
    'ticket', 'paid_addon', 'included_benefit', 'reservation_mechanism', 'N/A'));

-- ── source_url כרשימה ────────────────────────────────────────────────
alter table knowledge_doc add column if not exists source_urls text[];

-- ⚠️ ההעברה עטופה בבדיקת קיום, כי המיגרציה מוחקת בהמשך את העמודה
-- שהיא קוראת ממנה — והרצה שנייה הייתה נופלת על "source_url does not
-- exist". מיגרציה שנשברת כשמריצים אותה פעמיים היא מלכודת, כי הרצה
-- כפולה בטעות היא בדיוק מה שקורה כשלא בטוחים אם הראשונה עברה.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'knowledge_doc'
                and column_name = 'source_url') then
    update knowledge_doc
       set source_urls = array[source_url]
     where source_urls is null and source_url is not null;
  end if;
end
$$;

-- העמודה הישנה יורדת. עמודה שמחזיקה את האיבר הראשון של מערך שקיים
-- לידה היא מקור אמת שני, והוא מתפצל בשקט ברגע שמישהו מעדכן רק אחד מהם.
alter table knowledge_doc drop column if exists source_url;

comment on column knowledge_doc.source_urls is
  'רשימת המקורות הרשמיים, גם כשיש אחד. ⚠️ אינה מוצגת בממשק — טים מדווח ערך ולעולם אינו מייחס אותו למקור.';
comment on column knowledge_doc.purchase_type is
  'ticket/paid_addon/included_benefit/reservation_mechanism/N/A. ⚠️ N/A הוא ערך ולא היעדרו: ריק = לא נבדק, N/A = השאלה לא קיימת. סינון שמתעלם מ-N/A מוחק את מסמכי העגלות והגשם.';
comment on column knowledge_doc.audience is
  'הקהל שהמסמך מדבר אליו. ⚠️ חסר כאן אינו חוסר מידע אלא הדרה שקטה מהשליפה.';

-- ── "טרם חושב" הוא מצב, וצריך שאפשר יהיה לייצג אותו ─────────────────
--
-- ⚠️ embedding_model היה not null, ו-embedding היה nullable. כלומר קטע
-- שטרם חושב לו וקטור **לא יכול להיכנס לטבלה** — הטעינה נעצרת עליו. וזה
-- לא תקלה בסקריפט אלא חוסר מצב בסכמה: "נטען וטרם חושב" הוא שלב אמיתי
-- בחיים של כל קטע, והוא לא היה ניתן לביטוי.
--
-- הפתרון אינו למלא את שם המודל מראש. שם מודל שנכתב לפני שחושב משהו הוא
-- הצהרה שאיש לא בדק — אותה תבנית שנתפסה כאן שמונה פעמים.
--
-- ⚠️ במקום זה: שניהם nullable, **וחייבים להיות ריקים או מלאים יחד.**
-- הכלל ש-003 בא לאכוף — "אסור לערבב מודלים באותו אינדקס, שאילתה במודל
-- אחד מול מסמכים באחר מחזירה רעש בלי שום שגיאה" — נשמר בדיוק: המצב
-- המסוכן הוא וקטור בלי שם מודל, וזה בדיוק מה שנחסם.
alter table knowledge_chunk alter column embedding_model drop not null;

alter table knowledge_chunk drop constraint if exists knowledge_chunk_model_with_embedding;
alter table knowledge_chunk add constraint knowledge_chunk_model_with_embedding
  check ((embedding is null) = (embedding_model is null));

comment on column knowledge_chunk.embedding_model is
  'שם המודל שחישב את הווקטור. ⚠️ ריק אך ורק כשהווקטור ריק — נאכף ב-check. וקטור בלי שם מודל הוא רעש שאין דרך לזהות.';

-- ── אינדקס לסינון על הטקסונומיה ──────────────────────────────────────
create index if not exists knowledge_doc_taxonomy_idx
  on knowledge_doc (v1_priority, product_family, audience);

-- ⚠️ אינדקס חלקי על מה שטרם חושב. פונקציית החישוב שואלת בדיוק את זה
-- בכל סבב, והיא תרוץ שוב בכל פעם שייכנסו מסמכים חדשים.
create index if not exists knowledge_chunk_pending_idx
  on knowledge_chunk (doc_id) where embedding is null;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('025_knowledge_taxonomy.sql', 'sha256:75d3755b81d9e8b2156a825e3112d4a9',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 026_rate_limit_caps_not_arguments.sql
-- ==========================================================================

set search_path = public, extensions;

-- 026_rate_limit_caps_not_arguments.sql
-- הגגות יוצאים מרשימת הארגומנטים. מי שקוראת שולחת דלי — ותו לא.
--
-- 🔴 **פרצה אמיתית, נמצאה על ידי גיא בקריאת הקוד.**
--
-- check_rate_limit קיבלה את p_window, p_max ו-p_daily_max **מהקוראת**,
-- והיא מוענקת ל-anon. מפתח ה-anon ציבורי בהגדרה — הוא נשלח לכל דפדפן.
-- כלומר כל מי שפותחת את כלי המפתחים יכולה לקרוא ישירות ל-
--   POST /rest/v1/rpc/check_rate_limit
--   {"p_bucket": "...", "p_max": 999999, "p_daily_max": 999999}
-- ולעבור את שני הגגות, בלי לגעת בפונקציית הקצה בכלל.
--
-- ⚠️ **ו-021 חמורה יותר מ-020, לא פחות.** גיא שאל אם אותה בעיה קיימת בה;
-- התשובה היא כן, ובנוסף היא פורצת את הגדר **היומי הגלובלי** — זה שמגן על
-- הארנק ולא רק על חוויית המשתמש. p_daily_max נבדק לפני הכול, וערך
-- שנשלח מבחוץ גובר על rate_limit_daily_cap(). כלומר ההגנה שנבנתה במפורש
-- נגד "יום אחד שאוכל חודש" הייתה ניתנת לביטול בשדה JSON אחד.
--
-- **התיקון:** החתימה מקבלת דלי בלבד. הגגות נקראים מתוך פונקציות במסד,
-- שאינן מקבלות ארגומנטים ואי אפשר להשפיע עליהן דרך ה-RPC.
--
-- ⚠️ הגרסה הישנה **נמחקת** ולא נשארת לצד החדשה. פונקציה עם ארבעה
-- ארגומנטים שנשארת מוענקת היא הפרצה עצמה, ו"תמיכה לאחור" כאן פירושה
-- להשאיר את הדלת פתוחה ליד דלת נעולה.

BEGIN;

set local search_path = public, extensions;

-- ── הגגות, כמקור אמת יחיד שאינו ניתן להשפעה מבחוץ ────────────────────
create or replace function public.rate_limit_window_minutes() returns int
language sql immutable parallel safe
as $$ select 60 $$;

create or replace function public.rate_limit_max_per_window() returns int
language sql immutable parallel safe
as $$ select 20 $$;

comment on function public.rate_limit_window_minutes() is
  'אורך החלון האישי בדקות. ⚠️ פונקציה ולא ארגומנט: ארגומנט מגיע מהקוראת, והקוראת עשויה להיות דפדפן עם מפתח ציבורי.';
comment on function public.rate_limit_max_per_window() is
  'גג הקריאות לדלי בחלון. ⚠️ אינו ניתן לשליחה מבחוץ, מאותה סיבה.';

-- ── החתימה החדשה: דלי בלבד ───────────────────────────────────────────
drop function if exists public.check_rate_limit(text, int, int, int);
drop function if exists public.check_rate_limit(text, int, int);

create or replace function public.check_rate_limit(p_bucket text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  used_bucket int;
  used_global int;
  cap_window  int := public.rate_limit_window_minutes();
  cap_bucket  int := public.rate_limit_max_per_window();
  cap_global  int := public.rate_limit_daily_cap();
begin
  if p_bucket is null or length(p_bucket) < 8 then
    raise exception 'bucket חסר או קצר מדי';
  end if;

  -- הגדר הגלובלי נבדק ראשון. אם כולם חסומים, אין טעם לספור דלי בודד.
  select count(*) into used_global
  from api_call
  where created_at > now() - interval '24 hours';

  if used_global >= cap_global then
    return 'global';
  end if;

  select count(*) into used_bucket
  from api_call
  where bucket = p_bucket
    and created_at > now() - make_interval(mins => cap_window);

  if used_bucket >= cap_bucket then
    return 'user';
  end if;

  insert into api_call (bucket) values (p_bucket);
  delete from api_call where created_at < now() - interval '48 hours';

  return 'ok';
end
$$;

comment on function public.check_rate_limit(text) is
  'גג קריאות. ⚠️ מקבלת דלי בלבד — הגגות עצמם נקראים מפונקציות במסד ואינם ניתנים לשליחה מבחוץ. הגרסה הקודמת קיבלה אותם כארגומנטים והייתה ניתנת לעקיפה עם מפתח ה-anon הציבורי.';

revoke all on function public.check_rate_limit(text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.check_rate_limit(text) to %I', r);
    end if;
  end loop;
end
$$;

-- ── ⚠️ נעצר בקול אם החתימה הישנה שרדה ────────────────────────────────
-- drop אינו מבטיח: אם קיימת גרסה נוספת בחתימה אחרת שלא חשבתי עליה, היא
-- נשארת מוענקת והפרצה נשארת פתוחה — בזמן שהמיגרציה מדווחת הצלחה.
do $$
declare n int;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'check_rate_limit'
    and p.pronargs <> 1;
  if n > 0 then
    raise exception 'נשארו % גרסאות של check_rate_limit עם יותר מארגומנט אחד. הפרצה פתוחה.', n;
  end if;
end
$$;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('026_rate_limit_caps_not_arguments.sql', 'sha256:5e397ca0fc13b9b3bd803a803591173d',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 027_ingest_rpc.sql
-- ==========================================================================

set search_path = public, extensions;

-- 027_ingest_rpc.sql
-- החישוב עובר ל-RPC עם סוד, כי service_role אינו נפתר בפרויקט הזה.
--
-- ⚠️ **עובדה שנמדדה ולא שוערה:** פונקציית embed ניסתה לקרוא את הקטעים
-- עם SUPABASE_SERVICE_ROLE_KEY וקיבלה **403**. זהו אותו 403 שקיבלנו
-- במיגרציה 020 — כלומר המפתח כן מתקבל, והתפקיד שהוא נפתר אליו אינו
-- service_role. הפרויקט על מערכת המפתחות החדשה, ואיני יכול לאמת מכאן
-- לאיזה תפקיד כל מפתח נפתר. במקום לנחש שוב — אותו פתרון שכבר עבד:
-- פונקציית security definer, שעובדת ללא תלות בתפקיד.
--
-- ⚠️ **אבל כאן, בשונה מ-check_rate_limit, נדרש סוד.** גדר הקצב מקבלת
-- מחרוזת ומחזירה כן/לא — היא לא מזיקה למי שקורא לה. כתיבת embedding כן:
-- מי שיכולה לכתוב וקטור שרירותי יכולה לגרום לטים לשלוף את הקטע הלא
-- נכון לכל שאלה, בשקט מוחלט. **הרעלה של אינדקס שליפה אינה נראית על
-- המסך כתקלה — היא נראית כתשובה.**
--
-- ⚠️ והלקח מ-026 מיושם כאן מראש: **הגג אינו ארגומנט.** p_limit נחתך
-- בתוך הפונקציה, כדי שהקוראת לא תוכל לבקש את כל הטבלה בבת אחת.

BEGIN;

set local search_path = public, extensions;

-- ── הסוד, כגיבוב ─────────────────────────────────────────────────────
--
-- ⚠️ נשמר כ-sha256 ולא כטקסט. הטבלה סגורה ב-RLS בלי שום מדיניות, כלומר
-- היא בלתי נראית מבחוץ לחלוטין — אבל סוד שנשמר בצורתו הקריאה הוא סוד
-- שמי שמקבל גישה למסד קורא. הפונקציות מגבבות את מה שנשלח ומשוות.
create table if not exists ingest_key (
  id       int primary key default 1 check (id = 1),
  hash     text not null,
  set_at   timestamptz not null default now()
);
alter table ingest_key enable row level security;
-- אין מדיניות, בכוונה. רק security definer רואה אותה.

/**
 * קביעת הסוד. בפעם הראשונה — פתוחה; אחר כך דורשת את הקודם.
 *
 * ⚠️ בלי התנאי הזה כל מי שיכולה לקרוא ל-RPC הייתה יכולה **להחליף** את
 * הסוד ואז להשתמש בו. "אין עדיין סוד" ו"יש סוד ואני לא יודעת אותו" הם
 * שני מצבים שונים, ורק הראשון פתוח.
 */
create or replace function public.ingest_set_key(p_new text, p_current text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare existing text;
begin
  if p_new is null or length(p_new) < 16 then
    raise exception 'סוד קצר מדי — לפחות 16 תווים';
  end if;
  select hash into existing from ingest_key where id = 1;
  if existing is not null
     and (p_current is null or encode(sha256(p_current::bytea), 'hex') <> existing) then
    raise exception 'כבר קיים סוד. להחלפה יש לשלוח את הקיים ב-p_current';
  end if;
  insert into ingest_key (id, hash, set_at)
  values (1, encode(sha256(p_new::bytea), 'hex'), now())
  on conflict (id) do update set hash = excluded.hash, set_at = now();
  return 'ok';
end
$$;

create or replace function public.ingest_check(p_secret text) returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from ingest_key
     where id = 1 and hash = encode(sha256(coalesce(p_secret, '')::bytea), 'hex')
  )
$$;

-- ── מה עוד לא חושב ───────────────────────────────────────────────────
create or replace function public.ingest_pending(p_secret text, p_limit int default 25)
returns table (id uuid, content text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  return query
    select c.id, c.content
    from knowledge_chunk c
    where c.embedding is null
    -- ⚠️ הגג נחתך כאן ולא מתקבל מהקוראת (הלקח מ-026). least ולא
    -- greatest: מנה גדולה מדי נתקעת בפסק זמן של הפונקציה, ואז שום דבר
    -- לא מתקדם — כישלון שנראה כמו "זה לוקח זמן".
    order by c.doc_id, c.chunk_index
    limit least(coalesce(p_limit, 25), 50);
end
$$;

-- ── כתיבת הווקטור ────────────────────────────────────────────────────
--
-- ⚠️ הווקטור מגיע כטקסט ומומר כאן. PostgREST שולח JSON ואינו יודע לבנות
-- טיפוס vector; המרה בצד המסד היא גם מה שמוודא שהממד נכון — ערך באורך
-- אחר נדחה על ידי הטיפוס עצמו, ולא נכנס.
create or replace function public.ingest_set_embedding(
  p_secret text,
  p_id     uuid,
  p_vector text,
  p_model  text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare updated int;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  if p_model is null or p_model = '' then
    raise exception 'שם המודל חסר. וקטור בלי שם מודל הוא רעש שאין דרך לזהות';
  end if;
  update knowledge_chunk
     set embedding = p_vector::vector,
         embedding_model = p_model
   where knowledge_chunk.id = p_id;
  get diagnostics updated = row_count;
  -- ⚠️ עדכון שלא פגע בשום שורה מוחזר כ-false ולא כהצלחה שקטה. מזהה שגוי
  -- היה נספר כ"נכתב" והקטע היה נשאר בלי וקטור לנצח, בלי שאיש יראה.
  return updated = 1;
end
$$;

-- ── כמה נשארו ────────────────────────────────────────────────────────
create or replace function public.ingest_remaining(p_secret text) returns int
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare n int;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  select count(*) into n from knowledge_chunk where embedding is null;
  return n;
end
$$;

-- ── הרשאות ───────────────────────────────────────────────────────────
-- ⚠️ ingest_check אינה מוענקת לאיש. היא כלי פנימי של השלוש האחרות, והענקה
-- שלה הייתה נותנת אורקל לניחוש הסוד — תשובה מיידית של אמת/שקר לכל ניסיון.
do $$
declare r text; f text;
begin
  revoke all on function public.ingest_check(text) from public;
  foreach f in array array[
    'ingest_set_key(text, text)',
    'ingest_pending(text, int)',
    'ingest_set_embedding(text, uuid, text, text)',
    'ingest_remaining(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    foreach r in array array['anon','authenticated','service_role'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('grant execute on function public.%s to %I', f, r);
      end if;
    end loop;
  end loop;
end
$$;

comment on function public.ingest_set_embedding(text, uuid, text, text) is
  '⚠️ כתיבת וקטור. דורשת סוד: מי שיכולה לכתוב וקטור שרירותי יכולה לגרום לטים לשלוף את הקטע הלא נכון לכל שאלה — והרעלת אינדקס שליפה אינה נראית כתקלה אלא כתשובה.';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('027_ingest_rpc.sql', 'sha256:1f500c8be4515a4e4ef1433899cf6eda',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 028_match_knowledge.sql
-- ==========================================================================

set search_path = public, extensions;

-- 028_match_knowledge.sql
-- השליפה. טים שואל, המסד מחזיר את הקטעים הקרובים.
--
-- ⚠️ **מבנה התוצאה הוא האכיפה** (סעיף 8 במסמך השליפה, אופציה ב').
-- טים חייב לדעת מה ה-volatility ומה ה-last_verified של כל קטע שנשלף:
-- הכלל "כשפרט עשוי להשתנות — לומר זאת" מופעל מ-volatility, ומסמך שעבר
-- זמן מאימותו צריך להיאמר בזהירות אחרת. השדות האלה יושבים ב-knowledge_doc
-- ולא בקטע.
--
-- שקלנו לשכפל אותם ל-knowledge_chunk כמו חמשת השדות שכבר משוכפלים שם.
-- **לא.** אלה נדרשים **אחרי** השליפה ולא בסינון שלה, והשכפול היה יוצר
-- מקור אמת שני לתאריך שמוצג למשתמש: מסמך שאומת מחדש בלי חיתוך מחדש
-- היה מציג תאריך ישן. במקום זה ה-join נעשה כאן, והם **חלק ממבנה
-- התוצאה** — אי אפשר לקבל את ה-content בלי לקבל גם אותם. האכיפה היא
-- בצורה, לא בזיכרון של מי שכותב את הקוד הקורא.
--
-- ⚠️ **ובלי source_urls.** הם קיימים ב-knowledge_doc ואינם יוצאים מכאן:
-- טים מדווח ערך ולעולם אינו מייחס אותו למקור, ומה שהשליפה לא מחזירה
-- אינו יכול לדלוף לתשובה.

BEGIN;

set local search_path = public, extensions;

create or replace function public.match_knowledge(
  p_embedding text,
  p_limit     int  default 5,
  p_resort    text default null
)
returns table (
  chunk_id      uuid,
  doc_id        text,
  title         text,
  content       text,
  authority_tier authority_tier,
  -- ⚠️ שני אלה אינם נוחות. בלעדיהם כלל הזהירות של טים אינו ניתן להפעלה.
  volatility    volatility_tier,
  last_verified date,
  similarity    float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    d.id,
    d.title,
    c.content,
    c.authority_tier,
    d.volatility,
    d.last_verified,
    -- <=> הוא מרחק קוסינוס: 0 זהה, 2 הפוך. ההמרה לדמיון היא כדי
    -- שהמספר שיוצא מכאן יגדל ככל שהקטע רלוונטי יותר, ולא להפך.
    1 - (c.embedding <=> p_embedding::vector) as similarity
  from knowledge_chunk c
  join knowledge_doc d on d.id = c.doc_id
  where c.embedding is not null
    -- ⚠️ תוכן שלא אושר אינו נשלף. הכלל קיים ב-RLS, אבל הפונקציה הזו היא
    -- security definer ולכן עוקפת אותו — ומה שנאכף במקום אחד ולא כאן
    -- היה נכנס לתשובה של טים דרך הדלת הזו.
    and c.review_status = 'approved'
    and d.review_status = 'approved'
    and (p_resort is null or d.scope_resort = p_resort)
  order by c.embedding <=> p_embedding::vector
  -- ⚠️ הגג נחתך כאן ואינו מתקבל מהקוראת (הלקח מ-026). חמישה קטעים הם
  -- מה שנכנס להקשר; מאה היו מנפחים את הקלט ואת העלות בלי לשפר תשובה.
  limit least(coalesce(p_limit, 5), 20)
$$;

comment on function public.match_knowledge(text, int, text) is
  'שליפה סמנטית. ⚠️ volatility ו-last_verified הם חלק ממבנה התוצאה ולא תוספת: בלעדיהם כלל הזהירות של טים אינו ניתן להפעלה. source_urls אינם מוחזרים — טים אינו מייחס למקור.';

revoke all on function public.match_knowledge(text, int, text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.match_knowledge(text, int, text) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('028_match_knowledge.sql', 'sha256:e004bee033d83d0b459a2eb476a51e43',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 029_find_experiences.sql
-- ==========================================================================

set search_path = public, extensions;

-- 029_find_experiences.sql
-- הכלי. עובדות על מתקנים נשלפות מהטבלה, לא מחיפוש סמנטי.
--
-- ⚠️ **זו ההפרדה שהארכיטקטורה נועדה לשמור** (הערה ב-003_knowledge.sql):
-- "עובדות קשות יושבות ב-experience ונשלפות דרך כלים. כאן יושב רק מה
-- שהוא פרוזה. **ערבוב השניים הוא בדיוק הטעות שהארכיטקטורה נועדה
-- למנוע.**"
--
-- חיפוש סמנטי מצוין לפרוזה וגרוע לעובדות. "מה גובה המינימום" צריכה את
-- **המספר מהשורה**, לא את הקטע שנשמע הכי דומה. 112 הוא ערך, לא טקסט
-- שמתאים בערך — והפרש של קטע אחד בדירוג הוא מתקן אחר לגמרי.
--
-- ⚠️ **וזה גם מה שמונע מטים לענות מהאימון שלו.** הוא "יודע" גבהים של
-- מתקנים בדיסני מהאינטרנט, והם עשויים להיות נכונים ועשויים להיות ישנים
-- בשנתיים. הפונקציה הזו נותנת לו את המספר **שלנו**, שנבדק ויש לו תאריך.

BEGIN;

set local search_path = public, extensions;

/**
 * מתקנים לפי שם, פארק וגובה.
 *
 * ⚠️ החיפוש בשם עובר על שלושה שדות: השם האנגלי, השם העברי, והשמות
 * הנרדפים. משפחה ישראלית תכתוב "אוורסט" ולא "Expedition Everest",
 * וחיפוש באנגלית בלבד היה מחזיר ריק על שאלה שיש לה תשובה.
 */
create or replace function public.find_experiences(
  p_name        text default null,
  p_park        text default null,
  p_height_cm   int  default null,
  p_limit       int  default 8
)
returns table (
  id            text,
  name          text,
  name_he       text,
  park          text,
  land          text,
  category      text,
  status        text,
  status_note   text,
  intensity     int,
  height_cm     int,
  gets_wet      text,
  wheelchair    text,
  motion_sickness text,
  skip_line     text,
  last_verified date,
  fits          boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    e.id,
    e.name,
    e.name_i18n->>'he',
    p.name,
    l.name,
    e.category,
    e.status,
    e.status_note,
    e.intensity,
    e.height_requirement_cm,
    e.gets_wet,
    e.wheelchair,
    e.motion_sickness_warning,
    e.skip_line_system,
    e.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   גובה נדרש 0     → נבדק ואין מגבלה → מתאים
    --   גובה נדרש מספר  → מתאים אם הילד/ה מגיע/ה
    --   גובה נדרש NULL  → **לא נבדק** → NULL, ולא true
    -- הערך הזה נגזר בזמן ריצה ואינו מאוחסן בשום מקום — אחרת הוא היה
    -- מקור אמת שני שמתיישן ברגע שהגובה של הילד/ה משתנה.
    case
      when p_height_cm is null then null
      when e.height_requirement_cm is null then null
      else p_height_cm >= e.height_requirement_cm
    end
  from experience e
  join park p on p.id = e.park_id
  left join land l on l.id = e.land_id
  where
    (p_park is null or p.id = p_park or p.name ilike '%' || p_park || '%')
    and (
      p_name is null
      or e.name ilike '%' || p_name || '%'
      or e.name_i18n->>'he' ilike '%' || p_name || '%'
      -- ⚠️ גם השמות הנרדפים. "מסע אל ההר" ו-"אוורסט" הם אותו מתקן.
      or exists (
        select 1 from jsonb_array_elements_text(
          coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
        where a ilike '%' || p_name || '%'
      )
    )
  -- ⚠️ מתקן סגור **מוחזר**, עם הסטטוס שלו. סינון שקט של סגורים היה גורם
  -- לטים לומר "לא מצאתי מתקן כזה" על מתקן שקיים ופשוט סגור — וזו תשובה
  -- שגויה שנשמעת כמו תשובה.
  order by
    case when e.name ilike p_name || '%' then 0 else 1 end,
    e.name
  limit least(coalesce(p_limit, 8), 25)
$$;

comment on function public.find_experiences(text, text, int, int) is
  'עובדות על מתקנים, מהטבלה. ⚠️ לא חיפוש סמנטי: "מה גובה המינימום" צריכה את המספר מהשורה, לא את הקטע שנשמע דומה. fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים".';

revoke all on function public.find_experiences(text, text, int, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.find_experiences(text, text, int, int) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('029_find_experiences.sql', 'sha256:df969b0e6b22357e56b7069a9df283fa',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 030_find_experiences_by_words.sql
-- ==========================================================================

set search_path = public, extensions;

-- 030_find_experiences_by_words.sql
-- 🔴 תיקון באג שנמדד בשדה: החיפוש התאים **ביטוי**, והשאלה היא **משפט**.
--
-- 029 עשתה `e.name ilike '%' || p_name || '%'` — כלומר התאימה את כל מה
-- שהגיע כמחרוזת אחת רציפה. הקוד שקורא לה מסיר מילות שאלה ומחזיר את מה
-- שנשאר, וזה **צירוף מילים** ולא שם:
--
--   "הבת שלי בגובה 112 ס״מ, היא יכולה לעלות על אקספדישן אוורסט?"
--     → "הבת שלי סנטימטר יכולה לעלות אקספדישן אוורסט"
--     → ilike '%הבת שלי סנטימטר יכולה לעלות אקספדישן אוורסט%'
--     → אפס שורות
--
-- ⚠️ **והבדיקות שלי לא תפסו את זה, כי הן בדקו את הצד הלא נכון.** הן
-- אימתו ש-extractRideName מחזירה מחרוזת שמכילה "אוורסט" — וזה היה נכון.
-- אף בדיקה לא שאלה **האם המסד מוצא משהו עם המחרוזת הזו**. בדיקה על
-- הפלט של שלב אחד אינה בדיקה על החיבור בין שני שלבים, ופה הכשל ישב
-- בדיוק בתפר. השאלה הקצרה ("כמה עולה אוורסט") עבדה במקרה, כי אחרי
-- ההסרה נשארה מילה אחת.
--
-- התיקון: התאמה לפי **מילים**. שורה נמדדת לפי כמה מילים מהשאלה נמצאו
-- בה, ומוחזרות רק השורות עם המספר הגבוה ביותר.
--
-- ⚠️ **הסינון הזה הוא מה שמונע זבל.** בלעדיו "שלי" או "לעלות" היו
-- יכולות להתאים למתקן אקראי במילה אחת, והוא היה נכנס להקשר של טים
-- כעובדה. מתקן שהתאים בשתי מילים דוחק החוצה כל מי שהתאים באחת.

BEGIN;

set local search_path = public, extensions;

create or replace function public.find_experiences(
  p_name        text default null,
  p_park        text default null,
  p_height_cm   int  default null,
  p_limit       int  default 8
)
returns table (
  id            text,
  name          text,
  name_he       text,
  park          text,
  land          text,
  category      text,
  status        text,
  status_note   text,
  intensity     int,
  height_cm     int,
  gets_wet      text,
  wheelchair    text,
  motion_sickness text,
  skip_line     text,
  last_verified date,
  fits          boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with tok as (
    -- ⚠️ פיצול על רווח בלבד, וקיצוץ פיסוק מהקצוות ב-btrim.
    -- **בכוונה בלי מחלקות תווים כמו [:alnum:]** — הן תלויות ב-locale,
    -- והמסד המקומי (C) והמסד בסופאבייס (UTF-8) היו מתנהגים אחרת.
    -- זה הכשל שכבר תפס אותי שלוש פעמים (search_path, format_type),
    -- ואות עברית היא בדיוק סוג התו שנופל בין ההגדרות.
    select distinct btrim(t, ',.;:!?()"''[]{}<>/-') as t
    from regexp_split_to_table(coalesce(p_name, ''), '[[:space:]]+') t
  ),
  words as (
    -- שתי אותיות אינן מילה מזהה; הן שאריות של מילות קישור.
    select t from tok where length(t) >= 3
  ),
  -- ⚠️ **תחיליות עבריות.** "לספייס" ו-"באקספדישן" הן אותה מילה עם אות
  -- אחת מלפנים, ו-ilike על מחרוזת אינו יודע את זה. בלי זה שאלה טבעית
  -- ("כדאי ללכת לספייס מאונטיין") מחזירה אפס על מתקן שקיים.
  -- הקיצוץ מוגבל למילים בנות 5 ומעלה, כדי שלא ניצור מילים קצרות
  -- ומקריות שיתאימו לחצי מהטבלה.
  forms as (
    select t as t, t as root from words
    union
    select t, substr(t, 2) from words
    where length(t) >= 5 and substr(t, 1, 1) in ('ל','ב','ה','מ','ש','ו','כ')
  ),
  scored as (
    select
      e.id, e.name, e.name_i18n->>'he' as name_he,
      p.name as park_name, l.name as land_name,
      e.category, e.status, e.status_note, e.intensity,
      e.height_requirement_cm, e.gets_wet, e.wheelchair,
      e.motion_sickness_warning, e.skip_line_system, e.last_verified,
      -- ⚠️ **count(distinct f.t) ולא count(*)** — מילה אחת שמתאימה גם
      -- בצורתה המלאה וגם בלי התחילית היא **מילה אחת**, ושתי צורות של
      -- אותה מילה לא אמורות לדחוק החוצה מתקן שהתאים בשתי מילים שונות.
      (select count(distinct f.t) from forms f
        where e.name ilike '%' || f.root || '%'
           or coalesce(e.name_i18n->>'he', '') ilike '%' || f.root || '%'
           -- ⚠️ גם השמות הנרדפים. "מסע אל ההר" ו-"אוורסט" הם אותו מתקן.
           or exists (
             select 1 from jsonb_array_elements_text(
               coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
             where a ilike '%' || f.root || '%'
           )) as hits
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where (p_park is null or p.id = p_park or p.name ilike '%' || p_park || '%')
  )
  select
    s.id, s.name, s.name_he, s.park_name, s.land_name,
    s.category, s.status, s.status_note, s.intensity,
    s.height_requirement_cm, s.gets_wet, s.wheelchair,
    s.motion_sickness_warning, s.skip_line_system, s.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   0     → נבדק ואין מגבלה → מתאים
    --   מספר  → מתאים אם הילד/ה מגיע/ה
    --   NULL  → **לא נבדק** → NULL, ולא true
    -- נגזר בזמן ריצה ואינו מאוחסן — אחרת היה מקור אמת שני שמתיישן
    -- ברגע שהגובה של הילד/ה משתנה.
    case
      when p_height_cm is null then null
      when s.height_requirement_cm is null then null
      else p_height_cm >= s.height_requirement_cm
    end
  from scored s
  where
    -- בלי שם — כל הפארק, לפי הסינון בלבד.
    (select count(*) from words) = 0
    -- ⚠️ עם שם — **רק ההתאמות הטובות ביותר.** ראה ההערה בראש הקובץ.
    or s.hits = (select max(x.hits) from scored x where x.hits > 0)
  -- ⚠️ מתקן סגור **מוחזר**, עם הסטטוס שלו. סינון שקט היה גורם לטים לומר
  -- "לא מצאתי מתקן כזה" על מתקן שקיים ופשוט סגור.
  order by
    case when p_name is not null and s.name ilike p_name || '%' then 0 else 1 end,
    s.name
  limit least(coalesce(p_limit, 8), 25)
$$;

comment on function public.find_experiences(text, text, int, int) is
  'עובדות על מתקנים, מהטבלה. ⚠️ התאמה לפי מילים ולא לפי ביטוי — שאלה היא משפט, לא שם (הבאג של 029). מוחזרות רק השורות עם מספר המילים התואמות הגבוה ביותר, כדי שמילה אחת מקרית לא תכניס מתקן זר להקשר. fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים".';

revoke all on function public.find_experiences(text, text, int, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.find_experiences(text, text, int, int) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('030_find_experiences_by_words.sql', 'sha256:219641a14cbe15dde0367b4f2da4b08b',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 031_alias_candidates.sql
-- ==========================================================================

set search_path = public, extensions;

-- 031_alias_candidates.sql
-- מועמדים לשמות נרדפים. **מחוץ ל-experience, בכוונה.**
--
-- ⚠️ **נרדף שנכנס בלי אישור מצמיד שאלה למתקן הלא נכון, וזו טעות גרועה
-- מ"לא מצאתי".** המשתמש מקבלת עובדות מדויקות, מנוסחות היטב ועם תאריך
-- בדיקה — על מתקן אחר. התאריך גורם לזה להיראות אמין **יותר**.
--
-- לכן המודל כותב **לכאן** ולא ל-experience.aliases_i18n. הטבלה הזו היא
-- תור אישור, לא מקור אמת. שום שליפה אינה קוראת ממנה.
--
-- 197 מתוך 232 המתקנים היו בלי אף נרדף עברי, ובגלל זה "ולוצירפטור"
-- ו"מסע אל ההר האסור" החזירו אפס שורות על מתקנים שקיימים במאגר.

BEGIN;

set local search_path = public, extensions;

create table if not exists alias_candidate (
  id            bigint generated always as identity primary key,
  experience_id text not null references experience(id) on delete cascade,
  candidate     text not null,
  -- ⚠️ **בלי DEFAULT.** מי שכתב את השורה חייב לומר מאיפה היא הגיעה.
  -- 'model'   — יוצר אוטומטית, לא נבדק
  -- 'runtime' — המודל פענח כך בשאלה אמיתית שהחזירה אפס
  source        text not null check (source in ('model', 'runtime')),
  -- ⚠️ **וגם כאן בלי DEFAULT 'approved'.** זו התבנית שנתפסה בפרויקט
  -- הזה שבע פעמים: NOT NULL DEFAULT על שדה שמגיע מאיסוף חיצוני הוא
  -- הצהרה שאיש לא בדק. 'pending' הוא הערך המפורש, ומי שמאשר כותב אותו.
  status        text not null check (status in ('pending', 'approved', 'rejected')),
  note          text,
  created_at    timestamptz not null default now(),
  -- אותו מועמד לאותו מתקן פעם אחת בלבד.
  unique (experience_id, candidate)
);

alter table alias_candidate enable row level security;
-- ⚠️ אין מדיניות, ולכן אין גישה מהדפדפן. הכתיבה עוברת דרך הפונקציה
-- שדורשת סוד, והקריאה נעשית בסקירה — לא במוצר.

comment on table alias_candidate is
  'תור אישור לשמות נרדפים. ⚠️ אינו מקור אמת ואינו נשלף: נרדף לא מאושר שמצמיד שאלה למתקן הלא נכון גרוע מ"לא מצאתי", כי הוא נראה כמו תשובה.';

-- ── מי עוד צריך מועמדים ─────────────────────────────────────────────
create or replace function public.alias_pending(p_secret text, p_limit int default 25)
returns table (id text, name text, name_he text, aliases text)
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  return query
    select e.id, e.name, e.name_i18n->>'he',
           coalesce(array_to_string(
             array(select jsonb_array_elements_text(
               coalesce(e.aliases_i18n->'he', '[]'::jsonb))), ' · '), '')
    from experience e
    where not exists (
      select 1 from alias_candidate c where c.experience_id = e.id)
    order by e.name
    limit least(coalesce(p_limit, 25), 50);
end
$$;

-- ── כתיבת מועמד ─────────────────────────────────────────────────────
create or replace function public.alias_add(
  p_secret text, p_experience_id text, p_candidate text, p_source text)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  -- ⚠️ מועמד נכנס תמיד כ-pending. אין דרך לכתוב 'approved' דרך כאן,
  -- גם לא בטעות — האישור נעשה בסקירה ולא בייצור.
  insert into alias_candidate (experience_id, candidate, source, status)
  values (p_experience_id, btrim(p_candidate), p_source, 'pending')
  on conflict (experience_id, candidate) do nothing;
  return found;
end
$$;

-- ── כמה נשארו ────────────────────────────────────────────────────────
create or replace function public.alias_remaining(p_secret text)
returns int
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare n int;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  select count(*) into n from experience e
  where not exists (select 1 from alias_candidate c where c.experience_id = e.id);
  return n;
end
$$;

do $$
declare r text; f text;
begin
  foreach f in array array[
    'alias_pending(text, int)', 'alias_add(text, text, text, text)',
    'alias_remaining(text)'] loop
    execute format('revoke all on function public.%s from public', f);
    foreach r in array array['anon','authenticated','service_role'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('grant execute on function public.%s to %I', f, r);
      end if;
    end loop;
  end loop;
end
$$;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('031_alias_candidates.sql', 'sha256:392fce61473b0ac71cd42b651dac73fe',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 032_alias_reject_useless.sql
-- ==========================================================================

set search_path = public, extensions;

-- 032_alias_reject_useless.sql
-- שני סוגי מועמדים שאין טעם שיגיעו לסקירה של פולה.
--
-- ⚠️ נמדד על 60 המועמדים הראשונים, לא נצפה מראש:
--
--   Advanced Training Lab → "אדוונסד טריינינג לאב"   ← זהה לשם שכבר במסד
--   Acrobatico!           → "אקרובטיקו אפקוט"        ← שם + פארק
--   Astro Orbiter         → "אסטרו אורביטר מג'יק קינגדום"
--   Awesome Planet        → "אוסום פלאנט אפקוט"
--
-- הראשון הוא רעש. **השני מזיק:** ההתאמה היא לפי מילים, ולכן המילה
-- "אפקוט" בשאלה כלשהי הייתה מתאימה לנרדף "אקרובטיקו אפקוט" ומחזירה את
-- Acrobatico על כל שאלה שמזכירה את אפקוט. נרדף שמכיל שם פארק הוא
-- מחולל התאמות שגויות.
--
-- ⚠️ **וזו הגנה שנייה ולא ראשונה.** הראשונה היא שמילים גנריות נופלות
-- מהשאלה בצד של טים — כי מילה גנרית מופיעה גם בנרדף לגיטימי
-- ("מופע היפה והחיה"), ואי אפשר לפסול אותה כאן בלי לאבד אותו.

BEGIN;

set local search_path = public, extensions;

create or replace function public.alias_add(
  p_secret text, p_experience_id text, p_candidate text, p_source text)
returns boolean
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  c text := btrim(p_candidate);
  e record;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;

  select name, name_i18n->>'he' as he into e
  from experience where id = p_experience_id;
  if not found then
    return false;
  end if;

  -- ⚠️ נרדף שזהה לשם הקיים אינו מוסיף דבר. הוא רק שורה שפולה צריכה
  -- לקרוא ולדחות.
  if lower(c) = lower(coalesce(e.he, '')) or lower(c) = lower(e.name) then
    return false;
  end if;

  -- ⚠️ **נרדף שמכיל שם פארק מזיק.** ראה ההערה בראש הקובץ.
  if exists (
    select 1 from park p
    where c ilike '%' || p.name || '%'
       or (p.name_i18n->>'he' is not null and c ilike '%' || (p.name_i18n->>'he') || '%')
  ) then
    return false;
  end if;

  insert into alias_candidate (experience_id, candidate, source, status)
  values (p_experience_id, c, p_source, 'pending')
  on conflict (experience_id, candidate) do nothing;
  return found;
end
$$;

comment on function public.alias_add(text, text, text, text) is
  'כתיבת מועמד לנרדף. ⚠️ דוחה כפילות של השם הקיים, ונרדף שמכיל שם פארק — האחרון מחזיר את המתקן על כל שאלה שמזכירה את הפארק.';

-- ── איפוס המנה הראשונה ──────────────────────────────────────────────
-- 60 המועמדים שנוצרו לפני התיקון נוצרו בהוראה הישנה, וחלקם מהסוג
-- שהפונקציה עכשיו דוחה. מוחקים ומייצרים מחדש — זול (₪0.31 לכל 232)
-- ועדיף על סקירה ידנית של רעש.
--
-- ⚠️ **התנאי צר בכוונה: רק מה שהמודל ייצר ואיש עוד לא נגע בו.**
-- מועמד שאושר או נדחה על ידי אדם אינו נמחק, גם לא בטעות.
delete from alias_candidate where source = 'model' and status = 'pending';

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('032_alias_reject_useless.sql', 'sha256:6bb4c7604d8cb4ee25b1bd7d932eae8a',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 033_embedding_follows_content.sql
-- ==========================================================================

set search_path = public, extensions;

-- ── 033 · וקטור שלא מתאים לטקסט שלו ──────────────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
--
-- ⚠️ הבעיה שזה סוגר, ובלשון פשוטה:
--
-- לכל קטע ידע יש טקסט, ולצידו וקטור — רשימת מספרים שמתארת את
-- **המשמעות** של הטקסט. השליפה של טים אינה מחפשת מילים; היא מחפשת
-- וקטור קרוב. כלומר הווקטור הוא מה שקובע מתי הקטע נשלף, והטקסט הוא
-- מה שנקרא כשהוא נשלף.
--
-- ולכן: אם מישהו מתקן את הטקסט ולא מוחק את הווקטור, הקטע ממשיך
-- להישלף **לפי המשמעות הישנה** ולהיקרא לפי הטקסט החדש. שני הצדדים
-- נראים תקינים בנפרד. אין שגיאה, אין אזהרה, ואף בדיקת ספירה לא
-- תתפוס את זה — מספר הקטעים לא השתנה.
--
-- זו בדיוק התבנית שנתפסה כאן שבע פעמים, בפעם השמינית: שדה שנראה
-- כאילו יש בו ערך תקף. הפעם הערך תקף — הוא פשוט של טקסט אחר.
--
-- ⚠️ הצינור הרגיל אינו חשוף לזה. build-knowledge-seed.py מוחק את כל
-- הקטעים וכותב אותם מחדש, ולכן הווקטור נולד NULL ומחושב מאפס. החשיפה
-- היא ל-UPDATE ידני בעורך ה-SQL — וזה בדיוק מה שעומד לקרות כשפולה
-- מתקנת ניסוח על שורה בודדת.
--
-- מה שזה עושה: מאפס את הווקטור בכל פעם שהטקסט משתנה. הקטע יוצא
-- מהשליפה עד שהוא מחושב מחדש — כלומר הכשל הופך מ"תשובה שגויה בשקט"
-- ל"הקטע חסר", וזו נפילה שרואים.

-- ⚠️ BEGIN מפורש, ולא רק `set local`. מחוץ לטרנזקציה `set local` אינו
-- עושה דבר — והטיפוס vector יושב ב-extensions ולא ב-public, ולכן בלוק
-- האימות היה נופל על "type vector does not exist" בסופהבייס. זו אותה
-- נפילת search_path שכבר תפסה אותי כאן, וזה הדפוס שכל שאר המיגרציות
-- כבר משתמשים בו.
BEGIN;

set local search_path = public, extensions;

create or replace function knowledge_chunk_content_changed()
returns trigger
language plpgsql
as $$
begin
  -- ⚠️ `is distinct from` ולא `<>`. השוואה רגילה מחזירה NULL כששד אחד
  -- NULL, ו-NULL אינו TRUE — כלומר טקסט שהיה ריק והתמלא היה חומק.
  if new.content is distinct from old.content then
    -- ⚠️ שניהם, ולא רק הווקטור. על הטבלה יושבת אילוצת־בדיקה שאומרת
    -- ש-embedding ו-embedding_model הם NULL יחד או מלאים יחד
    -- (knowledge_chunk_model_with_embedding). איפוס של אחד בלבד היה
    -- מפיל כל עריכת ניסוח על שגיאת אילוץ — כלומר הופך תיקון טקסט
    -- לפעולה בלתי אפשרית.
    new.embedding       := null;
    new.embedding_model := null;
  end if;
  return new;
end;
$$;

comment on function knowledge_chunk_content_changed() is
  'מאפס את הווקטור כשהטקסט משתנה. וקטור שאינו תואם לטקסט שלו שולף את הקטע לפי המשמעות הישנה, בלי שום שגיאה.';

drop trigger if exists knowledge_chunk_content_changed on knowledge_chunk;

create trigger knowledge_chunk_content_changed
  before update on knowledge_chunk
  for each row
  execute function knowledge_chunk_content_changed();

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את ההתנהגות ולא את קיום הטריגר. טריגר שקיים ואינו יורה נראה
-- זהה לטריגר שעובד, וזו בדיוק הבחנה שהפרויקט הזה נכשל עליה.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  probe_doc  text;
  probe_id   uuid;
  after_edit boolean;
  dim        int;
begin
  -- ⚠️ המימד נקרא מהעמודה ולא נכתב כמספר. הוא כבר השתנה פעם אחת
  -- (1024 → 1536, מיגרציה 024), ומספר קשיח כאן היה נשבר בשקט בפעם
  -- הבאה — הבדיקה הייתה נכשלת על המימד ולא על מה שהיא באה לבדוק.
  select atttypmod into dim
    from pg_attribute
   where attrelid = 'knowledge_chunk'::regclass
     and attname  = 'embedding';
  select id into probe_doc from knowledge_doc limit 1;
  if probe_doc is null then
    raise notice '⚠️ אין מסמכים — הטריגר הותקן אך לא נבדק. להריץ שוב אחרי טעינת הידע.';
    return;
  end if;

  insert into knowledge_chunk (doc_id, chunk_index, content, authority_tier, locale, review_status)
  values (probe_doc, -1, 'בדיקת טריגר — נמחקת מיד', 'T1', 'he', 'approved')
  returning id into probe_id;

  -- וקטור מלאכותי, כדי שיהיה מה לאפס. ⚠️ עם שם מודל, כי האילוץ דורש
  -- ששני השדות יהיו מלאים יחד.
  update knowledge_chunk
     set embedding = (
           select format('[%s]', string_agg('0.1', ','))::vector
             from generate_series(1, dim)
         ),
         embedding_model = 'probe-033'
   where id = probe_id;

  update knowledge_chunk set content = 'טקסט אחר לגמרי' where id = probe_id;

  select embedding is null into after_edit from knowledge_chunk where id = probe_id;

  delete from knowledge_chunk where id = probe_id;

  if after_edit then
    raise notice '✅ תקין — שינוי טקסט מאפס את הווקטור.';
  else
    raise exception '❌ הטריגר לא ירה. וקטור ישן שרד שינוי טקסט.';
  end if;
end $$;

COMMIT;

select '✅ 033 הותקנה' as "מצב";

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('033_embedding_follows_content.sql', 'sha256:9409c400147bf52bbecaf4e55965bb1f',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 034_eight_hebrew_names.sql
-- ==========================================================================

set search_path = public, extensions;

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


-- ==========================================================================
-- מיגרציה: 034_sensitivities_vocabulary.sql
-- ==========================================================================

set search_path = public, extensions;

-- ── 034 · אוצר מילים אחד לרגישויות, ו"לא נשאל" שאינו "אין" ──────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
--
-- ⚠️ שני פערים, ושניהם עוד לא הזיקו רק מפני שהאפליקציה אינה כותבת
-- ל-trip_member היום — הפרופיל חי בדפדפן. ברגע שמסך ההרשמה ייכנס
-- והפרופיל יישמר, שניהם מתחילים לעבוד.
--
-- ── הפער הראשון: שני אוצרות מילים ──────────────────────────────────
--
-- מיגרציה 010 תיעדה בהערה:
--     motion_sickness · fear_dark · fear_heights · claustrophobia
--
-- והקוד ב-src/lib/sensitivity.ts, שנבנה מול העמודות שקיימות בפועל
-- בטבלת experience, מכיר:
--     dark · loudSudden · strobe · heights · motionSickness ·
--     accessibility · longQueues
--
-- אין ביניהם התאמה. ל-010 יש claustrophobia שאין לו עמודה בכלל, ולקוד
-- יש ארבעה שאין ב-010. שני מקורות אמת לאותו דבר, וזה בדיוק מה שמייצר
-- ערך שנכתב ואינו נקרא — או גרוע ממנו, ערך שנקרא ואינו מסנן.
--
-- ⚠️ **המחרוזות כאן זהות לאלה שבקוד, אות באות, ובכוונה.** הן מזהי
-- אפליקציה ולא שמות עמודות, וכל תרגום ביניהן — snake_case מול
-- camelCase — היה קוד שיכול להיסחף. בדיקה ברפו קוראת את הרשימה מכאן
-- ומשווה אותה למערך ב-TypeScript, כדי שסחיפה בכל אחד מהכיוונים תיפול.
--
-- ── הפער השני: NOT NULL DEFAULT '{}' ───────────────────────────────
--
-- 🔴 זו התבנית שנתפסה בפרויקט הזה תשע פעמים. מערך ריק אינו "אין
-- רגישויות" — הוא "לא נשאל", ושני אלה מובילים להתנהגות שונה: על שאלה
-- שדולגה שואלים פעם נוספת אחת (כלל הברזל החמישי), ועל שאלה שנענתה
-- בשלילה לא חוזרים לעולם.
--
-- בממשק ההבחנה כבר קיימת — יש תשובה מפורשת "אין רגישויות מיוחדות".
-- העמודה הייתה מוחקת אותה בכניסה.
--
--   NULL  — לא נשאל / לא נענה
--   '{}'  — נשאל, ואין רגישויות
--   {...} — נשאל, ואלה הן

BEGIN;

set local search_path = public, extensions;

-- ⚠️ סדר הפעולות חשוב. הסרת ה-DEFAULT לפני הסרת ה-NOT NULL תשאיר
-- שורות קיימות עם '{}' — שהוא ערך תקין, רק שמשמעותו השתנתה. אין
-- שורות בייצור היום, אבל הסדר נכתב כך שהוא יהיה נכון גם כשיהיו.
alter table trip_member alter column sensitivities drop default;
alter table trip_member alter column sensitivities drop not null;

alter table trip_member drop constraint if exists trip_member_sensitivities_vocab;
alter table trip_member add constraint trip_member_sensitivities_vocab
  check (
    sensitivities is null
    or sensitivities <@ array[
         'dark',
         'loudSudden',
         'strobe',
         'heights',
         'motionSickness',
         'accessibility',
         'longQueues'
       ]::text[]
  );

comment on column trip_member.sensitivities is
  'NULL = לא נשאל · {} = נשאל ואין · אחרת הרשימה. אוצר המילים נעול ב-CHECK ומשווה ל-src/lib/sensitivity.ts.';

-- ── והכלל שאין לו CHECK, ולכן הוא נכתב כאן ──────────────────────────
--
-- ⚠️ trip_member היא **אנונימית לצמיתות**. אין בה שם ואין תאריך לידה,
-- ויש בה גיל כמספר וגובה רק מתחת לגיל 14.
--
-- 🔴 וזה עומד להיבחן. אם המוצר יהפוך לסוכן נסיעות מורשה, יידרש שם מלא
-- ותאריך לידה — כרטיס נושא שם. הפיתוי יהיה להוסיף את העמודות כאן.
--
-- אסור. ברגע שהן באותה שורה, ההבטחה "איננו יודעים מי הילד הזה" מתה
-- לגבי **כל** מי שנרשם — כולל מי שרק תכנן יום ולא הזמין דבר. זהות
-- להזמנה שייכת לטבלה נפרדת, שטים אינו קורא ממנה לעולם.
--
-- הפירוט ב-docs/product/commercial-foundations.md. בדיקה ברפו נכשלת אם עמודה
-- כזו נוספת.
comment on table trip_member is
  'חבר אחד בקבוצה. אנונימי לצמיתות: בלי שם ובלי תאריך לידה. זהות להזמנה — טבלה נפרדת. ראה docs/product/commercial-foundations.md.';

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק התנהגות ולא קיום. אילוץ שקיים ואינו תופס נראה זהה לאילוץ
-- שעובד, וזו ההבחנה שהפרויקט הזה נכשל עליה שוב ושוב.

BEGIN;

set local search_path = public, extensions;

-- ⚠️ הבדיקה רצה על **עותק** של הטבלה, ולא עליה עצמה. trip_member
-- תלויה ב-trip שתלויה במשתמש אמיתי, ומיגרציה אינה יכולה לייצר כזה —
-- וגם אין משתמשים בייצור היום. `LIKE ... INCLUDING CONSTRAINTS` מעתיק
-- את אילוצי ה-CHECK בלי המפתחות הזרים, ולכן זו אותה בדיקה בדיוק על
-- אותו אילוץ, בלי להמציא נתונים.

create temp table sens_probe (like trip_member including constraints including defaults)
  on commit drop;

do $$
declare
  rejected boolean;
begin
  -- א. ערך שאינו באוצר המילים חייב להידחות
  begin
    insert into sens_probe (trip_id, member_key, role, age, sensitivities)
    values (gen_random_uuid(), 'p1', 'adult', 30, array['fear_dark']);
    rejected := false;
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception '❌ אוצר המילים אינו נאכף — fear_dark התקבל.';
  end if;

  -- ב. NULL מתקבל, והוא "לא נשאל"
  insert into sens_probe (trip_id, member_key, role, age, sensitivities)
  values (gen_random_uuid(), 'p2', 'adult', 30, null);

  -- ג. מערך ריק מתקבל, והוא "נשאל ואין"
  insert into sens_probe (trip_id, member_key, role, age, sensitivities)
  values (gen_random_uuid(), 'p3', 'adult', 30, array[]::text[]);

  -- ד. ערכים תקינים מתקבלים
  insert into sens_probe (trip_id, member_key, role, age, sensitivities)
  values (gen_random_uuid(), 'p4', 'adult', 30, array['loudSudden','heights']);

  -- ה. ⚠️ וההבחנה עצמה: NULL אינו מערך ריק
  if (select count(*) from sens_probe where sensitivities is null) <> 1
     or (select count(*) from sens_probe where sensitivities = array[]::text[]) <> 1 then
    raise exception '❌ NULL ומערך ריק אינם נבדלים.';
  end if;

  raise notice '✅ תקין — אוצר המילים נאכף, ו-NULL נבדל ממערך ריק.';
end $$;

COMMIT;

select '✅ 034 הותקנה' as "מצב";

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('034_sensitivities_vocabulary.sql', 'sha256:e3670a7f30399bf39406d2b6805a6641',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 035_sources_are_not_public.sql
-- ==========================================================================

set search_path = public, extensions;

-- ── 035 · המקורות יורדים מהקריאה הציבורית ───────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- אושר על ידי גיא, 07.09.
--
-- ⚠️ הבעיה, ולמה היא לא נראתה:
--
-- כלל הפרויקט אומר "אין מקורות בממשק. הייצוא נושא תאריך בלבד. בדיקה
-- נכשלת אם URL מגיע לשורה." והבדיקה הזו קיימת ועובדת — אבל היא בודקת
-- את **הייצוא**.
--
-- `experience_source` מחזיקה url · title · tier · retrieved_at, והיא
-- נכללה ב-006 ברשימת הטבלאות שנפתחו ל-select(true) יחד עם שאר טבלאות
-- התוכן. כלומר המקורות אינם מוצגים במסך — ונשלפים בקריאה אחת ישירה
-- ל-PostgREST על ידי כל אנונימי.
--
-- 🔴 וזו התבנית: **הגנה שנבדקת בצד אחד ופתוחה בצד השני.** הטבלה ריקה
-- היום, ולכן שום דבר עוד לא דלף — היא הייתה מתחילה להזיק בדיוק ברגע
-- שמישהו ימלא אותה, וזה הרגע שבו איש לא יחשוב לבדוק שוב.
--
-- ⚠️ ומה שזה **אינו**: זו אינה הכרעה על 242 השורות. הן נשארות ציבוריות,
-- והשאלה אם להגן עליהן היא החלטת מוצר של נטע ופולה (גיא, 07.09). כאן
-- יורד רק מה שהכלל כבר אוסר להציג.

BEGIN;

set local search_path = public, extensions;

-- מדיניות הקריאה בלבד. ⚠️ מדיניות האדמין נשארת — אדמין צריך לראות
-- מקורות כדי לבדוק שורה, וזה בדיוק מה שהיא קיימת בשבילו.
drop policy if exists experience_source_read on experience_source;

comment on table experience_source is
  'מקורות. ⚠️ אינה קריאה לציבור — הכלל אוסר מקורות בממשק, ומיגרציה 035 הורידה אותה מ-select(true). רק אדמין.';

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את ההתנהגות ולא את היעדר השורה ב-pg_policies. מדיניות שנמחקה
-- בעוד טבלה אחרת פותחת את אותה גישה נראית זהה למדיניות שהוסרה.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  readable boolean;
  others   int;
begin
  -- א. לאנונימי אין יותר מדיניות קריאה על הטבלה
  select exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'experience_source'
       and cmd in ('SELECT', 'ALL')
       and 'anon' = any(coalesce(roles, array['public']))
  ) into readable;

  -- ⚠️ `using (true)` נכתב ל-role ציבורי, ולכן הבדיקה למעלה עלולה
  -- לפספס. השנייה היא הישירה: האם נותרה מדיניות SELECT כלשהי שאינה
  -- מותנית ב-is_admin().
  select count(*) into others
    from pg_policies
   where schemaname = 'public'
     and tablename  = 'experience_source'
     and cmd in ('SELECT', 'ALL')
     and coalesce(qual, '') not like '%is_admin%';

  if others > 0 then
    raise exception '❌ נותרה מדיניות קריאה שאינה מוגבלת לאדמין על experience_source (% מדיניות).', others;
  end if;

  -- ב. ו-RLS עצמה חייבת להישאר פעילה. טבלה בלי RLS פתוחה לגמרי,
  -- והסרת המדיניות האחרונה ממנה לא הייתה סוגרת דבר.
  if not (select relrowsecurity from pg_class
           where oid = to_regclass('public.experience_source')) then
    raise exception '❌ RLS כבויה על experience_source. הסרת מדיניות בלעדיה אינה סוגרת כלום.';
  end if;

  -- ג. ⚠️ ושאר טבלאות התוכן **נשארות** קריאות. זו אינה הכרעה על
  -- הפתיחות הכללית, וסגירה שלהן כאן הייתה חורגת ממה שאושר.
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='experience'
                    and cmd in ('SELECT','ALL')
                    and coalesce(qual,'') not like '%is_admin%') then
    raise exception '❌ experience נסגרה בטעות. 035 נוגעת ב-experience_source בלבד.';
  end if;

  raise notice '✅ תקין — המקורות סגורים, RLS פעילה, ושאר התוכן נשאר קריא.';
end $$;

COMMIT;

select '✅ 035 הותקנה' as "מצב";

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('035_sources_are_not_public.sql', 'sha256:8cb16bb8493d794a21962391abbaf216',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 036_knowledge_is_not_public.sql
-- ==========================================================================

set search_path = public, extensions;

-- ── 036 · מאגר הידע יורד מהקריאה הציבורית ───────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- נמצא על ידי גיא, 07.09, בעקבות בקשת פולה.
--
-- ⚠️ מה שהיה חשוף, ואומת במסד: **259 קטעי ידע נראים לכל אנונימי
-- בקריאה ישירה ל-PostgREST.** ולא רק הטקסט:
--
--   knowledge_doc   — source_url · source_kind · reviewed_by ·
--                     submitted_by · authority_tier
--   knowledge_chunk — embedding (הווקטור הגולמי) · authority_tier
--
-- שלוש בעיות נפרדות בחשיפה אחת:
--
-- 1. 🔴 `source_url` — **המקום השני של אותו באג בדיוק.** הכלל אומר
--    "אין מקורות בממשק", והבדיקה שאוכפת אותו בודקת את הייצוא. כאן
--    הם יצאו מהדלת האחורית, בדיוק כמו ב-experience_source (מיגרציה
--    035). באג שנמצא פעמיים בשני מקומות אינו מקרה — הוא אומר
--    שההגנה נבדקת בצד הלא נכון.
--
-- 2. 🔴 `submitted_by` ו-`reviewed_by` — מזהי משתמשים. תוכן קהילתי
--    נכתב בהנחה שהכותב אינו מזוהה; הכלל על יומן השאלות ("מי שכותב
--    אינו יכול לקרוא, גם לא את מה שהוא עצמו כתב") קיים בדיוק בשביל
--    זה. עמודה שמחזירה uuid של כותב מבטלת אותו.
--
-- 3. ⚠️ `embedding` — הווקטור הוא ייצוג המשמעות של כל קטע. מי שמוריד
--    259 ווקטורים מקבל את שכבת השליפה עצמה, לא רק את הטקסט.
--
-- ── ולמה סגירה מלאה ולא view ─────────────────────────────────────────
--
-- גיא הציע view שחושף content · scope · locale. זה היה עובד — אבל
-- **הדפדפן אינו קורא את הטבלאות האלה בכלל.** מדדתי: אין ולו הפניה
-- אחת אליהן בקוד הלקוח. טים קורא דרך `match_knowledge`, שהיא
-- `security definer` — כלומר עוקפת RLS ואינה מושפעת.
--
-- ⚠️ ולכן view היה מוסיף משטח שאיש לא צריך. אין דבר בטוח יותר משטח
-- שאינו קיים.
--
-- **נמדד לפני שנכתב** (מסד מקומי, 259 קטעים אמיתיים):
--   קריאה ישירה כ-anon:  259 → 0
--   דרך match_knowledge:   5 → 5   ← טים אינו נפגע

BEGIN;

set local search_path = public, extensions;

drop policy if exists knowledge_chunk_read on knowledge_chunk;
drop policy if exists knowledge_doc_read   on knowledge_doc;

comment on table knowledge_doc is
  'מסמכי ידע. ⚠️ אינם קריאים לציבור — מכילים source_url, submitted_by ו-reviewed_by. טים קורא דרך match_knowledge (security definer). מיגרציה 036.';
comment on table knowledge_chunk is
  'קטעי ידע. ⚠️ אינם קריאים לציבור — מכילים embedding. טים קורא דרך match_knowledge (security definer). מיגרציה 036.';

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את שני הצדדים: שהדלת נסגרה, **ושטים עדיין עובר בה.** בדיקה
-- שרק מוודאת סגירה עוברת גם על מסד שבו טים שבור.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  open_policies int;
  through_tim   int;
  probe         text;
begin
  -- א. לא נותרה מדיניות קריאה שאינה מוגבלת לאדמין
  select count(*) into open_policies
    from pg_policies
   where schemaname = 'public'
     and tablename in ('knowledge_doc','knowledge_chunk')
     and cmd in ('SELECT','ALL')
     and coalesce(qual,'') not like '%is_admin%';
  if open_policies > 0 then
    raise exception '❌ נותרו % מדיניות קריאה פתוחות על טבלאות הידע.', open_policies;
  end if;

  -- ב. RLS פעילה. טבלה בלעדיה פתוחה לגמרי, והסרת מדיניות ממנה
  --    אינה סוגרת דבר.
  if not (select bool_and(relrowsecurity) from pg_class
           where oid in (to_regclass('public.knowledge_doc'),
                         to_regclass('public.knowledge_chunk'))) then
    raise exception '❌ RLS כבויה על אחת מטבלאות הידע.';
  end if;

  -- ג. 🔴 וטים עדיין שולף. security definer אמור לעקוף את RLS, אבל
  --    "אמור" אינו מדידה — וסגירה ששוברת את טים גרועה מהחשיפה.
  select embedding::text into probe
    from knowledge_chunk where embedding is not null limit 1;
  if probe is null then
    raise notice '⚠️ אין ווקטורים — הסגירה בוצעה אך לא נבדק שטים עובר. להריץ שוב אחרי החישוב.';
    return;
  end if;
  -- ⚠️ **כ-anon, ולא כמי שמריץ את המיגרציה.** בלוק שרץ כמנהל עוקף RLS
  -- ממילא, ולכן הוא היה מדווח ✅ גם על מסד שבו טים שבור לחלוטין —
  -- כלומר בודק את ההרשאות של האדם הלא נכון. זה נתפס בבדיקה ההפוכה.
  set local role anon;
  select count(*) into through_tim from match_knowledge(probe, 5, null);
  reset role;
  if through_tim = 0 then
    raise exception '❌ match_knowledge מחזירה אפס. הסגירה שברה את השליפה של טים.';
  end if;

  raise notice '✅ תקין — הידע סגור לקריאה ישירה, וטים שולף % קטעים דרך match_knowledge.', through_tim;
end $$;

COMMIT;

select '✅ 036 הותקנה' as "מצב";

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('036_knowledge_is_not_public.sql', 'sha256:e1960194177c70bf62a45326d6eec657',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 037_bucket_daily_cap.sql
-- ==========================================================================

set search_path = public, extensions;

-- ── 037 · גג יומי לכל דלי, לא רק לכולם יחד ──────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- אושר על ידי גיא, 07.09, לפני פתיחת הכתובת.
--
-- ⚠️ החשבון שלא עלה, ושבגללו זה נכתב:
--
--   גג לחלון: 20 קריאות לכל 60 דקות
--   גג גלובלי: 600 ליום
--
--   20 × 24 שעות = **480 קריאות ליום מדלי אחד** — 80% מהמכסה של כולם.
--
-- שני המספרים סבירים כל אחד לחוד. הם אינם סבירים יחד: **דלי אחד יכול
-- לצרוך 80% מהיום בלי לחרוג משום מגבלה, ושניים סוגרים את היום.**
--
-- ⚠️ ומה שזה אומר בפועל: הגג הגלובלי מגן על הארנק ולא על השירות.
-- משפחה שתיכנס בערב תקבל "נגמרה המכסה" בגלל מישהו אחר.
--
-- ── ולמה זה לא מחליף את auth.uid() ולא מוחלף בו ─────────────────────
--
-- גיא הציע לקשור את הגג ל-auth.uid() במקום לדלי מהלקוח. הכיוון נכון
-- והוא סוגר את ה-80% לגמרי — **אבל אינו מחליף את זה**:
--
--   · מי שיכול לפתוח חשבונות חופשי מקבל מכסה טרייה לכל חשבון (Sybil)
--   · ההרשמה עצמה, איפוס סיסמה, וכל מה שלפני הזדהות — אין להם uid
--
-- כלומר צריך את שניהם: **לפי כתובת מגן על הכניסה, לפי משתמש מגן על
-- השימוש.** וכאן נבנה הראשון, כי מסך ההרשמה עוד לא קיים ואין uid
-- לקשור אליו. auth.uid() מצטרף כשההרשמה עולה (סוכם עם גיא, 07.09).

BEGIN;

set local search_path = public, extensions;

-- ⚠️ פונקציה ולא ארגומנט, בדיוק כמו שאר הגגות ומאותה סיבה: ארגומנט
-- מגיע מהקוראת, והקוראת היא דפדפן עם מפתח ציבורי. זה הלקח מ-021.
create or replace function public.rate_limit_bucket_daily_cap() returns int
language sql immutable parallel safe
as $$ select 60 $$;

comment on function public.rate_limit_bucket_daily_cap() is
  'גג יומי לדלי בודד. ⚠️ 60 ולא 480: הגג הגלובלי הוא 600, ודלי אחד אינו אמור לצרוך יותר מ-10% מהיום של כולם.';

create or replace function public.check_rate_limit(p_bucket text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  used_bucket     int;
  used_bucket_day int;
  used_global     int;
  cap_window      int := public.rate_limit_window_minutes();
  cap_bucket      int := public.rate_limit_max_per_window();
  cap_bucket_day  int := public.rate_limit_bucket_daily_cap();
  cap_global      int := public.rate_limit_daily_cap();
begin
  if p_bucket is null or length(p_bucket) < 8 then
    raise exception 'bucket חסר או קצר מדי';
  end if;

  -- הגדר הגלובלי נבדק ראשון. אם כולם חסומים, אין טעם לספור דלי בודד.
  select count(*) into used_global
  from api_call
  where created_at > now() - interval '24 hours';

  if used_global >= cap_global then
    return 'global';
  end if;

  select count(*) into used_bucket
  from api_call
  where bucket = p_bucket
    and created_at > now() - make_interval(mins => cap_window);

  if used_bucket >= cap_bucket then
    return 'user';
  end if;

  -- ⚠️ החדש: אותו דלי, אבל על פני יממה. בלעדיו החלון לבדו מתיר 480
  -- ליום, וזו כל הבעיה.
  --
  -- ⚠️ ומוחזר 'user' ולא ערך חדש, בכוונה. הקוראת — הפונקציה של טים —
  -- מכירה שלושה ערכים, וערך רביעי היה נופל אצלה לענף ברירת המחדל
  -- ומוצג למשתמש כתקלה כללית במקום כ"הגעת למכסה". שינוי אוצר המילים
  -- מחייב שינוי בשני הצדדים, וזה בדיוק סוג הפער שנתפס כאן שוב ושוב.
  select count(*) into used_bucket_day
  from api_call
  where bucket = p_bucket
    and created_at > now() - interval '24 hours';

  if used_bucket_day >= cap_bucket_day then
    return 'user';
  end if;

  insert into api_call (bucket) values (p_bucket);
  delete from api_call where created_at < now() - interval '48 hours';

  return 'ok';
end
$$;

comment on function public.check_rate_limit(text) is
  'גג קריאות: חלון לדלי · יממה לדלי · יממה גלובלי. ⚠️ שלושתם נקראים מפונקציות במסד ואינם ניתנים לשליחה מבחוץ.';

-- ⚠️ ההרשאות נכתבות מחדש. `create or replace` שומר אותן, אבל הסתמכות
-- על כך פירושה שמיגרציה עתידית שתעשה drop+create תשאיר את הפונקציה
-- בלי גישה — וטים ייפול על 403 בלי שאיש יבין למה.
revoke all on function public.check_rate_limit(text) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.check_rate_limit(text) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את ההתנהגות מקצה לקצה, ולא את קיום הפונקציה. הגג הקודם
-- (021) נראה מותקן וניתן היה לעקוף אותו מבחוץ; הלקח היה שהמדידה
-- חייבת להיות "מה קורה בקריאה ה-N", לא "האם הפונקציה שם".

BEGIN;

set local search_path = public, extensions;

do $$
declare
  b       text := 'probe-037-' || gen_random_uuid()::text;
  cap_day int  := public.rate_limit_bucket_daily_cap();
  cap_win int  := public.rate_limit_max_per_window();
  answer  text;
  allowed int  := 0;
begin
  -- ⚠️ הבדיקה מזייפת זמן: קריאות נכתבות ישירות ל-api_call עם חותמות
  -- מפוזרות על פני היממה, כדי לעקוף את גג החלון ולהגיע לגג היומי.
  -- בלי זה החלון היה חוסם ראשון והגג היומי לא היה נבדק כלל.
  insert into api_call (bucket, created_at)
  select b, now() - make_interval(mins => 90 + g * 20)
    from generate_series(1, cap_day - 1) g;

  -- הקריאה שמשלימה למכסה חייבת לעבור
  answer := public.check_rate_limit(b);
  if answer <> 'ok' then
    raise exception '❌ קריאה % נחסמה (%), והיא עדיין בתוך המכסה היומית של %.',
      cap_day, answer, cap_day;
  end if;

  -- והבאה אחריה חייבת להיחסם
  answer := public.check_rate_limit(b);
  if answer <> 'user' then
    raise exception '❌ קריאה % החזירה "%" ולא "user". הגג היומי לדלי אינו נאכף.',
      cap_day + 1, answer;
  end if;

  -- ⚠️ ודלי אחר אינו מושפע. גג שחוסם את כולם בגלל אחד הוא באג ולא הגנה.
  answer := public.check_rate_limit('probe-037-other-' || gen_random_uuid()::text);
  if answer <> 'ok' then
    raise exception '❌ דלי אחר נחסם ("%"). הגג דולף בין דליים.', answer;
  end if;

  delete from api_call where bucket like 'probe-037-%';

  raise notice '✅ תקין — דלי נחסם אחרי % ליממה, ודלי אחר אינו מושפע.', cap_day;
end $$;

COMMIT;

-- ── מה שרואים עכשיו ──────────────────────────────────────────────────
select public.rate_limit_daily_cap()        as "גג יומי גלובלי",
       public.rate_limit_bucket_daily_cap() as "גג יומי לדלי",
       public.rate_limit_max_per_window()   as "גג בחלון",
       public.rate_limit_window_minutes()   as "אורך החלון",
       round(100.0 * public.rate_limit_bucket_daily_cap()
                   / public.rate_limit_daily_cap()) || '%' as "מה דלי אחד יכול לצרוך";

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('037_bucket_daily_cap.sql', 'sha256:8b7b0c2f1477aa9a2e27eb3a4e6b0064',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 038_max_height.sql
-- ==========================================================================

set search_path = public, extensions;

-- ── 038 · גובה מקסימלי — הכיוון השני של אותה עמודה ─────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
-- אושר על ידי פולה דרך פיליפ, 08.09.
--
-- 🔴 הבעיה, ולמה היא נראתה כמו נתון תקין:
--
-- למאסטר עמודת גובה אחת, ומשמעותה "מינימום לעלייה". בחמישה אזורי מים
-- לפעוטות המספר שבה הוא **המקסימום המותר** — ולכן אותו מספר אמר בדיוק
-- את ההפך ממה שהתכוון:
--
--   Bay Slides 152 · Runamukka Reef 137 · Ketchakiddee Creek 122
--   Tike's Peak 122 · Tot Tiki Reef 122
--
-- ⚠️ טים אמר למשפחה ש"מגבלת הגובה בטייקס פיק היא 122 ס״מ". ילדה בגובה
-- 130 הבינה שהיא גדולה מספיק, כשבפועל היא **גדולה מדי**; ונער בגובה 160,
-- שבאמת אינו יכול לעלות, לא קיבל שום אזהרה.
--
-- ── איך זה נמצא ─────────────────────────────────────────────────────
--
-- לא ממקור חיצוני אלא מסתירה בתוך הדאטא עצמו: הקטגוריה **העדינה ביותר**
-- החזיקה את המספר הגבוה ביותר במאגר —
--
--   עוצמה 1 (עדין) · 17 שורות · הגבוה ביותר: 152
--   עוצמה 4 (חזק)  · 22 שורות · הגבוה ביותר: 137
--
-- מגלשת ילדים שדורשת יותר מ-Hulk ומ-Doctor Doom אינה אפשרית. רוני אימתה
-- מול המקורות, ופולה אישרה שדה נפרד.
--
-- ── ולמה שדה נפרד ולא איפוס ─────────────────────────────────────────
--
-- 🔴 הפיתוי היה לאפס את החמישה ל-0 ולסגור את זה היום. **אסור.**
--
-- `0` אצלנו פירושו "נבדק, ואין מגבלה". על מתקן שיש בו תקרה אמיתית זו
-- הצהרה שקרית **בכיוון ההפוך** — נחליף חסימת ילד נמוך בהזמנת ילד גבוה
-- מדי למתקן שלא ייתן לו לעלות. **התיקון המהיר גרוע מהבאג.**
--
-- ⚠️ ומאותה סיבה `height_requirement_cm` על החמישה נשאר **NULL ולא 0**:
-- רוני אימתה את התקרה; איש לא אימת שאין רצפה. 0 היה הצהרה שלא נאמרה.

BEGIN;

set local search_path = public, extensions;

alter table experience
  add column if not exists max_height_requirement_cm int;

-- ⚠️ אותו טווח כמו הרצפה, ומאותה סיבה: מספר מחוץ ל-50..200 אינו גובה של
-- אדם אלא שגיאת הקלדה או יחידה אחרת, ועדיף שייעצר כאן.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'experience_max_height_range') then
    alter table experience add constraint experience_max_height_range
      check (max_height_requirement_cm is null
             or max_height_requirement_cm between 50 and 200);
  end if;
end $$;

-- ⚠️ **ואיסור על שתי המשמעויות באותה שורה.** שורה שנושאת גם רצפה וגם
-- תקרה אפשרית בעולם, אבל אצלנו היא כמעט תמיד סימן שהמספר הועתק לשתי
-- העמודות במקום להיות מפורש נכון באחת. אם תגיע שורה כזו באמת — היא
-- תיעצר כאן ותיבדק, ולא תיכנס בשקט.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'experience_height_one_direction') then
    alter table experience add constraint experience_height_one_direction
      check (max_height_requirement_cm is null
             or height_requirement_cm is null
             or height_requirement_cm < max_height_requirement_cm);
  end if;
end $$;

comment on column experience.max_height_requirement_cm is
  'תקרת גובה: עד כמה מותר להיות גבוה כדי לעלות. ⚠️ ההפך מ-height_requirement_cm. חמישה אזורי מים לפעוטות בלבד. מיגרציה 038.';

-- 🔴 **drop לפני create, ובכוונה.**
--
-- `create or replace` אינו יכול לשנות את מבנה הטבלה שהפונקציה מחזירה.
-- העמודה החדשה משנה אותו, ולכן ההרצה נכשלת עם:
--   "cannot change return type of existing function"
--
-- ⚠️ ומה שזה מוחק יחד עם הפונקציה: **ההרשאות.** drop מסיר גם את
-- ה-grant ל-anon, וטים היה נופל על 403 בלי ששום דבר ייראה שבור. בלוק
-- ההרשאות בסוף הקובץ כותב אותן מחדש — הוא לא קישוט.
--
-- ⚠️ והכל בתוך טרנזקציה אחת: בין ה-drop ל-create הפונקציה אינה קיימת,
-- ובלי BEGIN/COMMIT היה חלון שבו טים מחזיר 404.
drop function if exists public.find_experiences(text, text, int, int);

create or replace function public.find_experiences(
  p_name        text default null,
  p_park        text default null,
  p_height_cm   int  default null,
  p_limit       int  default 8
)
returns table (
  id            text,
  name          text,
  name_he       text,
  park          text,
  land          text,
  category      text,
  status        text,
  status_note   text,
  intensity     int,
  height_cm     int,
  max_height_cm int,
  gets_wet      text,
  wheelchair    text,
  motion_sickness text,
  skip_line     text,
  last_verified date,
  fits          boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with tok as (
    -- ⚠️ פיצול על רווח בלבד, וקיצוץ פיסוק מהקצוות ב-btrim.
    -- **בכוונה בלי מחלקות תווים כמו [:alnum:]** — הן תלויות ב-locale,
    -- והמסד המקומי (C) והמסד בסופאבייס (UTF-8) היו מתנהגים אחרת.
    -- זה הכשל שכבר תפס אותי שלוש פעמים (search_path, format_type),
    -- ואות עברית היא בדיוק סוג התו שנופל בין ההגדרות.
    select distinct btrim(t, ',.;:!?()"''[]{}<>/-') as t
    from regexp_split_to_table(coalesce(p_name, ''), '[[:space:]]+') t
  ),
  words as (
    -- שתי אותיות אינן מילה מזהה; הן שאריות של מילות קישור.
    select t from tok where length(t) >= 3
  ),
  -- ⚠️ **תחיליות עבריות.** "לספייס" ו-"באקספדישן" הן אותה מילה עם אות
  -- אחת מלפנים, ו-ilike על מחרוזת אינו יודע את זה. בלי זה שאלה טבעית
  -- ("כדאי ללכת לספייס מאונטיין") מחזירה אפס על מתקן שקיים.
  -- הקיצוץ מוגבל למילים בנות 5 ומעלה, כדי שלא ניצור מילים קצרות
  -- ומקריות שיתאימו לחצי מהטבלה.
  forms as (
    select t as t, t as root from words
    union
    select t, substr(t, 2) from words
    where length(t) >= 5 and substr(t, 1, 1) in ('ל','ב','ה','מ','ש','ו','כ')
  ),
  scored as (
    select
      e.id, e.name, e.name_i18n->>'he' as name_he,
      p.name as park_name, l.name as land_name,
      e.category, e.status, e.status_note, e.intensity,
      e.height_requirement_cm, e.max_height_requirement_cm, e.gets_wet, e.wheelchair,
      e.motion_sickness_warning, e.skip_line_system, e.last_verified,
      -- ⚠️ **count(distinct f.t) ולא count(*)** — מילה אחת שמתאימה גם
      -- בצורתה המלאה וגם בלי התחילית היא **מילה אחת**, ושתי צורות של
      -- אותה מילה לא אמורות לדחוק החוצה מתקן שהתאים בשתי מילים שונות.
      (select count(distinct f.t) from forms f
        where e.name ilike '%' || f.root || '%'
           or coalesce(e.name_i18n->>'he', '') ilike '%' || f.root || '%'
           -- ⚠️ גם השמות הנרדפים. "מסע אל ההר" ו-"אוורסט" הם אותו מתקן.
           or exists (
             select 1 from jsonb_array_elements_text(
               coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
             where a ilike '%' || f.root || '%'
           )) as hits
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where (p_park is null or p.id = p_park or p.name ilike '%' || p_park || '%')
  )
  select
    s.id, s.name, s.name_he, s.park_name, s.land_name,
    s.category, s.status, s.status_note, s.intensity,
    s.height_requirement_cm, s.max_height_requirement_cm, s.gets_wet, s.wheelchair,
    s.motion_sickness_warning, s.skip_line_system, s.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   0     → נבדק ואין מגבלה → מתאים
    --   מספר  → מתאים אם הילד/ה מגיע/ה
    --   NULL  → **לא נבדק** → NULL, ולא true
    -- נגזר בזמן ריצה ואינו מאוחסן — אחרת היה מקור אמת שני שמתיישן
    -- ברגע שהגובה של הילד/ה משתנה.
    -- 🔴 **והתקרה, שנוספה ב-038.** חמישה אזורי מים לפעוטות מגבילים גובה
    -- כלפי מעלה, וכל עוד רק הרצפה נבדקה כאן, ילד גבוה מדי קיבל "מתאים".
    --
    -- ⚠️ הסדר: פסילה לפני התאמה. מי שגבוה מהתקרה **אינו** מתאים, גם אם
    -- הוא עובר את הרצפה בהרבה — וזה בדיוק המקרה שהיה חוזר true.
    --
    -- ⚠️ ותקרה לבדה היא תשובה. על חמש השורות האלה הרצפה היא NULL ("לא
    -- נבדק"), ובלי השורה הזו fits היה נשאר NULL — כלומר "אין לי מידע" על
    -- שורה שיש עליה מידע מלא בכיוון שנשאל.
    case
      when p_height_cm is null then null
      when s.max_height_requirement_cm is not null
           and p_height_cm > s.max_height_requirement_cm then false
      when s.height_requirement_cm is null
        then case when s.max_height_requirement_cm is null then null else true end
      else p_height_cm >= s.height_requirement_cm
    end
  from scored s
  where
    -- בלי שם — כל הפארק, לפי הסינון בלבד.
    (select count(*) from words) = 0
    -- ⚠️ עם שם — **רק ההתאמות הטובות ביותר.** ראה ההערה בראש הקובץ.
    or s.hits = (select max(x.hits) from scored x where x.hits > 0)
  -- ⚠️ מתקן סגור **מוחזר**, עם הסטטוס שלו. סינון שקט היה גורם לטים לומר
  -- "לא מצאתי מתקן כזה" על מתקן שקיים ופשוט סגור.
  order by
    case when p_name is not null and s.name ilike p_name || '%' then 0 else 1 end,
    s.name
  limit least(coalesce(p_limit, 8), 25)
$$;

comment on function public.find_experiences(text, text, int, int) is
  'עובדות על מתקנים, מהטבלה. ⚠️ התאמה לפי מילים ולא לפי ביטוי — שאלה היא משפט, לא שם (הבאג של 029). מוחזרות רק השורות עם מספר המילים התואמות הגבוה ביותר, כדי שמילה אחת מקרית לא תכניס מתקן זר להקשר. fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים". ⚠️ 038: max_height_requirement_cm הוא תקרה ולא רצפה, ומי שגבוה ממנה אינו מתאים.';

revoke all on function public.find_experiences(text, text, int, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.find_experiences(text, text, int, int) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את ההתנהגות ולא את קיום העמודה. עמודה שנוספה ופונקציה שאינה
-- מחזירה אותה נראות זהות מבחוץ, וזה בדיוק הפער שנתפס כאן שוב ושוב.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  n         int;
  tall      boolean;
  short     boolean;
  probe_key text := 'probe-038';
begin
  -- א. העמודה קיימת
  select count(*) into n
    from information_schema.columns
   where table_name = 'experience' and column_name = 'max_height_requirement_cm';
  if n = 0 then
    raise exception '❌ העמודה max_height_requirement_cm לא נוספה.';
  end if;

  -- ב. והפונקציה מחזירה אותה. עמודה שנוספה ופונקציה שלא עודכנה נראות
  --    זהות מבחוץ, וזה בדיוק הפער שנתפס כאן שוב ושוב.
  select count(*) into n
    from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
   where r.routine_name = 'find_experiences' and p.parameter_name = 'max_height_cm';
  if n = 0 then
    raise exception '❌ find_experiences אינה מחזירה max_height_cm. העמודה נוספה והפונקציה נשארה מאחור.';
  end if;

  -- ג. 🔴 **ההתנהגות, ולא ההגדרה.** שורת בדיקה אמיתית נכנסת לטבלה, נשאלת
  --    דרך הפונקציה בשני גבהים, ונמחקת. בלי זה הבדיקה מאשרת שהצינור בנוי
  --    ולא שהוא מוביל מים.
  -- 🔴 **השורה מועתקת משורה אמיתית, ולא נבנית מאפס.**
  --
  -- הגרסה הקודמת מנתה עמודות ביד ונכשלה על `type` — עמודת NOT NULL
  -- שלא הייתה ברשימה. תיקון עמודה־עמודה היה נכשל שוב על הבאה: הטבלה
  -- נושאת עשרות עמודות, וכל אחת שנוספת בעתיד הייתה שוברת את הבדיקה.
  --
  -- ⚠️ `select *` מעותק של הטבלה מבטיח שכל עמודות החובה מלאות בערכים
  -- חוקיים, ושרק מה שנבדק כאן נדרס. עמודה חדשה שתתווסף מחר לא תשבור
  -- כלום.
  create temporary table probe_row on commit drop as
    select * from experience limit 1;
  update probe_row set
                     id = probe_key, key = probe_key,
                     name = 'Probe Tot Area 038',
                     status = 'open', status_note = null,
                     -- ⚠️ הרצפה ריקה והתקרה מלאה — בדיוק המצב של חמש השורות האמיתיות,
                     -- והמצב שבו fits חייב להיגזר מהתקרה לבדה.
                     height_requirement_cm = null,
                     max_height_requirement_cm = 122;
  insert into experience select * from probe_row;

  -- ילד בגובה 130 גבוה מהתקרה של 122 → **אינו** מתאים
  select f.fits into tall
    from find_experiences('Probe Tot Area 038', null, 130, 5) f
   limit 1;

  -- וילד בגובה 100 נמצא מתחתיה → מתאים
  select f.fits into short
    from find_experiences('Probe Tot Area 038', null, 100, 5) f
   limit 1;

  delete from experience where key = probe_key;

  if tall is distinct from false then
    raise exception '❌ ילד בגובה 130 קיבל fits=% על תקרה של 122. התקרה אינה נאכפת.', coalesce(tall::text, 'NULL');
  end if;
  if short is distinct from true then
    raise exception '❌ ילד בגובה 100 קיבל fits=% על תקרה של 122. התקרה חוסמת את מי שהיא נועדה לשרת.', coalesce(short::text, 'NULL');
  end if;

  raise notice '✅ 038 הותקנה — 130 ס"מ נחסם מתקרה של 122, ו-100 ס"מ עובר.';
exception when others then
  -- ⚠️ שורת הבדיקה נמחקת גם כשמשהו נכשל. שורה מלאכותית ששרדה במסד היא
  -- מתקן שלא קיים, והוא היה מופיע בתשובות של טים.
  delete from experience where key = probe_key;
  raise;
end $$;

COMMIT;

-- ── מה שרואים עכשיו ──────────────────────────────────────────────────
-- ⚠️ אחרי טעינת התוכן החדש, חמש השורות האלה צריכות להופיע כאן — ורק הן.
select name,
       height_requirement_cm     as "רצפה",
       max_height_requirement_cm as "תקרה"
  from experience
 where max_height_requirement_cm is not null
 order by name;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('038_max_height.sql', 'sha256:a3d4d18cb6811b99c45cc25ea10c548d',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 039_sensitivity_flags_to_tim.sql
-- ==========================================================================

set search_path = public, extensions;

-- ── 039 · ארבעת דגלי הרגישות מגיעים לטים ────────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת, **אחרי 038**.
-- אושר על ידי פולה דרך פיליפ, 08.09.
--
-- 🔴 מה שהיה, ואיש לא ידע:
--
-- נטע שאלה את טים אם Buzz Lightyear מתאים לילד שמפחד מחושך. הוא ענה
-- "אין לי מידע מפורט לגבי רמת החשיכה" — **והוא צדק.**
--
-- `find_experiences` החזירה גובה · עוצמה · הרטבה · דילוג בתור · סטטוס.
-- ארבע עמודות הרגישות — חושך, גבהים, רעש פתאומי, הבזקים — לא היו ברשימה
-- כלל. הנתון מלא על כל 165 המתקנים, ומעולם לא עזב את הטבלה.
--
-- ⚠️ וזה **הפיצ'ר שאין לאף מתחרה בעברית**. הוא נאסף, נבדק, אוחסן — ולא
-- הוצג. כשל בתפר, לא בדאטא ולא במודל.
--
-- ── תנאי הניסוח של פולה, ולמה הוא בגוף המיגרציה ─────────────────────
--
-- הדגלים הם מחקר של רוני, לא מקור רשמי מדרגה T1. טים חייב לומר "לפי
-- המידע שלנו, המתקן מסומן כ..." ולא "המתקן כולל הבזקי אור".
--
-- ⚠️ ההבדל אינו נימוס: משפחה עם ילד רגיש לאור מקבלת החלטה רפואית
-- מהמשפט הזה, וההבדל בין "בדקנו וזה כך" ל"כך אנחנו מסמנים" הוא ההבדל
-- בין מידע לבין הבטחה. ההוראה יושבת ב-index.ts, והתזכורת כאן כדי שמי
-- שיקרא את הפונקציה יידע שהיא קיימת.

BEGIN;

set local search_path = public, extensions;

-- 🔴 **drop לפני create, ובכוונה.**
--
-- `create or replace` אינו יכול לשנות את מבנה הטבלה שהפונקציה מחזירה.
-- העמודה החדשה משנה אותו, ולכן ההרצה נכשלת עם:
--   "cannot change return type of existing function"
--
-- ⚠️ ומה שזה מוחק יחד עם הפונקציה: **ההרשאות.** drop מסיר גם את
-- ה-grant ל-anon, וטים היה נופל על 403 בלי ששום דבר ייראה שבור. בלוק
-- ההרשאות בסוף הקובץ כותב אותן מחדש — הוא לא קישוט.
--
-- ⚠️ והכל בתוך טרנזקציה אחת: בין ה-drop ל-create הפונקציה אינה קיימת,
-- ובלי BEGIN/COMMIT היה חלון שבו טים מחזיר 404.
drop function if exists public.find_experiences(text, text, int, int);

create or replace function public.find_experiences(
  p_name        text default null,
  p_park        text default null,
  p_height_cm   int  default null,
  p_limit       int  default 8
)
returns table (
  id            text,
  name          text,
  name_he       text,
  park          text,
  land          text,
  category      text,
  status        text,
  status_note   text,
  intensity     int,
  height_cm     int,
  max_height_cm int,
  gets_wet      text,
  wheelchair    text,
  motion_sickness text,
  sens_dark     boolean,
  sens_heights  boolean,
  sens_loud     boolean,
  sens_strobe   boolean,
  skip_line     text,
  last_verified date,
  fits          boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with tok as (
    -- ⚠️ פיצול על רווח בלבד, וקיצוץ פיסוק מהקצוות ב-btrim.
    -- **בכוונה בלי מחלקות תווים כמו [:alnum:]** — הן תלויות ב-locale,
    -- והמסד המקומי (C) והמסד בסופאבייס (UTF-8) היו מתנהגים אחרת.
    -- זה הכשל שכבר תפס אותי שלוש פעמים (search_path, format_type),
    -- ואות עברית היא בדיוק סוג התו שנופל בין ההגדרות.
    select distinct btrim(t, ',.;:!?()"''[]{}<>/-') as t
    from regexp_split_to_table(coalesce(p_name, ''), '[[:space:]]+') t
  ),
  words as (
    -- שתי אותיות אינן מילה מזהה; הן שאריות של מילות קישור.
    select t from tok where length(t) >= 3
  ),
  -- ⚠️ **תחיליות עבריות.** "לספייס" ו-"באקספדישן" הן אותה מילה עם אות
  -- אחת מלפנים, ו-ilike על מחרוזת אינו יודע את זה. בלי זה שאלה טבעית
  -- ("כדאי ללכת לספייס מאונטיין") מחזירה אפס על מתקן שקיים.
  -- הקיצוץ מוגבל למילים בנות 5 ומעלה, כדי שלא ניצור מילים קצרות
  -- ומקריות שיתאימו לחצי מהטבלה.
  forms as (
    select t as t, t as root from words
    union
    select t, substr(t, 2) from words
    where length(t) >= 5 and substr(t, 1, 1) in ('ל','ב','ה','מ','ש','ו','כ')
  ),
  scored as (
    select
      e.id, e.name, e.name_i18n->>'he' as name_he,
      p.name as park_name, l.name as land_name,
      e.category, e.status, e.status_note, e.intensity,
      e.height_requirement_cm, e.max_height_requirement_cm, e.gets_wet, e.wheelchair,
      e.motion_sickness_warning,
      e.sens_enclosed_dark, e.sens_heights, e.sens_loud_sudden, e.sens_strobe,
      e.skip_line_system, e.last_verified,
      -- ⚠️ **count(distinct f.t) ולא count(*)** — מילה אחת שמתאימה גם
      -- בצורתה המלאה וגם בלי התחילית היא **מילה אחת**, ושתי צורות של
      -- אותה מילה לא אמורות לדחוק החוצה מתקן שהתאים בשתי מילים שונות.
      (select count(distinct f.t) from forms f
        where e.name ilike '%' || f.root || '%'
           or coalesce(e.name_i18n->>'he', '') ilike '%' || f.root || '%'
           -- ⚠️ גם השמות הנרדפים. "מסע אל ההר" ו-"אוורסט" הם אותו מתקן.
           or exists (
             select 1 from jsonb_array_elements_text(
               coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
             where a ilike '%' || f.root || '%'
           )) as hits
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where (p_park is null or p.id = p_park or p.name ilike '%' || p_park || '%')
  )
  select
    s.id, s.name, s.name_he, s.park_name, s.land_name,
    s.category, s.status, s.status_note, s.intensity,
    s.height_requirement_cm, s.max_height_requirement_cm, s.gets_wet, s.wheelchair,
    s.motion_sickness_warning,
    s.sens_enclosed_dark, s.sens_heights, s.sens_loud_sudden, s.sens_strobe,
    s.skip_line_system, s.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   0     → נבדק ואין מגבלה → מתאים
    --   מספר  → מתאים אם הילד/ה מגיע/ה
    --   NULL  → **לא נבדק** → NULL, ולא true
    -- נגזר בזמן ריצה ואינו מאוחסן — אחרת היה מקור אמת שני שמתיישן
    -- ברגע שהגובה של הילד/ה משתנה.
    -- 🔴 **והתקרה, שנוספה ב-038.** חמישה אזורי מים לפעוטות מגבילים גובה
    -- כלפי מעלה, וכל עוד רק הרצפה נבדקה כאן, ילד גבוה מדי קיבל "מתאים".
    --
    -- ⚠️ הסדר: פסילה לפני התאמה. מי שגבוה מהתקרה **אינו** מתאים, גם אם
    -- הוא עובר את הרצפה בהרבה — וזה בדיוק המקרה שהיה חוזר true.
    --
    -- ⚠️ ותקרה לבדה היא תשובה. על חמש השורות האלה הרצפה היא NULL ("לא
    -- נבדק"), ובלי השורה הזו fits היה נשאר NULL — כלומר "אין לי מידע" על
    -- שורה שיש עליה מידע מלא בכיוון שנשאל.
    case
      when p_height_cm is null then null
      when s.max_height_requirement_cm is not null
           and p_height_cm > s.max_height_requirement_cm then false
      when s.height_requirement_cm is null
        then case when s.max_height_requirement_cm is null then null else true end
      else p_height_cm >= s.height_requirement_cm
    end
  from scored s
  where
    -- בלי שם — כל הפארק, לפי הסינון בלבד.
    (select count(*) from words) = 0
    -- ⚠️ עם שם — **רק ההתאמות הטובות ביותר.** ראה ההערה בראש הקובץ.
    or s.hits = (select max(x.hits) from scored x where x.hits > 0)
  -- ⚠️ מתקן סגור **מוחזר**, עם הסטטוס שלו. סינון שקט היה גורם לטים לומר
  -- "לא מצאתי מתקן כזה" על מתקן שקיים ופשוט סגור.
  order by
    case when p_name is not null and s.name ilike p_name || '%' then 0 else 1 end,
    s.name
  limit least(coalesce(p_limit, 8), 25)
$$;

comment on function public.find_experiences(text, text, int, int) is
  'עובדות על מתקנים, מהטבלה. ⚠️ התאמה לפי מילים ולא לפי ביטוי — שאלה היא משפט, לא שם (הבאג של 029). מוחזרות רק השורות עם מספר המילים התואמות הגבוה ביותר, כדי שמילה אחת מקרית לא תכניס מתקן זר להקשר. ⚠️ 039: ארבעת דגלי הרגישות מוחזרים, והם מחקר שלנו ולא מקור רשמי — הניסוח חייב לומר "לפי המידע שלנו". fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים". ⚠️ 038: max_height_requirement_cm הוא תקרה ולא רצפה, ומי שגבוה ממנה אינו מתאים.';

revoke all on function public.find_experiences(text, text, int, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.find_experiences(text, text, int, int) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק שהערך **מגיע**, ולא שהעמודה קיימת. זה בדיוק הפער שנוצר כאן:
-- העמודה הייתה מלאה, הפונקציה לא החזירה אותה, וכל שכבה נראתה תקינה.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  probe_key text := 'probe-039';
  got       boolean;
  n         int;
begin
  select count(*) into n
    from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
   where r.routine_name = 'find_experiences'
     and p.parameter_name in ('sens_dark','sens_heights','sens_loud','sens_strobe');
  if n < 4 then
    raise exception '❌ find_experiences מחזירה % דגלי רגישות מתוך 4.', n;
  end if;

  -- 🔴 וההתנהגות: דגל שנכתב בטבלה חייב לחזור מהפונקציה. שורת בדיקה
  -- אמיתית, ונמחקת גם בכישלון.
  -- 🔴 **השורה מועתקת משורה אמיתית, ולא נבנית מאפס.**
  --
  -- הגרסה הקודמת מנתה עמודות ביד ונכשלה על `type` — עמודת NOT NULL
  -- שלא הייתה ברשימה. תיקון עמודה־עמודה היה נכשל שוב על הבאה: הטבלה
  -- נושאת עשרות עמודות, וכל אחת שנוספת בעתיד הייתה שוברת את הבדיקה.
  --
  -- ⚠️ `select *` מעותק של הטבלה מבטיח שכל עמודות החובה מלאות בערכים
  -- חוקיים, ושרק מה שנבדק כאן נדרס. עמודה חדשה שתתווסף מחר לא תשבור
  -- כלום.
  create temporary table probe_row on commit drop as
    select * from experience limit 1;
  update probe_row set
                     id = probe_key, key = probe_key,
                     name = 'Probe Dark Ride 039',
                     status = 'open', status_note = null,
                     sens_enclosed_dark = true;
  insert into experience select * from probe_row;

  select f.sens_dark into got
    from find_experiences('Probe Dark Ride 039', null, null, 5) f limit 1;

  delete from experience where key = probe_key;

  if got is distinct from true then
    raise exception '❌ הדגל נכתב כ-true וחזר כ-%. הערך אינו עובר את הפונקציה.', coalesce(got::text, 'NULL');
  end if;

  raise notice '✅ 039 הותקנה — דגל שנכתב בטבלה חוזר מהפונקציה.';
exception when others then
  delete from experience where key = probe_key;
  raise;
end $$;

COMMIT;

select '✅ 039 הותקנה' as "מצב";

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('039_sensitivity_flags_to_tim.sql', 'sha256:7470162c5a7eca7d8c06977fd1191f8a',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 040_sensitivity_four_states.sql
-- ==========================================================================

set search_path = public, extensions;

-- ── 040 · ארבעת דגלי הרגישות עוברים לארבעה מצבים ────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת, **אחרי 039**.
-- אושר על ידי פולה דרך פיליפ, 08.09.
--
-- 🔴 הבאג, וההופעה השלישית שלו:
--
-- המאסטר כותב `N/A` על 77 שורות Entertainment — מופעים, מצעדים ומפגשי
-- דמויות — ומשמעותו **"השאלה אינה חלה"**. `boolean` מחזיק שלושה מצבים
-- בלבד, ולכן `N/A` כווץ ל-`NULL`, שאצלנו פירושו **"לא נבדק"**.
--
-- ⚠️ שתי אמירות שונות לגמרי נשמעו זהות. ומה שזה עשה בפועל: משפחה שביקשה
-- להימנע מגבהים **איבדה את כל 77 המופעים מהתוצאות** — בדיוק מה שהכי
-- מתאים לה — וקיבלה הודעה שהנתון לא נבדק, בעוד שהוא כן.
--
-- ⚠️ ולא היה כאן מיפוי חסר. `boolFlag` לא "שכח" למפות — **לא היה ל-na
-- לאן ללכת.** טיפוס היעד לא הכיר את הערך, בשלוש השכבות: סכימה, ייבוא,
-- ועמודה במסד.
--
-- ── והופעה רביעית כבר גלויה ─────────────────────────────────────────
--
-- ארבע עמודות מספריות נושאות N/A היום: inversions (222) · max_speed_kmh
-- (219) · duration_minutes (88) · opened_year (10). למופע אין מהירות
-- מרבית — זה "לא חל", לא "לא נמדד". מנגנון למספרים שונה מזה של דגל,
-- והוא סבב נפרד; `src/lib/__tests__/na-columns.test.ts` מחזיק אותן
-- ברשימה מפורשת כדי שההיעדר ייראה ולא ייבלע.

BEGIN;

set local search_path = public, extensions;

-- ⚠️ ההמרה מפורשת ואינה נשענת על cast אוטומטי. `true::text` ב-Postgres
-- הוא 't' ולא 'true', ו-cast שקט היה ממלא את העמודה בערכים שאינם
-- באוצר המילים — ואז ה-CHECK היה נכשל על נתונים תקינים.
do $$
declare c text;
begin
  foreach c in array array['sens_enclosed_dark','sens_heights','sens_loud_sudden','sens_strobe'] loop
    if (select data_type from information_schema.columns
         where table_name = 'experience' and column_name = c) = 'boolean' then
      execute format(
        'alter table experience alter column %I type text using
           case when %I is true then ''true'' when %I is false then ''false'' end', c, c, c);
    end if;
    execute format('alter table experience drop constraint if exists experience_%s_quad', c);
    execute format(
      'alter table experience add constraint experience_%s_quad
         check (%I is null or %I in (''true'',''false'',''na''))', c, c, c);
  end loop;
end $$;

comment on column experience.sens_heights is
  'רגישות לגבהים. ⚠️ ארבעה מצבים: true/false/na/null. "na" = השאלה אינה חלה (מופע), ואינו "לא נבדק". מיגרציה 040.';

-- 🔴 **drop לפני create, ובכוונה.**
--
-- `create or replace` אינו יכול לשנות את מבנה הטבלה שהפונקציה מחזירה.
-- העמודה החדשה משנה אותו, ולכן ההרצה נכשלת עם:
--   "cannot change return type of existing function"
--
-- ⚠️ ומה שזה מוחק יחד עם הפונקציה: **ההרשאות.** drop מסיר גם את
-- ה-grant ל-anon, וטים היה נופל על 403 בלי ששום דבר ייראה שבור. בלוק
-- ההרשאות בסוף הקובץ כותב אותן מחדש — הוא לא קישוט.
--
-- ⚠️ והכל בתוך טרנזקציה אחת: בין ה-drop ל-create הפונקציה אינה קיימת,
-- ובלי BEGIN/COMMIT היה חלון שבו טים מחזיר 404.
drop function if exists public.find_experiences(text, text, int, int);

create or replace function public.find_experiences(
  p_name        text default null,
  p_park        text default null,
  p_height_cm   int  default null,
  p_limit       int  default 8
)
returns table (
  id            text,
  name          text,
  name_he       text,
  park          text,
  land          text,
  category      text,
  status        text,
  status_note   text,
  intensity     int,
  height_cm     int,
  max_height_cm int,
  gets_wet      text,
  wheelchair    text,
  motion_sickness text,
  sens_dark     text,
  sens_heights  text,
  sens_loud     text,
  sens_strobe   text,
  skip_line     text,
  last_verified date,
  fits          boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with tok as (
    -- ⚠️ פיצול על רווח בלבד, וקיצוץ פיסוק מהקצוות ב-btrim.
    -- **בכוונה בלי מחלקות תווים כמו [:alnum:]** — הן תלויות ב-locale,
    -- והמסד המקומי (C) והמסד בסופאבייס (UTF-8) היו מתנהגים אחרת.
    -- זה הכשל שכבר תפס אותי שלוש פעמים (search_path, format_type),
    -- ואות עברית היא בדיוק סוג התו שנופל בין ההגדרות.
    select distinct btrim(t, ',.;:!?()"''[]{}<>/-') as t
    from regexp_split_to_table(coalesce(p_name, ''), '[[:space:]]+') t
  ),
  words as (
    -- שתי אותיות אינן מילה מזהה; הן שאריות של מילות קישור.
    select t from tok where length(t) >= 3
  ),
  -- ⚠️ **תחיליות עבריות.** "לספייס" ו-"באקספדישן" הן אותה מילה עם אות
  -- אחת מלפנים, ו-ilike על מחרוזת אינו יודע את זה. בלי זה שאלה טבעית
  -- ("כדאי ללכת לספייס מאונטיין") מחזירה אפס על מתקן שקיים.
  -- הקיצוץ מוגבל למילים בנות 5 ומעלה, כדי שלא ניצור מילים קצרות
  -- ומקריות שיתאימו לחצי מהטבלה.
  forms as (
    select t as t, t as root from words
    union
    select t, substr(t, 2) from words
    where length(t) >= 5 and substr(t, 1, 1) in ('ל','ב','ה','מ','ש','ו','כ')
  ),
  scored as (
    select
      e.id, e.name, e.name_i18n->>'he' as name_he,
      p.name as park_name, l.name as land_name,
      e.category, e.status, e.status_note, e.intensity,
      e.height_requirement_cm, e.max_height_requirement_cm, e.gets_wet, e.wheelchair,
      e.motion_sickness_warning,
      e.sens_enclosed_dark, e.sens_heights, e.sens_loud_sudden, e.sens_strobe,
      e.skip_line_system, e.last_verified,
      -- ⚠️ **count(distinct f.t) ולא count(*)** — מילה אחת שמתאימה גם
      -- בצורתה המלאה וגם בלי התחילית היא **מילה אחת**, ושתי צורות של
      -- אותה מילה לא אמורות לדחוק החוצה מתקן שהתאים בשתי מילים שונות.
      (select count(distinct f.t) from forms f
        where e.name ilike '%' || f.root || '%'
           or coalesce(e.name_i18n->>'he', '') ilike '%' || f.root || '%'
           -- ⚠️ גם השמות הנרדפים. "מסע אל ההר" ו-"אוורסט" הם אותו מתקן.
           or exists (
             select 1 from jsonb_array_elements_text(
               coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
             where a ilike '%' || f.root || '%'
           )) as hits
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where (p_park is null or p.id = p_park or p.name ilike '%' || p_park || '%')
  )
  select
    s.id, s.name, s.name_he, s.park_name, s.land_name,
    s.category, s.status, s.status_note, s.intensity,
    s.height_requirement_cm, s.max_height_requirement_cm, s.gets_wet, s.wheelchair,
    s.motion_sickness_warning,
    s.sens_enclosed_dark, s.sens_heights, s.sens_loud_sudden, s.sens_strobe,
    s.skip_line_system, s.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   0     → נבדק ואין מגבלה → מתאים
    --   מספר  → מתאים אם הילד/ה מגיע/ה
    --   NULL  → **לא נבדק** → NULL, ולא true
    -- נגזר בזמן ריצה ואינו מאוחסן — אחרת היה מקור אמת שני שמתיישן
    -- ברגע שהגובה של הילד/ה משתנה.
    -- 🔴 **והתקרה, שנוספה ב-038.** חמישה אזורי מים לפעוטות מגבילים גובה
    -- כלפי מעלה, וכל עוד רק הרצפה נבדקה כאן, ילד גבוה מדי קיבל "מתאים".
    --
    -- ⚠️ הסדר: פסילה לפני התאמה. מי שגבוה מהתקרה **אינו** מתאים, גם אם
    -- הוא עובר את הרצפה בהרבה — וזה בדיוק המקרה שהיה חוזר true.
    --
    -- ⚠️ ותקרה לבדה היא תשובה. על חמש השורות האלה הרצפה היא NULL ("לא
    -- נבדק"), ובלי השורה הזו fits היה נשאר NULL — כלומר "אין לי מידע" על
    -- שורה שיש עליה מידע מלא בכיוון שנשאל.
    case
      when p_height_cm is null then null
      when s.max_height_requirement_cm is not null
           and p_height_cm > s.max_height_requirement_cm then false
      when s.height_requirement_cm is null
        then case when s.max_height_requirement_cm is null then null else true end
      else p_height_cm >= s.height_requirement_cm
    end
  from scored s
  where
    -- בלי שם — כל הפארק, לפי הסינון בלבד.
    (select count(*) from words) = 0
    -- ⚠️ עם שם — **רק ההתאמות הטובות ביותר.** ראה ההערה בראש הקובץ.
    or s.hits = (select max(x.hits) from scored x where x.hits > 0)
  -- ⚠️ מתקן סגור **מוחזר**, עם הסטטוס שלו. סינון שקט היה גורם לטים לומר
  -- "לא מצאתי מתקן כזה" על מתקן שקיים ופשוט סגור.
  order by
    case when p_name is not null and s.name ilike p_name || '%' then 0 else 1 end,
    s.name
  limit least(coalesce(p_limit, 8), 25)
$$;

comment on function public.find_experiences(text, text, int, int) is
  'עובדות על מתקנים, מהטבלה. ⚠️ התאמה לפי מילים ולא לפי ביטוי — שאלה היא משפט, לא שם (הבאג של 029). מוחזרות רק השורות עם מספר המילים התואמות הגבוה ביותר, כדי שמילה אחת מקרית לא תכניס מתקן זר להקשר. ⚠️ 040: ארבעת הדגלים הם ארבעה מצבים — true/false/na/null — ו-na אינו "לא נבדק". ⚠️ 039: ארבעת דגלי הרגישות מוחזרים, והם מחקר שלנו ולא מקור רשמי — הניסוח חייב לומר "לפי המידע שלנו". fits נגזר בזמן ריצה, ו-NULL בו פירושו "הגובה לא נבדק" ולא "מתאים". ⚠️ 038: max_height_requirement_cm הוא תקרה ולא רצפה, ומי שגבוה ממנה אינו מתאים.';

revoke all on function public.find_experiences(text, text, int, int) from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.find_experiences(text, text, int, int) to %I', r);
    end if;
  end loop;
end
$$;

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק שההבחנה **שורדת מקצה לקצה**, ולא שהעמודה שינתה טיפוס. עמודה
-- שהומרה ופונקציה שנשארה בוליאנית נראות תקינות עד שמישהו שואל.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  probe_key text := 'probe-040';
  got       text;
begin
  -- 🔴 **השורה מועתקת משורה אמיתית, ולא נבנית מאפס.**
  --
  -- הגרסה הקודמת מנתה עמודות ביד ונכשלה על `type` — עמודת NOT NULL
  -- שלא הייתה ברשימה. תיקון עמודה־עמודה היה נכשל שוב על הבאה: הטבלה
  -- נושאת עשרות עמודות, וכל אחת שנוספת בעתיד הייתה שוברת את הבדיקה.
  --
  -- ⚠️ `select *` מעותק של הטבלה מבטיח שכל עמודות החובה מלאות בערכים
  -- חוקיים, ושרק מה שנבדק כאן נדרס. עמודה חדשה שתתווסף מחר לא תשבור
  -- כלום.
  create temporary table probe_row on commit drop as
    select * from experience limit 1;
  update probe_row set
                     id = probe_key, key = probe_key,
                     name = 'Probe Parade 040',
                     status = 'open', status_note = null,
                     -- ⚠️ 'na' ולא null. זו כל הנקודה: הערך חייב לשרוד עד הפונקציה.
                     sens_heights = 'na';
  insert into experience select * from probe_row;

  select f.sens_heights into got
    from find_experiences('Probe Parade 040', null, null, 5) f limit 1;

  delete from experience where key = probe_key;

  if got is distinct from 'na' then
    raise exception '❌ "na" נכתב בטבלה וחזר כ-%. ההבחנה בין "לא חל" ל"לא נבדק" אינה שורדת.', coalesce(got, 'NULL');
  end if;

  raise notice '✅ 040 הותקנה — "לא חל" שורד מהטבלה ועד הפונקציה.';
exception when others then
  delete from experience where key = probe_key;
  raise;
end $$;

COMMIT;

-- ── מה שרואים עכשיו ──────────────────────────────────────────────────
-- ⚠️ אחרי טעינת התוכן: 77 שורות ב-na, וכולן Entertainment.
select sens_heights as "ערך", count(*) as "שורות"
  from experience group by 1 order by 2 desc;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('040_sensitivity_four_states.sql', 'sha256:83465f62943fcdb016eb8c31ba594e92',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 041_park_intro.sql
-- ==========================================================================

set search_path = public, extensions;

-- 041 — שדה פתיח לטבלת park (09.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 041 — שדה פתיח לטבלת park (09.09)
--
-- משימה של פיליפ, 09.09. לעמוד מדריך הפארק שדנה מעצבת יש סעיף פתיח קצר
-- על אופי הפארק, לפני הטאבים — ולטבלת park אין היום שדה מתאים.
--
-- 🔴 **nullable, בלי ברירת מחדל ובלי מחרוזת ריקה.**
--
-- זה לא סגנון. `not null default ''` על שדה שהתוכן שלו מגיע מאיסוף
-- חיצוני הוא הצהרה ששבע פעמים עד כה התבררה כשקר: הוא הופך "טרם נכתב"
-- ל"נכתב, וריק", ומוחק את ההבדל לפני שמישהו הספיק לשאול. אותה תבנית
-- בדיוק שהפילה את gets_wet, את ארבעת ה-sens_*, את height_requirement_cm
-- ואת skip_line_system.
--
-- ⚠️ ריק כאן פירושו **טרם נכתב**. הממשק אינו מציג מציין מקום ואינו
-- ממציא פתיח — הוא פשוט אינו מציג את הסעיף.
--
-- מקור התוכן: רוני, מסעיף "מה מייחד את הפארק" במדריכי אופי הפארק.
-- שלושה מהם (שלושת פארקי יוניברסל) כבר נכנסו ל-knowledge/ כמסמכי ידע
-- לטים. השדה הזה הוא לעמוד המדריך, שהוא צרכן אחר של אותו תוכן.

BEGIN;

alter table park add column if not exists intro_he text;

comment on column park.intro_he is
  'פתיח קצר על אופי הפארק, 2-3 משפטים. NULL = טרם נכתב, ולעולם לא מחרוזת ריקה.';

-- אימות: השדה קיים, nullable, בלי ברירת מחדל, ואף פארק לא קיבל ערך.
select column_name as "עמודה",
       is_nullable as "מקבל NULL",
       coalesce(column_default, '— אין ברירת מחדל —') as "ברירת מחדל"
  from information_schema.columns
 where table_name = 'park' and column_name = 'intro_he';

select count(*) as "פארקים",
       count(intro_he) as "עם פתיח (צפוי: 0)"
  from park;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('041_park_intro.sql', 'sha256:87781504e654dea6cefc46f6c17dfb14',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 042_description_and_meet_location.sql
-- ==========================================================================

set search_path = public, extensions;

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


-- ==========================================================================
-- מיגרציה: 043_park_candidates.sql
-- ==========================================================================

set search_path = public, extensions;

-- 043 — מועמדים לפי פארק, לשאלות המלצה (09.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 043 — מועמדים לפי פארק (09.09)
--
-- 🔴 **על שאלת המלצה טים לא קיבל ולו מתקן אחד.**
--
-- `find_experiences` נקראת רק כששולפים שם מתקן מהשאלה. "מעדיפים פארקים
-- עם תפאורה יפה" אינה מכילה שם, ולכן חזרו אפס שורות — וכל מה שהיה לו
-- לענות ממנו היה מדריכי האופי, שהם פרוזה. לכן הוא ענה בפסקאות אווירה
-- בלי ולו מתקן אחד בשם.
--
-- ⚠️ **הכרעת פולה, 09.09:** לכל פארק שמוצג יש לצרף 2-3 מתקנים ספציפיים
-- בשם, מסוננים לפי מה שנאמר. שורת אווירה לבדה אינה המלצה.
--
-- ⚠️ **ואין כאן סינון עוצמה, בכוונה.** התפתיתי להוסיף p_max_intensity
-- ולגזור אותו מהשאלה — אבל "לא אוהבים אקסטרים מדי" הוא משפט שמודל קורא
-- נכון ו-regex קורא בערך. פרישה על פני רמות העוצמה נשלחת אליו, הוא
-- מסנן, וההוראות אומרות לו במפורש לפי מה. סינון שגוי בשרת היה מוחק
-- מתקנים מתאימים בלי שאיש יראה.

BEGIN;

drop function if exists public.park_candidates(int);

create function public.park_candidates(p_per_park int default 4)
returns table (
  park          text,
  name          text,
  name_he       text,
  land          text,
  category      text,
  intensity     int,
  height_cm     int,
  max_height_cm int,
  gets_wet      text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with ranked as (
    select
      p.name as park_name,
      e.name,
      e.name_i18n->>'he' as name_he,
      l.name as land_name,
      e.category,
      e.intensity,
      e.height_requirement_cm,
      e.max_height_requirement_cm,
      e.gets_wet,
      -- ⚠️ פרישה על פני העוצמות, ולא "הכי פופולרי". מטרת השורות האלה
      -- היא לתת למודל ממה לבחור בשני הכיוונים — מי שרוצה רגוע ומי
      -- שרוצה חזק — ולכן הדירוג הוא בתוך כל רמת עוצמה בנפרד.
      row_number() over (
        partition by p.id, e.intensity
        order by e.name
      ) as rn
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where p.park_kind = 'theme'
      -- ⚠️ שבעת פארקי הנושא בלבד (הכרעת פולה). פארק מים אינו תשובה
      -- לשאלה "איזה פארק מתאים לנו".
      and e.kind = 'attraction'
      -- ⚠️ מתקן סגור אינו מועמד להמלצה. זה שונה משאלה על מתקן שמות,
      -- שם סגור **כן** מוחזר עם הסטטוס שלו — כי שם נשאלנו עליו.
      and e.status = 'open'
      -- 🔴 **ומתקן בלי דירוג עוצמה אינו נכנס** (CLAUDE.md). הוא היה
      -- מגיע כ"עוצמה לא דורגה" לתוך תשובה שכל כולה על עוצמה.
      and e.intensity is not null
  )
  select park_name, name, name_he, land_name, category,
         intensity, height_requirement_cm, max_height_requirement_cm, gets_wet
    from ranked
   where rn <= greatest(coalesce(p_per_park, 4), 1)
   order by park_name, intensity, name
$$;

revoke all on function public.park_candidates(int) from public;
grant execute on function public.park_candidates(int) to anon, authenticated;

-- אימות: שבעה פארקים, פרישה על פני רמות העוצמה, ואפס לא־מדורגים.
select park as "פארק", count(*) as "מועמדים",
       min(intensity) as "עוצמה מינ׳", max(intensity) as "עוצמה מקס׳"
  from public.park_candidates(3)
 group by park order by park;

select count(*) filter (where intensity is null) as "בלי דירוג (צפוי: 0)"
  from public.park_candidates(3);

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('043_park_candidates.sql', 'sha256:8667d1de9033ebdc5f4956abeb587367',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 044_turn_log.sql
-- ==========================================================================

set search_path = public, extensions;

-- 044 — יומן תשובות: מה טים לא ידע, ולמה (14.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 044 — יומן תשובות (14.09)
--
-- 🔴 **אנחנו עיוורים.** אנחנו יודעים שמשהו בטים שבור רק אם נטע שואלת
-- במקרה את השאלה הנכונה. ב-09.09 זה קרה שש פעמים — כולל תשובה "אין לי
-- את הנתון" על מתקן שהעמודה שלו מלאה אצלנו, שחיה ימים בלי שאיש ידע.
--
-- ── למה טבלה נפרדת, ולא `conversation`/`message` מ-005 ───────────────
--
-- ⚠️ **הגרסה הקודמת של הקובץ הזה ניסתה למחזר את הטבלאות של 005 ונפלה:**
-- `conversation.user_id` הוא `not null references profile(id)`. זו לא
-- תקלה טכנית שצריך לעקוף — זו הטבלה **אומרת בקול** למה היא נועדה.
-- 005 בנוי לשיחות של משתמש מזוהה, עם RLS לפי `auth.uid()` (006).
-- היומן הזה בנוי להיות אנונימי. שני דברים מנוגדים.
--
-- 🔴 **ולעקוף היה עולה פעמיים.** היה צריך (א) להפוך `user_id` ל-nullable
-- — ואז שיחה אמיתית שנשמרת בלי בעלים נעלמת מתחת ל-RLS בשקט, בדיוק
-- הכשל שהמוצר בנוי נגדו; (ב) `revoke all` על הטבלאות, כלומר לנעול
-- מראש את השיחות המזוהות שנטע ביקשה שנאסוף.
--
-- ✅ **טבלה נפרדת פותרת את שתיהן, ומחזקת את תנאי 4 של גיא:** ל-`turn_log`
-- אין עמודה שיכולה להחזיק מזהה. לא `user_id`, לא `conversation_id`,
-- לא IP. זו אינה הבטחה בהערה — אין לאן לכתוב.
--
-- ── ארבעת התנאים של גיא (09.09), וכולם נאכפים כאן ולא בקריאה ──────
--
-- 1. **RLS בלי policy.** הטבלה נסגרת לחלוטין. PostgREST אינו יכול לקרוא
--    או לכתוב אליה ישירות — הכתיבה עוברת דרך פונקציה אחת.
-- 2. **90 יום, נאכף בקוד.** כל כתיבה מוחקת את מה שעבר את החלון. בלי
--    מתזמן, בלי משימה שמישהו צריך לזכור להריץ.
-- 3. **תקרת אורך**, כדי ששורה אחת לא תישא מסמך.
-- 4. **טקסט השאלה רק כשטים לא ידע לענות.**
--
-- 🔴 **ותנאי 4 נאכף בפונקציה ולא בקריאה אליה.** אילו הקורא היה מחליט
-- מה לשלוח, באג אחד בצד הלקוח היה שומר הכול — והתנאי של גיא היה הופך
-- להמלצה. הפונקציה מאפסת את הטקסט בעצמה כשהתשובה נענתה, ולכן גם קריאה
-- שגויה אינה יכולה לחרוג.

BEGIN;

set local search_path = public, extensions;

-- ── 1. הטבלה ────────────────────────────────────────────────────────
-- ⚠️ **שורה אחת לכל תור, בלי קישור בין תורות.** מזהה שיחה שנשמר לאורך
-- זמן הוא מזהה משתמש בתחפושת, וקישור בין תורות אינו נדרש לשום דבר
-- שהיומן הזה נועד לו.
create table if not exists turn_log (
  id             uuid primary key default gen_random_uuid(),

  -- 🔴 **null כאן פירושו "נענתה, ולכן לא נשמרה"** — לא "לא נבדק".
  -- זה המצב היחיד שבו העמודה ריקה, והפונקציה היא זו שמאפסת אותה.
  question       text check (length(question) <= 500),

  answered       boolean not null,
  refusal_reason text check (refusal_reason in
                    ('no_data','unverified','safety_official_only','out_of_scope')),
  model          text,
  input_tokens   int,
  output_tokens  int,
  created_at     timestamptz not null default now(),

  -- תנאי 4, גם ברמת הסכמה ולא רק בפונקציה: תשובה שנענתה לא נושאת טקסט.
  constraint turn_log_answered_has_no_question
    check (not (answered and question is not null))
);

create index if not exists turn_log_age_idx on turn_log (created_at);
create index if not exists turn_log_unanswered_idx on turn_log (created_at desc)
  where answered = false;

comment on table turn_log is
  'יומן תורות אנונימי. אין בו עמודה שיכולה להחזיק מזהה משתמש — זו ההגנה, לא הערה.';
comment on column turn_log.question is
  'טקסט השאלה נשמר רק כשטים לא ידע לענות. null = נענתה. נאכף ב-log_turn וב-check.';

-- ── 2. סגירה מלאה ───────────────────────────────────────────────────
-- ⚠️ **בלי policy בכוונה.** RLS בלי מדיניות פירושו שאיש אינו עובר —
-- וזו בדיוק הכוונה. security definer עוקף, וזה השער היחיד.
alter table turn_log enable row level security;
alter table turn_log force  row level security;
revoke all on turn_log from anon, authenticated;

-- ── 3. השער היחיד ───────────────────────────────────────────────────
create or replace function public.log_turn(
  p_question       text,
  p_answered       boolean,
  p_refusal_reason text default null,
  p_model          text default null,
  p_input_tokens   int  default null,
  p_output_tokens  int  default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_question text;
begin
  -- 🔴 **תנאי 4 של גיא, ונאכף כאן.** תשובה שנענתה אינה שומרת את השאלה,
  -- ולא משנה מה נשלח. הקורא אינו יכול לחרוג מזה גם בטעות.
  v_question := case when p_answered then null
                     else left(coalesce(p_question, ''), 500) end;
  if v_question = '' then v_question := null; end if;

  insert into turn_log (
    question, answered, refusal_reason, model, input_tokens, output_tokens
  ) values (
    v_question, p_answered,
    case when p_answered then null else p_refusal_reason end,
    p_model, p_input_tokens, p_output_tokens
  );

  -- 🔴 **תנאי 2, ונאכף בכל כתיבה.** מחיקה מתוזמנת היא משימה שמישהו
  -- צריך לזכור, וזה בדיוק סוג הדבר שנשכח כאן שלוש פעמים באותו יום.
  delete from turn_log t
   where t.id in (
     select t2.id from turn_log t2
      where t2.created_at < now() - interval '90 days'
      limit 200
   );
end;
$$;

revoke all on function public.log_turn(text, boolean, text, text, int, int) from public;
grant execute on function public.log_turn(text, boolean, text, text, int, int)
  to anon, authenticated;

-- ── 4. מה שנטע וגיא קוראים ──────────────────────────────────────────
-- ⚠️ ה-View יורש את ה-RLS של הטבלה, ולכן נקרא רק מה-SQL Editor.
create or replace view unanswered_turns as
  select created_at, refusal_reason, question, model
    from turn_log
   where answered = false
   order by created_at desc;

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('044_turn_log.sql', 'sha256:2c1748938e0ab76ed2e507cffbc26254',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- מיגרציה: 045_country.sql
-- ==========================================================================

set search_path = public, extensions;

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


-- ==========================================================================
-- מיגרציה: 046_tester_note.sql
-- ==========================================================================

set search_path = public, extensions;

-- 046 — הערות בודק, מגרסת הבדיקה של טים (22.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase → SQL Editor
-- שם השאילתה: 046 — הערות בודק (22.09)
--
-- ⛔ **לפני ההרצה: להחליף את מפתח הבודק בשורה המסומנת.** לייצר
-- מחרוזת אקראית ארוכה, ולהדביק אותה גם כאן וגם במסך גרסת הבדיקה.
-- לא לשלוח אותה בצ'אט.
--
-- 🔴 **למה זה קיים:** ההערות של נטע נשמרו ב-localStorage של הדפדפן.
-- ניקוי נתוני אתר מוחק אותן, ומעבר למחשב אחר מאבד אותן. מקור יחיד
-- שאפשר לאבד בלחיצה אינו מקור.
--
-- ── מה זה לא ─────────────────────────────────────────────────────────
-- ⚠️ **זו אינה עמודה על `message`.** פולה הציעה `tester_note text`
-- שם. טבלה נפרדת, ומשלוש סיבות: מי שכותב אינו בעל השיחה ולכן צריך
-- מדיניות אחרת; סבב בדיקה נגמר וההערות נמחקות בלי לגעת בשיחות; ו-
-- `insert` לטבלה ריקה אינו אותו סיכון כמו `update` על טבלת השיחות.
--
-- ⚠️ **ואין `author_id`.** הבודקים הם נטע והצוות, וזהות הכותב אינה
-- נדרשת למטרה. אם תידרש — זו החלטה, לא שדה שמוסיפים כי נוח.

BEGIN;

set local search_path = public, extensions;

create table if not exists tester_note (
  id          uuid primary key default gen_random_uuid(),
  -- ⚠️ מזהה התור מהמסך (`q0`, `q1`…) ולא מפתח זר ל-`message`.
  -- גרסת הבדיקה אינה כותבת ל-`message` כלל, ומפתח זר לשורה שאינה
  -- קיימת היה מפיל את הכתיבה.
  turn_ref    text not null check (length(turn_ref) between 1 and 64),
  session_ref text not null check (length(session_ref) between 1 and 64),
  question    text check (length(question) <= 2000),
  answer      text check (length(answer) <= 8000),
  note        text not null check (length(note) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists tester_note_session_idx on tester_note (session_ref, created_at);

alter table tester_note enable row level security;
alter table tester_note force  row level security;

-- 🔴 **אין policy, בכוונה — כמו `turn_log`.** `force row level security`
-- בלי policy חוסם את כולם, כולל הבעלים. הכתיבה עוברת דרך הפונקציה
-- למטה בלבד, והקריאה דרך פונקציה נפרדת.
revoke all on tester_note from anon, authenticated;

-- ── מפתח הבודק ──────────────────────────────────────────────────────
-- ⚠️ **המפתח אינו סוד חזק, והוא לא מתיימר להיות.** הוא יושב בדפדפן
-- של נטע ומי שפותח את כלי המפתחים רואה אותו. מה שהוא כן עושה: מונע
-- ממי שנתקל בכתובת לכתוב שורות. זה הסיכון הריאלי, והטבלה מחזיקה
-- הערות של נטע ולא נתוני משתמשים.
create or replace function public.tester_key() returns text
language sql immutable parallel safe
as $$ select 'YOUR-TESTER-KEY-HERE' $$;  -- ⛔ להחליף לפני ההרצה

revoke all on function public.tester_key() from public, anon, authenticated;

create or replace function public.save_tester_note(
  p_key         text,
  p_turn_ref    text,
  p_session_ref text,
  p_note        text,
  p_question    text default null,
  p_answer      text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- ⚠️ **נופל, ולא מחזיר בשקט.** כתיבה שנדחתה ולא נאמרה נראית למי
  -- שכותבת בדיוק כמו כתיבה שהצליחה — וההערה תיעלם בלי שתדע.
  if p_key is distinct from public.tester_key() then
    raise exception 'מפתח בודק שגוי';
  end if;

  if coalesce(trim(p_note), '') = '' then
    raise exception 'הערה ריקה אינה נשמרת';
  end if;

  insert into tester_note (turn_ref, session_ref, note, question, answer)
  values (
    left(p_turn_ref, 64),
    left(p_session_ref, 64),
    left(trim(p_note), 2000),
    left(p_question, 2000),
    left(p_answer, 8000)
  );

  -- ⚠️ תקרה, כדי שדף שנתקע בלולאה לא ימלא את המסד. 500 הערות הן
  -- הרבה מעבר לסבב בדיקה אמיתי.
  delete from tester_note
   where id in (
     select id from tester_note order by created_at desc offset 500
   );
end;
$$;

revoke all on function public.save_tester_note(text, text, text, text, text, text) from public;
grant execute on function public.save_tester_note(text, text, text, text, text, text) to anon, authenticated;

-- ── קריאה — דרך שער, לא דרך גרנט ────────────────────────────────────
create or replace function public.tester_notes(p_limit int default 200)
returns table (created_at timestamptz, session_ref text, turn_ref text,
               note text, question text, answer text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select created_at, session_ref, turn_ref, note, question, answer
    from tester_note
   order by created_at desc
   limit least(coalesce(p_limit, 200), 500);
$$;

revoke all on function public.tester_notes(int) from public, anon, authenticated;

-- 🔴 **ולמי כן — `ci_verify`, וזו הכרעה שצריכה את גיא.**
--
-- נטע קבעה (14.09) שהיא אינה מריצה בדיקות ידניות, והצעתי לה קובץ
-- להרצה. זו הייתה חזרה לאחור. הקריאה צריכה לקרות בלי שהיא תיגע בכלום,
-- ולכן היא עוברת ל-CI — אותו דפוס כמו כל שאר הסודות כאן.
--
-- ⚠️ **ו-`ci_verify` ולא תפקיד רביעי חדש**, כי הוא כבר קיים ויש לו
-- סוד ב-GitHub. תפקיד נוסף פירושו סיסמה נוספת שנטע מדביקה.
--
-- ⚠️ **ומה שזה כן מותח:** גיא פיצל את `ci_verify` מ-`ci_content`
-- בכוונה, והערות בודק אינן אף אחד משניהם. הטיעון בעד: הטבלה מחזיקה
-- מילים של נטע על תשובות של טים — אין בה נתוני משתמשים, ואין בה מה
-- לדלוף. הטיעון נגד: זו הרחבה שלישית לתפקיד שהוגדר למשימה אחת.
--
-- **זו שאלה לגיא ולא החלטה שלי.** אם הוא מעדיף תפקיד נפרד — השורה
-- הזו יורדת ונכתב קובץ תפקיד משלו.
grant execute on function public.tester_notes(int) to ci_verify;

COMMIT;

-- ── אימות ───────────────────────────────────────────────────────────
-- 🔴 עמודת "עובר" חייבת להיות ✅ בכל שורה.
select 'הטבלה קיימת' as "הבדיקה",
       (select count(*)::text from information_schema.tables
         where table_schema = 'public' and table_name = 'tester_note') as "יצא",
       '1' as "צפוי"
union all
select 'RLS כפוי בלי policy',
       (select count(*)::text from pg_policies where tablename = 'tester_note'), '0'
union all
select 'ל-anon אין גישה ישירה לטבלה',
       (select count(*)::text from information_schema.role_table_grants
         where grantee = 'anon' and table_name = 'tester_note'), '0'
union all
select 'ול-anon יש רק את פונקציית הכתיבה',
       (select count(*)::text from information_schema.role_routine_grants
         where grantee = 'anon' and routine_name in ('save_tester_note','tester_notes','tester_key')), '1'
union all
select '⛔ המפתח הוחלף',
       case when public.tester_key() = 'YOUR-TESTER-KEY-HERE'
            then '🔴 לא הוחלף' else 'כן' end, 'כן';

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('046_tester_note.sql', 'sha256:2987c9f9e159b5d032f0eeb909c3c931',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>


-- ==========================================================================
-- seed: 010_reference.sql
-- ==========================================================================

set search_path = public, extensions;

BEGIN;

-- 010_reference.sql — נתוני ייחוס יציבים בלבד.
--
-- מה שכאן: יעד, שני ריזורטים, ושבעה פארקים. אלה עובדות מבניות שלא משתנות.
-- מה שאין כאן בכוונה: אזורים (lands) ומתקנים. זהו תוכן, וכלל העבודה
-- בפרויקט הוא שתוכן מגיע מנטע ומאומת מול המקורות הרשמיים — לא מהזיכרון
-- של מודל שפה. שתילת רשימת מתקנים "מהידע הכללי" הייתה מכניסה למסד
-- בדיוק את סוג המידע הלא-מאומת שהמוצר קיים כדי לפתור.
--
-- אידמפוטנטי: אפשר להריץ שוב בבטחה.

insert into destination (id, name, name_i18n, country_code, timezone, is_active, sort_order)
values ('orlando','Orlando','{"he":"אורלנדו"}','US','America/New_York',true,1)
on conflict (id) do update set
  name = excluded.name, name_i18n = excluded.name_i18n, is_active = excluded.is_active;

insert into resort (id, destination_id, operator, name, name_i18n, skip_line_system, sort_order)
values
  ('wdw','orlando','disney','Walt Disney World Resort','{"he":"וולט דיסני וורלד"}','lightning_lane',1),
  ('uor','orlando','universal','Universal Orlando Resort','{"he":"יוניברסל אורלנדו"}','express_pass',2)
on conflict (id) do update set
  name = excluded.name, name_i18n = excluded.name_i18n,
  skip_line_system = excluded.skip_line_system;

insert into park (id, resort_id, name, short_name, name_i18n, park_kind, status, sort_order)
values
  ('mk',    'wdw','Magic Kingdom Park',            'Magic Kingdom',   '{"he":"מג''יק קינגדום"}',        'theme','open', 1),
  ('epcot', 'wdw','EPCOT',                         'EPCOT',           '{"he":"אפקוט"}',                 'theme','open', 2),
  ('hs',    'wdw','Disney''s Hollywood Studios',   'Hollywood Studios','{"he":"הוליווד סטודיוס"}',      'theme','open', 3),
  ('ak',    'wdw','Disney''s Animal Kingdom Theme Park','Animal Kingdom','{"he":"אנימל קינגדום"}',      'theme','open', 4),
  ('us',    'uor','Universal Studios Florida',     'Universal Studios','{"he":"יוניברסל סטודיוס"}',     'theme','open', 5),
  ('ioa',   'uor','Universal Islands of Adventure','Islands of Adventure','{"he":"איילנדס אוף אדוונצ''ר"}','theme','open',6),
  ('epic',  'uor','Universal Epic Universe',       'Epic Universe',   '{"he":"אפיק יוניברס"}',          'theme','open', 7)
on conflict (id) do update set
  resort_id = excluded.resort_id, name = excluded.name,
  short_name = excluded.short_name, name_i18n = excluded.name_i18n,
  park_kind = excluded.park_kind, sort_order = excluded.sort_order;

COMMIT;


-- ==========================================================================
-- seed: 011_water_parks.sql
-- ==========================================================================

set search_path = public, extensions;

-- 011_water_parks.sql — שלושת פארקי המים, שנשמטו מה-seed הראשון.
-- אידמפוטנטי.
BEGIN;

insert into park (id, resort_id, name, short_name, name_i18n, park_kind, status, sort_order)
values
  ('bb',  'wdw','Disney''s Blizzard Beach Water Park','Blizzard Beach','{"he":"בליזרד ביץ׳"}','water','open', 8),
  ('tl',  'wdw','Disney''s Typhoon Lagoon Water Park','Typhoon Lagoon','{"he":"טייפון לגון"}','water','open', 9),
  ('vb',  'uor','Universal Volcano Bay',              'Volcano Bay',   '{"he":"וולקנו ביי"}',  'water','open',10)
on conflict (id) do update set
  resort_id = excluded.resort_id, name = excluded.name,
  short_name = excluded.short_name, name_i18n = excluded.name_i18n,
  park_kind = excluded.park_kind, sort_order = excluded.sort_order;

COMMIT;


-- ==========================================================================
-- אימות — מה נוצר בפועל
-- ==========================================================================

-- verify.sql — a verification check after running all the migrations.
--
-- One query. Every row is one check: what was actually found, what we expected, and status.
-- No SQL knowledge is needed to read it — if every row in the "מצב" (status) column is ✅,
-- the run succeeded in full.
--
-- The numbers here were measured from a real run of the file on an empty database, not written from memory.
-- If you add a migration, update them here.
--
-- This query can be run again at any moment, on its own, without the migrations.

with checks as (

  select 1 as ord,
         'טבלאות שנוצרו' as "בדיקה",
         count(*)::text  as "נמצא",
         '18'            as "ציפינו",
         case when count(*) = 18 then '✅ תקין'
              when count(*) >  18 then '⚠️ יותר מהצפוי — יש טבלאות נוספות ב-public'
              else '❌ חסרות טבלאות — ראי איזו מיגרציה נפלה' end as "מצב"
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'

  union all
  select 2,
         'Views שנוצרו',
         count(*)::text,
         '3',
         case when count(*) = 3 then '✅ תקין'
              else '❌ חסר view — 008_profile_axes או 011_conformance_fixes לא רצו' end
  from information_schema.views where table_schema = 'public'

  union all
  select 3,
         'מדיניות RLS',
         count(*)::text,
         '29',
         case when count(*) = 29 then '✅ תקין'
              when count(*) >  29 then '⚠️ יותר מהצפוי'
              else '❌ חסרה מדיניות — 006_rls או 010_trip_members לא הושלמו' end
  from pg_policies where schemaname = 'public'

  union all
  select 4,
         'טבלאות עם RLS פעיל',
         "עם"::text,
         '18',
         case when "בלי" > 0
                then '❌ ' || "בלי" || ' טבלאות חשופות. זו דליפת מידע, לא אי-נוחות'
              when "עם" = 18 then '✅ תקין — RLS פעיל על כל 18 הטבלאות'
              else '❌ לא כל הטבלאות נוצרו, ולכן אי אפשר לומר ש-RLS שלם' end
  from (
    select count(*) filter (where rowsecurity)     as "עם",
           count(*) filter (where not rowsecurity) as "בלי"
    from pg_tables where schemaname = 'public'
  ) r

  union all
  select 5,
         'אינדקסים',
         count(*)::text,
         '50',
         case when count(*) = 50 then '✅ תקין'
              when count(*) <  50 then '❌ חסרים אינדקסים'
              else '⚠️ יותר מהצפוי' end
  from pg_indexes where schemaname = 'public'

  union all
  select 6,
         'הטבלה experience קיימת',
         case when to_regclass('public.experience') is null then 'לא' else 'כן' end,
         'כן',
         case when to_regclass('public.experience') is null
              then '❌ חסרה — 002_content לא רץ'
              else '✅ תקין' end

  union all
  select 7,
         'עמודות בטבלה experience',
         count(*)::text,
         '39',
         case when count(*) = 39 then '✅ תקין'
              when count(*) <  39 then '❌ חסרות עמודות — 007 / 011 / 012 / 014 לא רצו במלואן'
              else '⚠️ יותר מהצפוי' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'experience'

  union all
  select 8,
         'הטבלה park קיימת',
         case when to_regclass('public.park') is null then 'לא' else 'כן' end,
         'כן',
         case when to_regclass('public.park') is null
              then '❌ חסרה — 002_content לא רץ'
              else '✅ תקין' end

  union all
  -- The count goes through query_to_xml and not through "from park", because a table that does not exist
  -- fails the whole query at parse time — that is, in exactly the state the check is meant
  -- to diagnose. The CASE is evaluated at run time, so it does not touch a missing table.
  select 9,
         'פארקים שנשתלו',
         coalesce(park_count::text, 'אין טבלה'),
         '10',
         case when park_count is null then '❌ הטבלה park לא קיימת בכלל'
              when park_count = 10 then '✅ תקין — 7 פארקי נושא ו-3 פארקי מים'
              when park_count = 7  then '❌ חסרים פארקי המים — 011_water_parks לא רץ'
              else '❌ ה-seed לא הושלם' end
  from (
    select case when to_regclass('public.park') is null then null
                else (xpath('/row/c/text()',
                       query_to_xml('select count(*) as c from public.park',
                                    false, true, '')))[1]::text::int
           end as park_count
  ) p

  union all
  select 10,
         'הרחבות מותקנות',
         coalesce(string_agg(extname, ', ' order by extname), 'אין'),
         'pg_trgm, pgcrypto, vector',
         case when count(*) = 3 then '✅ תקין'
              else '❌ חסרה הרחבה — 001 לא הושלמה' end
  from pg_extension where extname in ('vector','pg_trgm','pgcrypto')

  union all
  select 11,
         'gets_wet מקבל na',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.experience')
                  and pg_get_constraintdef(oid) like '%gets_wet%'
                  and pg_get_constraintdef(oid) like '%na%'
              ) then 'כן' else 'לא' end,
         'כן',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.experience')
                  and pg_get_constraintdef(oid) like '%gets_wet%'
                  and pg_get_constraintdef(oid) like '%na%'
              ) then '✅ תקין' else '❌ 014_gets_wet_na לא רץ' end

  union all
  select 12,
         'height_requirement_cm מרשה 0',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.experience')
                  and pg_get_constraintdef(oid) like '%height_requirement_cm%'
                  and pg_get_constraintdef(oid) like '%= 0)%'
              ) then 'כן' else 'לא' end,
         'כן',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.experience')
                  and pg_get_constraintdef(oid) like '%height_requirement_cm%'
                  and pg_get_constraintdef(oid) like '%= 0)%'
              ) then '✅ תקין' else '❌ 012_height_none לא רץ' end

  union all
  -- ⚠️ A scalar subquery, not "from information_schema.columns" directly:
  --    a missing column would return zero rows, and the check would disappear from the table
  --    instead of lighting up red. This way exactly one row always comes out.
  select 13,
         'trip.park_days',
         coalesce(state, 'אין עמודה'),
         'integer · NULL מותר · בלי ברירת מחדל',
         case when state is null
                then '❌ 015_trip_park_days לא רץ'
              when state = 'integer · NULL מותר · בלי ברירת מחדל'
                then '✅ תקין'
              else '❌ העמודה קיימת אבל לא כפי שהוגדרה. ברירת מחדל או NOT NULL '
                   || 'הופכים "לא נשאל" ל"נענה" — זה הבאג שהמיגרציה נועדה למנוע' end
  from (
    select (select data_type
                || (case when is_nullable = 'YES' then ' · NULL מותר' else ' · NOT NULL' end)
                || (case when column_default is null then ' · בלי ברירת מחדל'
                         else ' · ברירת מחדל ' || column_default end)
            from information_schema.columns
            where table_schema = 'public'
              and table_name   = 'trip'
              and column_name  = 'park_days') as state
  ) pd

  union all
  select 14,
         'התחום של park_days',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.trip')
                  and pg_get_constraintdef(oid) like '%park_days%'
                  and pg_get_constraintdef(oid) like '%30%'
              ) then '1..30' else 'אין' end,
         '1..30',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.trip')
                  and pg_get_constraintdef(oid) like '%park_days%'
                  and pg_get_constraintdef(oid) like '%30%'
              ) then '✅ תקין' else '❌ אילוץ התחום חסר' end
)
select "בדיקה", "נמצא", "ציפינו", "מצב" from checks order by ord;

