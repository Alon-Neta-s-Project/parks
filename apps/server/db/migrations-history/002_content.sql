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
