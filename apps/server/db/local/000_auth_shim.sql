-- 000_auth_shim.sql — **Local development scaffolding only. Not a migration.**
--
-- On Supabase, the auth schema and auth.uid() exist from the first moment and are part
-- of the platform. In a clean PostgreSQL database they simply do not exist, so 004 fails
-- on auth.users and 006 on auth.uid().
--
-- This file creates the minimum the chain needs to run locally. It sits
-- in db/local/ and not in db/migrations/ on purpose: **never run it on Supabase**
-- — there it would collide with the real schema. Local run order:
--   local/000_auth_shim.sql → migrations/001..011 → seed/010 → seed/011
--
-- The consequence worth understanding: auth.uid() here returns NULL by default, so every
-- RLS policy on user data **blocks everything** in a local run. That is not a bug —
-- it is exactly what should happen to an anonymous user. To test RLS locally:
--   select set_config('request.jwt.claim.sub', '<uuid>', false);

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Reads the same GUC that Supabase injects from the JWT, so local test
-- behavior matches production.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
