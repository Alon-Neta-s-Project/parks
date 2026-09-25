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
