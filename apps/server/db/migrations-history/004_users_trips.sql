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
