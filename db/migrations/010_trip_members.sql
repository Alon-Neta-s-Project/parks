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
