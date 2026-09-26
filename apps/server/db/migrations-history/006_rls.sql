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
