-- ==========================================================================
-- Park Day Companion — קובץ הקמה למסד הנתונים ב-Supabase
-- ==========================================================================
--
-- מה זה
--   כל המיגרציות והנתונים הקבועים, בקובץ אחד, בסדר הנכון. להדביק ל-
--   Supabase Studio ← SQL Editor ← New query, וללחוץ Run פעם אחת.
--   נוצר אוטומטית על ידי scripts/build-supabase-bundle.py. אין לערוך אותו
--   ביד — לערוך את הקבצים ב-db/migrations ולהריץ את הסקריפט מחדש.
--
-- הסדר
--   1. מיגרציה 001_extensions_and_taxonomy.sql
--   2. מיגרציה 002_content.sql
--   3. מיגרציה 003_knowledge.sql
--   4. מיגרציה 004_users_trips.sql
--   5. מיגרציה 005_conversations.sql
--   6. מיגרציה 006_rls.sql
--   7. מיגרציה 007_content_fields.sql
--   8. מיגרציה 008_profile_axes.sql
--   9. מיגרציה 009_plan_item_interest.sql
--   10. מיגרציה 010_trip_members.sql
--   11. מיגרציה 011_conformance_fixes.sql
--   12. מיגרציה 012_height_none.sql
--   13. מיגרציה 013_scenic_ride.sql
--   14. מיגרציה 014_gets_wet_na.sql
--   15. מיגרציה 015_trip_park_days.sql
--   16. מיגרציה 016_skip_line_neutral.sql
--   17. מיגרציה 017_drop_skip_line_extra_cost.sql
--   18. מיגרציה 018_rate_limit.sql
--   19. מיגרציה 019_content_fields_from_export.sql
--   20. מיגרציה 020_rate_limit_rpc.sql
--   21. מיגרציה 021_global_daily_cap.sql
--   22. מיגרציה 022_measured_cost.sql
--   23. seed 010_reference.sql
--   24. seed 011_water_parks.sql
--   25. בלוק אימות — שאילתה אחת שמדווחת מה נוצר בפועל.
--
-- מה שאין כאן, בכוונה
--   db/local/000_auth_shim.sql. הוא מפגם מקומי לסכמת auth. ב-Supabase
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
-- ותאמר למשתמשת את הדבר הנכון. "נסי בעוד שעה" ו"נסי מחר" אינם אותה
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

-- verify.sql — בדיקת אימות אחרי הרצת כל המיגרציות.
--
-- שאילתה אחת. כל שורה היא בדיקה אחת: מה נמצא בפועל, למה ציפינו, ומצב.
-- אין צורך לדעת SQL כדי לקרוא אותה — אם בעמודה "מצב" כל השורות ✅,
-- ההרצה הצליחה במלואה.
--
-- המספרים כאן נמדדו מהרצה אמיתית של הקובץ על מסד ריק, ולא נכתבו מהזיכרון.
-- אם מוסיפים מיגרציה, צריך לעדכן אותם כאן.
--
-- אפשר להריץ את השאילתה הזו שוב בכל רגע, לבד, בלי המיגרציות.

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
  -- הספירה עוברת דרך query_to_xml ולא דרך "from park", כי טבלה שאינה קיימת
  -- מפילה את השאילתה כולה בזמן ניתוח — כלומר בדיוק במצב שהבדיקה נועדה
  -- לאבחן. ה-CASE נבדק בזמן ריצה, ולכן לא נוגע בטבלה חסרה.
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
  -- ⚠️ תת-שאילתה סקלרית, לא "from information_schema.columns" ישירות:
  --    עמודה חסרה הייתה מחזירה אפס שורות, והבדיקה הייתה נעלמת מהטבלה
  --    במקום להידלק באדום. ככה תמיד יוצאת בדיוק שורה אחת.
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

