-- לא מיגרציה של המוצר. שכבת דמה מקומית בלבד.
-- Supabase מספקת את סכמת auth; מיגרציה 004 מפנה ל-auth.users ו-006 קוראת
-- ל-auth.uid(). על Postgres נקי הן לא קיימות, ולכן אי אפשר להריץ את השרשרת
-- בלעדיהן. הקובץ הזה קיים כדי לאמת את השרשרת מקומית ואינו רץ בפרודקשן.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
