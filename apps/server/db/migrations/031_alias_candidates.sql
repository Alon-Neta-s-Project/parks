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
