-- 000_supabase_roles — the roles Supabase ships with, for plain Postgres
-- ────────────────────────────────────────────────────────────────────
-- 📍 Local only, before the baseline, on a Postgres that is not Supabase
-- (npm run db:local-pg). On Supabase these roles exist, and the file is redundant.
--
-- ⚠️ **The baseline references them in grants and policies.** Without them it fails on
-- the first of them — and that is exactly the proof that it depends on Supabase only for three names
-- and one function (auth.uid(), in 000_auth_shim.sql).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon          nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role  nologin bypassrls; end if;
end
$$;
