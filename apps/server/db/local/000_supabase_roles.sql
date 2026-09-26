-- 000_supabase_roles — התפקידים ש-Supabase מביאה מראש, ל-Postgres רגיל
-- ────────────────────────────────────────────────────────────────────
-- 📍 מקומית בלבד, לפני ה-baseline, על Postgres שאינו Supabase
-- (npm run db:local-pg). ב-Supabase התפקידים האלה קיימים, והקובץ מיותר.
--
-- ⚠️ **ה-baseline מפנה אליהם בהרשאות ובמדיניות.** בלעדיהם הוא נופל על
-- הראשון שבהם — וזו בדיוק ההוכחה שהוא תלוי ב-Supabase רק בשלושה שמות
-- ובפונקציה אחת (auth.uid(), ב-000_auth_shim.sql).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon          nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role  nologin bypassrls; end if;
end
$$;
