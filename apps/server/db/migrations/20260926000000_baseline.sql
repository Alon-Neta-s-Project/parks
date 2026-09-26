-- ════════════════════════════════════════════════════════════════════
-- baseline — הסכמה של הייצור, כפי שהייתה ב-26.09.2026
-- ════════════════════════════════════════════════════════════════════
--
-- 🔴 **זו המיגרציה הראשונה של dbmate, והיא מחליפה את 48 שקדמו לה** —
-- apps/server/db/migrations-history/, שנשארות שם כתיעוד, חתומות וללא שינוי.
-- הן אינן יכולות לבנות מסד מאפס (O6): 038–040 מעתיקות שורה קיימת לבדיקה,
-- ו-046 נותנת הרשאות לתפקיד שאף מיגרציה אינה יוצרת. הקובץ הזה בונה.
--
-- ⚠️ **נוצר, ולא נכתב ביד** — scripts/baseline/assemble.py:
--   • המבנה: pg_dump --schema-only של מסד שנבנה מ-48 המיגרציות, ועוד
--     המדיניות של צוות 1 (data/deploy/team1-role.txt). זהה לייצור.
--   • ההרשאות: מהקטלוג של הייצור (scripts/baseline/prod-grants.sql),
--     בקריאה בלבד. הן הדוקות מאלה שהמיגרציות נותנות (O8).
--
-- ⛔ **בייצור הקובץ הזה אינו רץ.** הכול כבר קיים שם. במקום זה מסמנים
-- אותו כ"רץ" — data/deploy/dbmate-baseline.txt, פעם אחת, בידי מי שרשאי.
--
-- ── בכוונה לא כאן ──────────────────────────────────────────────────
--   • סיסמאות. התפקידים נוצרים NOLOGIN; בייצור הם קיימים עם סיסמה.
--   • rls_auto_enable — פונקציה של פלטפורמת Supabase, לא שלנו.
--   • המפתח האמיתי ב-tester_key() — כאן הערך המציין (O8: להחליף בייצור).
--   • נתונים. הפארקים ב-apps/server/db/seed/, התוכן ב-content-seed/.
--
-- יעד: Supabase (התפקידים anon, authenticated, service_role והפונקציה
-- auth.uid() קיימים שם). ב-Postgres רגיל — קודם apps/server/db/local/000_auth_shim.sql.

-- migrate:up

-- ── הרחבות — כמו במיגרציה 001 ────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    create schema extensions;
  end if;
end
$$;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "vector"   with schema extensions;
create extension if not exists "pg_trgm"  with schema extensions;

-- ── תפקידים שהמדיניות וההרשאות מפנות אליהם ─────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ci_verify') then create role ci_verify nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'ci_content') then create role ci_content nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'team1_content') then create role team1_content nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'reviewer_readonly') then create role reviewer_readonly nologin; end if;
end
$$;

-- ── המבנה ────────────────────────────────────────────────────────────
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS public;

CREATE DOMAIN public.authority_tier AS text
	CONSTRAINT authority_tier_check CHECK ((VALUE = ANY (ARRAY['T1'::text, 'T2'::text, 'T3'::text, 'T4'::text, 'T5'::text])));

CREATE DOMAIN public.locale_code AS text
	CONSTRAINT locale_code_check CHECK ((VALUE = ANY (ARRAY['he'::text, 'en'::text])));

CREATE DOMAIN public.sensitivity_level AS text
	CONSTRAINT sensitivity_level_check CHECK ((VALUE = ANY (ARRAY['none'::text, 'low'::text, 'medium'::text, 'high'::text])));

CREATE DOMAIN public.source_type AS text
	CONSTRAINT source_type_check CHECK ((VALUE = ANY (ARRAY['official'::text, 'blog'::text, 'video'::text, 'community'::text])));

CREATE DOMAIN public.volatility_tier AS text
	CONSTRAINT volatility_tier_check CHECK ((VALUE = ANY (ARRAY['static'::text, 'seasonal'::text, 'volatile'::text])));

CREATE FUNCTION public.alias_add(p_secret text, p_experience_id text, p_candidate text, p_source text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  c text := btrim(p_candidate);
  e record;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;

  select name, name_i18n->>'he' as he into e
  from experience where id = p_experience_id;
  if not found then
    return false;
  end if;

  -- ⚠️ נרדף שזהה לשם הקיים אינו מוסיף דבר. הוא רק שורה שפולה צריכה
  -- לקרוא ולדחות.
  if lower(c) = lower(coalesce(e.he, '')) or lower(c) = lower(e.name) then
    return false;
  end if;

  -- ⚠️ **נרדף שמכיל שם פארק מזיק.** ראה ההערה בראש הקובץ.
  if exists (
    select 1 from park p
    where c ilike '%' || p.name || '%'
       or (p.name_i18n->>'he' is not null and c ilike '%' || (p.name_i18n->>'he') || '%')
  ) then
    return false;
  end if;

  insert into alias_candidate (experience_id, candidate, source, status)
  values (p_experience_id, c, p_source, 'pending')
  on conflict (experience_id, candidate) do nothing;
  return found;
end
$$;

CREATE FUNCTION public.alias_pending(p_secret text, p_limit integer DEFAULT 25) RETURNS TABLE(id text, name text, name_he text, aliases text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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

CREATE FUNCTION public.alias_remaining(p_secret text) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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

CREATE FUNCTION public.check_rate_limit(p_bucket text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  used_bucket     int;
  used_bucket_day int;
  used_global     int;
  cap_window      int := public.rate_limit_window_minutes();
  cap_bucket      int := public.rate_limit_max_per_window();
  cap_bucket_day  int := public.rate_limit_bucket_daily_cap();
  cap_global      int := public.rate_limit_daily_cap();
begin
  if p_bucket is null or length(p_bucket) < 8 then
    raise exception 'bucket חסר או קצר מדי';
  end if;

  -- הגדר הגלובלי נבדק ראשון. אם כולם חסומים, אין טעם לספור דלי בודד.
  select count(*) into used_global
  from api_call
  where created_at > now() - interval '24 hours';

  if used_global >= cap_global then
    return 'global';
  end if;

  select count(*) into used_bucket
  from api_call
  where bucket = p_bucket
    and created_at > now() - make_interval(mins => cap_window);

  if used_bucket >= cap_bucket then
    return 'user';
  end if;

  -- ⚠️ החדש: אותו דלי, אבל על פני יממה. בלעדיו החלון לבדו מתיר 480
  -- ליום, וזו כל הבעיה.
  --
  -- ⚠️ ומוחזר 'user' ולא ערך חדש, בכוונה. הקוראת — הפונקציה של טים —
  -- מכירה שלושה ערכים, וערך רביעי היה נופל אצלה לענף ברירת המחדל
  -- ומוצג למשתמש כתקלה כללית במקום כ"הגעת למכסה". שינוי אוצר המילים
  -- מחייב שינוי בשני הצדדים, וזה בדיוק סוג הפער שנתפס כאן שוב ושוב.
  select count(*) into used_bucket_day
  from api_call
  where bucket = p_bucket
    and created_at > now() - interval '24 hours';

  if used_bucket_day >= cap_bucket_day then
    return 'user';
  end if;

  insert into api_call (bucket) values (p_bucket);
  delete from api_call where created_at < now() - interval '48 hours';

  return 'ok';
end
$$;

CREATE FUNCTION public.estimated_cost_per_message() RETURNS numeric
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ select 0.0079::numeric $$;

CREATE FUNCTION public.find_experiences(p_name text DEFAULT NULL::text, p_park text DEFAULT NULL::text, p_height_cm integer DEFAULT NULL::integer, p_limit integer DEFAULT 8) RETURNS TABLE(id text, name text, name_he text, park text, land text, category text, status text, status_note text, intensity integer, height_cm integer, max_height_cm integer, gets_wet text, wheelchair text, motion_sickness text, sens_dark text, sens_heights text, sens_loud text, sens_strobe text, skip_line text, last_verified date, fits boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  with tok as (
    -- ⚠️ פיצול על רווח בלבד, וקיצוץ פיסוק מהקצוות ב-btrim.
    -- **בכוונה בלי מחלקות תווים כמו [:alnum:]** — הן תלויות ב-locale,
    -- והמסד המקומי (C) והמסד בסופאבייס (UTF-8) היו מתנהגים אחרת.
    -- זה הכשל שכבר תפס אותי שלוש פעמים (search_path, format_type),
    -- ואות עברית היא בדיוק סוג התו שנופל בין ההגדרות.
    select distinct btrim(t, ',.;:!?()"''[]{}<>/-') as t
    from regexp_split_to_table(coalesce(p_name, ''), '[[:space:]]+') t
  ),
  words as (
    -- שתי אותיות אינן מילה מזהה; הן שאריות של מילות קישור.
    select t from tok where length(t) >= 3
  ),
  -- ⚠️ **תחיליות עבריות.** "לספייס" ו-"באקספדישן" הן אותה מילה עם אות
  -- אחת מלפנים, ו-ilike על מחרוזת אינו יודע את זה. בלי זה שאלה טבעית
  -- ("כדאי ללכת לספייס מאונטיין") מחזירה אפס על מתקן שקיים.
  -- הקיצוץ מוגבל למילים בנות 5 ומעלה, כדי שלא ניצור מילים קצרות
  -- ומקריות שיתאימו לחצי מהטבלה.
  forms as (
    select t as t, t as root from words
    union
    select t, substr(t, 2) from words
    where length(t) >= 5 and substr(t, 1, 1) in ('ל','ב','ה','מ','ש','ו','כ')
  ),
  scored as (
    select
      e.id, e.name, e.name_i18n->>'he' as name_he,
      p.name as park_name, l.name as land_name,
      e.category, e.status, e.status_note, e.intensity,
      e.height_requirement_cm, e.max_height_requirement_cm, e.gets_wet, e.wheelchair,
      e.motion_sickness_warning,
      e.sens_enclosed_dark, e.sens_heights, e.sens_loud_sudden, e.sens_strobe,
      e.skip_line_system, e.last_verified,
      -- ⚠️ **count(distinct f.t) ולא count(*)** — מילה אחת שמתאימה גם
      -- בצורתה המלאה וגם בלי התחילית היא **מילה אחת**, ושתי צורות של
      -- אותה מילה לא אמורות לדחוק החוצה מתקן שהתאים בשתי מילים שונות.
      (select count(distinct f.t) from forms f
        where e.name ilike '%' || f.root || '%'
           or coalesce(e.name_i18n->>'he', '') ilike '%' || f.root || '%'
           -- ⚠️ גם השמות הנרדפים. "מסע אל ההר" ו-"אוורסט" הם אותו מתקן.
           or exists (
             select 1 from jsonb_array_elements_text(
               coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
             where a ilike '%' || f.root || '%'
           )) as hits
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where (p_park is null or p.id = p_park or p.name ilike '%' || p_park || '%')
  )
  select
    s.id, s.name, s.name_he, s.park_name, s.land_name,
    s.category, s.status, s.status_note, s.intensity,
    s.height_requirement_cm, s.max_height_requirement_cm, s.gets_wet, s.wheelchair,
    s.motion_sickness_warning,
    s.sens_enclosed_dark, s.sens_heights, s.sens_loud_sudden, s.sens_strobe,
    s.skip_line_system, s.last_verified,
    -- ⚠️ **שלושה מצבים, ו-NULL אינו "מתאים לכולם"** (CLAUDE.md).
    --   0     → נבדק ואין מגבלה → מתאים
    --   מספר  → מתאים אם הילד/ה מגיע/ה
    --   NULL  → **לא נבדק** → NULL, ולא true
    -- נגזר בזמן ריצה ואינו מאוחסן — אחרת היה מקור אמת שני שמתיישן
    -- ברגע שהגובה של הילד/ה משתנה.
    -- 🔴 **והתקרה, שנוספה ב-038.** חמישה אזורי מים לפעוטות מגבילים גובה
    -- כלפי מעלה, וכל עוד רק הרצפה נבדקה כאן, ילד גבוה מדי קיבל "מתאים".
    --
    -- ⚠️ הסדר: פסילה לפני התאמה. מי שגבוה מהתקרה **אינו** מתאים, גם אם
    -- הוא עובר את הרצפה בהרבה — וזה בדיוק המקרה שהיה חוזר true.
    --
    -- ⚠️ ותקרה לבדה היא תשובה. על חמש השורות האלה הרצפה היא NULL ("לא
    -- נבדק"), ובלי השורה הזו fits היה נשאר NULL — כלומר "אין לי מידע" על
    -- שורה שיש עליה מידע מלא בכיוון שנשאל.
    case
      when p_height_cm is null then null
      when s.max_height_requirement_cm is not null
           and p_height_cm > s.max_height_requirement_cm then false
      when s.height_requirement_cm is null
        then case when s.max_height_requirement_cm is null then null else true end
      else p_height_cm >= s.height_requirement_cm
    end
  from scored s
  where
    -- בלי שם — כל הפארק, לפי הסינון בלבד.
    (select count(*) from words) = 0
    -- ⚠️ עם שם — **רק ההתאמות הטובות ביותר.** ראה ההערה בראש הקובץ.
    or s.hits = (select max(x.hits) from scored x where x.hits > 0)
  -- ⚠️ מתקן סגור **מוחזר**, עם הסטטוס שלו. סינון שקט היה גורם לטים לומר
  -- "לא מצאתי מתקן כזה" על מתקן שקיים ופשוט סגור.
  order by
    case when p_name is not null and s.name ilike p_name || '%' then 0 else 1 end,
    s.name
  limit least(coalesce(p_limit, 8), 25)
$$;

CREATE FUNCTION public.ingest_check(p_secret text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select exists (
    select 1 from ingest_key
     where id = 1 and hash = encode(sha256(coalesce(p_secret, '')::bytea), 'hex')
  )
$$;

CREATE FUNCTION public.ingest_pending(p_secret text, p_limit integer DEFAULT 25) RETURNS TABLE(id uuid, content text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  return query
    select c.id, c.content
    from knowledge_chunk c
    where c.embedding is null
    -- ⚠️ הגג נחתך כאן ולא מתקבל מהקוראת (הלקח מ-026). least ולא
    -- greatest: מנה גדולה מדי נתקעת בפסק זמן של הפונקציה, ואז שום דבר
    -- לא מתקדם — כישלון שנראה כמו "זה לוקח זמן".
    order by c.doc_id, c.chunk_index
    limit least(coalesce(p_limit, 25), 50);
end
$$;

CREATE FUNCTION public.ingest_remaining(p_secret text) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare n int;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  select count(*) into n from knowledge_chunk where embedding is null;
  return n;
end
$$;

CREATE FUNCTION public.ingest_set_embedding(p_secret text, p_id uuid, p_vector text, p_model text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare updated int;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  if p_model is null or p_model = '' then
    raise exception 'שם המודל חסר. וקטור בלי שם מודל הוא רעש שאין דרך לזהות';
  end if;
  update knowledge_chunk
     set embedding = p_vector::vector,
         embedding_model = p_model
   where knowledge_chunk.id = p_id;
  get diagnostics updated = row_count;
  -- ⚠️ עדכון שלא פגע בשום שורה מוחזר כ-false ולא כהצלחה שקטה. מזהה שגוי
  -- היה נספר כ"נכתב" והקטע היה נשאר בלי וקטור לנצח, בלי שאיש יראה.
  return updated = 1;
end
$$;

CREATE FUNCTION public.ingest_set_key(p_new text, p_current text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare existing text;
begin
  if p_new is null or length(p_new) < 16 then
    raise exception 'סוד קצר מדי — לפחות 16 תווים';
  end if;
  select hash into existing from ingest_key where id = 1;
  if existing is not null
     and (p_current is null or encode(sha256(p_current::bytea), 'hex') <> existing) then
    raise exception 'כבר קיים סוד. להחלפה יש לשלוח את הקיים ב-p_current';
  end if;
  insert into ingest_key (id, hash, set_at)
  values (1, encode(sha256(p_new::bytea), 'hex'), now())
  on conflict (id) do update set hash = excluded.hash, set_at = now();
  return 'ok';
end
$$;

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from profile where id = auth.uid() and role = 'admin');
$$;

CREATE FUNCTION public.knowledge_chunk_content_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- ⚠️ `is distinct from` ולא `<>`. השוואה רגילה מחזירה NULL כששד אחד
  -- NULL, ו-NULL אינו TRUE — כלומר טקסט שהיה ריק והתמלא היה חומק.
  if new.content is distinct from old.content then
    -- ⚠️ שניהם, ולא רק הווקטור. על הטבלה יושבת אילוצת־בדיקה שאומרת
    -- ש-embedding ו-embedding_model הם NULL יחד או מלאים יחד
    -- (knowledge_chunk_model_with_embedding). איפוס של אחד בלבד היה
    -- מפיל כל עריכת ניסוח על שגיאת אילוץ — כלומר הופך תיקון טקסט
    -- לפעולה בלתי אפשרית.
    new.embedding       := null;
    new.embedding_model := null;
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.log_turn(p_question text, p_answered boolean, p_refusal_reason text DEFAULT NULL::text, p_model text DEFAULT NULL::text, p_input_tokens integer DEFAULT NULL::integer, p_output_tokens integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_question text;
begin
  -- 🔴 **תנאי 4 של גיא, ונאכף כאן.** תשובה שנענתה אינה שומרת את השאלה,
  -- ולא משנה מה נשלח. הקורא אינו יכול לחרוג מזה גם בטעות.
  v_question := case when p_answered then null
                     else left(coalesce(p_question, ''), 500) end;
  if v_question = '' then v_question := null; end if;

  insert into turn_log (
    question, answered, refusal_reason, model, input_tokens, output_tokens
  ) values (
    v_question, p_answered,
    case when p_answered then null else p_refusal_reason end,
    p_model, p_input_tokens, p_output_tokens
  );

  -- 🔴 **תנאי 2, ונאכף בכל כתיבה.** מחיקה מתוזמנת היא משימה שמישהו
  -- צריך לזכור, וזה בדיוק סוג הדבר שנשכח כאן שלוש פעמים באותו יום.
  delete from turn_log t
   where t.id in (
     select t2.id from turn_log t2
      where t2.created_at < now() - interval '90 days'
      limit 200
   );
end;
$$;

CREATE FUNCTION public.match_knowledge(p_embedding text, p_limit integer DEFAULT 5, p_resort text DEFAULT NULL::text) RETURNS TABLE(chunk_id uuid, doc_id text, title text, content text, authority_tier public.authority_tier, volatility public.volatility_tier, last_verified date, similarity double precision)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select
    c.id,
    d.id,
    d.title,
    c.content,
    c.authority_tier,
    d.volatility,
    d.last_verified,
    -- <=> הוא מרחק קוסינוס: 0 זהה, 2 הפוך. ההמרה לדמיון היא כדי
    -- שהמספר שיוצא מכאן יגדל ככל שהקטע רלוונטי יותר, ולא להפך.
    1 - (c.embedding <=> p_embedding::vector) as similarity
  from knowledge_chunk c
  join knowledge_doc d on d.id = c.doc_id
  where c.embedding is not null
    -- ⚠️ תוכן שלא אושר אינו נשלף. הכלל קיים ב-RLS, אבל הפונקציה הזו היא
    -- security definer ולכן עוקפת אותו — ומה שנאכף במקום אחד ולא כאן
    -- היה נכנס לתשובה של טים דרך הדלת הזו.
    and c.review_status = 'approved'
    and d.review_status = 'approved'
    and (p_resort is null or d.scope_resort = p_resort)
  order by c.embedding <=> p_embedding::vector
  -- ⚠️ הגג נחתך כאן ואינו מתקבל מהקוראת (הלקח מ-026). חמישה קטעים הם
  -- מה שנכנס להקשר; מאה היו מנפחים את הקלט ואת העלות בלי לשפר תשובה.
  limit least(coalesce(p_limit, 5), 20)
$$;

CREATE FUNCTION public.park_candidates(p_per_park integer DEFAULT 4) RETURNS TABLE(park text, name text, name_he text, land text, category text, intensity integer, height_cm integer, max_height_cm integer, gets_wet text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  with ranked as (
    select
      p.name as park_name,
      e.name,
      e.name_i18n->>'he' as name_he,
      l.name as land_name,
      e.category,
      e.intensity,
      e.height_requirement_cm,
      e.max_height_requirement_cm,
      e.gets_wet,
      -- ⚠️ פרישה על פני העוצמות, ולא "הכי פופולרי". מטרת השורות האלה
      -- היא לתת למודל ממה לבחור בשני הכיוונים — מי שרוצה רגוע ומי
      -- שרוצה חזק — ולכן הדירוג הוא בתוך כל רמת עוצמה בנפרד.
      row_number() over (
        partition by p.id, e.intensity
        order by e.name
      ) as rn
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where p.park_kind = 'theme'
      -- ⚠️ שבעת פארקי הנושא בלבד (הכרעת פולה). פארק מים אינו תשובה
      -- לשאלה "איזה פארק מתאים לנו".
      and e.kind = 'attraction'
      -- ⚠️ מתקן סגור אינו מועמד להמלצה. זה שונה משאלה על מתקן שמות,
      -- שם סגור **כן** מוחזר עם הסטטוס שלו — כי שם נשאלנו עליו.
      and e.status = 'open'
      -- 🔴 **ומתקן בלי דירוג עוצמה אינו נכנס** (CLAUDE.md). הוא היה
      -- מגיע כ"עוצמה לא דורגה" לתוך תשובה שכל כולה על עוצמה.
      and e.intensity is not null
  )
  select park_name, name, name_he, land_name, category,
         intensity, height_requirement_cm, max_height_requirement_cm, gets_wet
    from ranked
   where rn <= greatest(coalesce(p_per_park, 4), 1)
   order by park_name, intensity, name
$$;

CREATE FUNCTION public.rate_limit_bucket_daily_cap() RETURNS integer
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ select 60 $$;

CREATE FUNCTION public.rate_limit_daily_cap() RETURNS integer
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ select 600 $$;

CREATE FUNCTION public.rate_limit_max_per_window() RETURNS integer
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ select 20 $$;

CREATE FUNCTION public.rate_limit_window_minutes() RETURNS integer
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ select 60 $$;

CREATE FUNCTION public.record_migration(p_filename text, p_checksum text, p_by text DEFAULT 'sql-editor'::text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  insert into schema_migration (filename, checksum, applied_by, evidence)
  values (p_filename, p_checksum, p_by, 'observed')
  on conflict (filename) do update
    set checksum   = excluded.checksum,
        applied_at = now(),
        applied_by = excluded.applied_by,
        evidence   = 'observed';
$$;

CREATE FUNCTION public.save_tester_note(p_key text, p_turn_ref text, p_session_ref text, p_note text, p_question text DEFAULT NULL::text, p_answer text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  -- ⚠️ **נופל, ולא מחזיר בשקט.** כתיבה שנדחתה ולא נאמרה נראית למי
  -- שכותבת בדיוק כמו כתיבה שהצליחה — וההערה תיעלם בלי שתדע.
  if p_key is distinct from public.tester_key() then
    raise exception 'מפתח בודק שגוי';
  end if;

  if coalesce(trim(p_note), '') = '' then
    raise exception 'הערה ריקה אינה נשמרת';
  end if;

  insert into tester_note (turn_ref, session_ref, note, question, answer)
  values (
    left(p_turn_ref, 64),
    left(p_session_ref, 64),
    left(trim(p_note), 2000),
    left(p_question, 2000),
    left(p_answer, 8000)
  );

  -- ⚠️ תקרה, כדי שדף שנתקע בלולאה לא ימלא את המסד. 500 הערות הן
  -- הרבה מעבר לסבב בדיקה אמיתי.
  delete from tester_note
   where id in (
     select id from tester_note order by created_at desc offset 500
   );
end;
$$;

CREATE FUNCTION public.tester_key() RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ select 'YOUR-TESTER-KEY-HERE' $$;

CREATE FUNCTION public.tester_notes(p_limit integer DEFAULT 200) RETURNS TABLE(created_at timestamp with time zone, session_ref text, turn_ref text, note text, question text, answer text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select created_at, session_ref, turn_ref, note, question, answer
    from tester_note
   order by created_at desc
   limit least(coalesce(p_limit, 200), 500);
$$;

CREATE FUNCTION public.unanswered_sample(p_limit integer DEFAULT 50) RETURNS TABLE(created_at timestamp with time zone, refusal_reason text, question text, model text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select created_at, refusal_reason, question, model
    from turn_log
   where answered = false
   order by created_at desc
   limit least(coalesce(p_limit, 50), 500);
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.alias_candidate (
    id bigint NOT NULL,
    experience_id text NOT NULL,
    candidate text NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alias_candidate_source_check CHECK ((source = ANY (ARRAY['model'::text, 'runtime'::text]))),
    CONSTRAINT alias_candidate_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

ALTER TABLE public.alias_candidate ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.alias_candidate_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.api_call (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.conversation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    trip_id uuid,
    title text,
    summary text,
    locale public.locale_code DEFAULT 'he'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.destination (
    id text NOT NULL,
    name text NOT NULL,
    name_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    country_code character(2) NOT NULL,
    timezone text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.experience (
    id text NOT NULL,
    park_id text NOT NULL,
    land_id text,
    type text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    name text NOT NULL,
    name_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    aliases_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    category text NOT NULL,
    opened_year integer,
    duration_minutes integer,
    intensity integer,
    height_requirement_cm integer,
    gets_wet text,
    environment text,
    air_conditioned text,
    wheelchair text,
    skip_line_system text,
    popularity integer,
    sens_enclosed_dark text,
    sens_heights text,
    sens_loud_sudden text,
    sens_strobe text,
    type_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    location jsonb,
    verdict text,
    recommendation integer,
    best_time_of_day text,
    volatility public.volatility_tier DEFAULT 'static'::text NOT NULL,
    last_verified date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    motion_sickness_warning text,
    is_motion_simulator text,
    uses_large_screens_or_3d text,
    big_drops text,
    spinning text,
    key text,
    kind text,
    subtype text,
    admission text,
    reservation text,
    included_with_admission text,
    status_note text,
    max_speed_kmh numeric,
    inversions integer,
    max_height_requirement_cm integer,
    description_he text,
    meet_location text,
    CONSTRAINT experience_air_conditioned_check CHECK ((air_conditioned = ANY (ARRAY['true'::text, 'false'::text, 'na'::text]))),
    CONSTRAINT experience_best_time_of_day_check CHECK ((best_time_of_day = ANY (ARRAY['must_early'::text, 'morning'::text, 'noon'::text, 'afternoon'::text, 'evening'::text, 'anytime'::text, 'show_time'::text]))),
    CONSTRAINT experience_big_drops_check CHECK ((big_drops = ANY (ARRAY['true'::text, 'false'::text, 'na'::text]))),
    CONSTRAINT experience_category_check CHECK ((category = ANY (ARRAY['dark_ride'::text, 'coaster'::text, 'simulator'::text, 'water_ride'::text, 'show'::text, 'walkthrough'::text, 'playground'::text, 'meet_greet'::text, 'scenic_ride'::text, '360_film'::text]))),
    CONSTRAINT experience_duration_minutes_check CHECK ((duration_minutes > 0)),
    CONSTRAINT experience_environment_check CHECK ((environment = ANY (ARRAY['indoor'::text, 'outdoor'::text, 'mixed'::text]))),
    CONSTRAINT experience_gets_wet_check CHECK ((gets_wet = ANY (ARRAY['none'::text, 'may_get_wet'::text, 'may_get_soaked'::text, 'na'::text]))),
    CONSTRAINT experience_height_one_direction CHECK (((max_height_requirement_cm IS NULL) OR (height_requirement_cm IS NULL) OR (height_requirement_cm < max_height_requirement_cm))),
    CONSTRAINT experience_height_requirement_cm_check CHECK (((height_requirement_cm = 0) OR ((height_requirement_cm >= 50) AND (height_requirement_cm <= 200)))),
    CONSTRAINT experience_intensity_check CHECK (((intensity >= 1) AND (intensity <= 4))),
    CONSTRAINT experience_inversions_check CHECK (((inversions IS NULL) OR ((inversions >= 0) AND (inversions <= 20)))),
    CONSTRAINT experience_is_motion_simulator_check CHECK ((is_motion_simulator = ANY (ARRAY['true'::text, 'false'::text, 'na'::text]))),
    CONSTRAINT experience_kind_check CHECK ((kind = ANY (ARRAY['attraction'::text, 'entertainment'::text]))),
    CONSTRAINT experience_max_height_range CHECK (((max_height_requirement_cm IS NULL) OR ((max_height_requirement_cm >= 50) AND (max_height_requirement_cm <= 200)))),
    CONSTRAINT experience_max_speed_kmh_check CHECK (((max_speed_kmh IS NULL) OR ((max_speed_kmh > (0)::numeric) AND (max_speed_kmh < (300)::numeric)))),
    CONSTRAINT experience_motion_sickness_warning_check CHECK ((motion_sickness_warning = ANY (ARRAY['true'::text, 'false'::text, 'na'::text]))),
    CONSTRAINT experience_opened_year_check CHECK (((opened_year >= 1900) AND (opened_year <= 2100))),
    CONSTRAINT experience_popularity_check CHECK (((popularity >= 1) AND (popularity <= 5))),
    CONSTRAINT experience_recommendation_check CHECK (((recommendation >= 1) AND (recommendation <= 5))),
    CONSTRAINT experience_sens_enclosed_dark_quad CHECK (((sens_enclosed_dark IS NULL) OR (sens_enclosed_dark = ANY (ARRAY['true'::text, 'false'::text, 'na'::text])))),
    CONSTRAINT experience_sens_heights_quad CHECK (((sens_heights IS NULL) OR (sens_heights = ANY (ARRAY['true'::text, 'false'::text, 'na'::text])))),
    CONSTRAINT experience_sens_loud_sudden_quad CHECK (((sens_loud_sudden IS NULL) OR (sens_loud_sudden = ANY (ARRAY['true'::text, 'false'::text, 'na'::text])))),
    CONSTRAINT experience_sens_strobe_quad CHECK (((sens_strobe IS NULL) OR (sens_strobe = ANY (ARRAY['true'::text, 'false'::text, 'na'::text])))),
    CONSTRAINT experience_skip_line_system_check CHECK ((skip_line_system = ANY (ARRAY['multi_pass'::text, 'single_pass'::text, 'express'::text, 'none'::text]))),
    CONSTRAINT experience_spinning_check CHECK ((spinning = ANY (ARRAY['true'::text, 'false'::text, 'na'::text]))),
    CONSTRAINT experience_status_check CHECK ((status = ANY (ARRAY['open'::text, 'seasonal'::text, 'temporarily_closed'::text, 'coming_soon'::text, 'closed'::text]))),
    CONSTRAINT experience_type_check CHECK ((type = ANY (ARRAY['attraction'::text, 'show'::text, 'parade'::text, 'meet_greet'::text, 'walkthrough'::text]))),
    CONSTRAINT experience_uses_large_screens_or_3d_check CHECK ((uses_large_screens_or_3d = ANY (ARRAY['true'::text, 'false'::text, 'na'::text]))),
    CONSTRAINT experience_verdict_check CHECK ((verdict = ANY (ARRAY['must_do'::text, 'worth_it'::text, 'if_time'::text, 'skip'::text]))),
    CONSTRAINT experience_wheelchair_check CHECK ((wheelchair = ANY (ARRAY['remain_in_wheelchair'::text, 'transfer_ecv_to_wheelchair'::text, 'transfer_to_ride_vehicle'::text, 'transfer_wheelchair_then_ride'::text, 'must_be_ambulatory'::text])))
);

CREATE TABLE public.experience_editorial (
    experience_id text NOT NULL,
    locale public.locale_code NOT NULL,
    summary text,
    good_for text[] DEFAULT '{}'::text[] NOT NULL,
    skip_if text[] DEFAULT '{}'::text[] NOT NULL,
    tips text[] DEFAULT '{}'::text[] NOT NULL,
    author text,
    last_reviewed date
);

CREATE TABLE public.experience_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    experience_id text NOT NULL,
    kind text NOT NULL,
    url text,
    youtube_id text,
    video_kind text,
    title_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    alt_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    credit text,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT experience_media_check CHECK (((kind <> 'video'::text) OR (youtube_id IS NOT NULL))),
    CONSTRAINT experience_media_check1 CHECK (((kind = 'video'::text) OR (url IS NOT NULL))),
    CONSTRAINT experience_media_kind_check CHECK ((kind = ANY (ARRAY['hero'::text, 'gallery'::text, 'video'::text]))),
    CONSTRAINT experience_media_video_kind_check CHECK ((video_kind = ANY (ARRAY['pov'::text, 'review'::text, 'overview'::text])))
);

CREATE TABLE public.experience_source (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    experience_id text NOT NULL,
    title text,
    url text NOT NULL,
    kind public.source_type NOT NULL,
    tier public.authority_tier NOT NULL,
    retrieved_at date
);

CREATE TABLE public.ingest_key (
    id integer DEFAULT 1 NOT NULL,
    hash text NOT NULL,
    set_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingest_key_id_check CHECK ((id = 1))
);

CREATE TABLE public.knowledge_chunk (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_id text NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    authority_tier public.authority_tier NOT NULL,
    locale public.locale_code NOT NULL,
    scope_park text,
    scope_experience text,
    review_status text NOT NULL,
    embedding extensions.vector(1536),
    embedding_model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_chunk_model_with_embedding CHECK (((embedding IS NULL) = (embedding_model IS NULL)))
);

CREATE TABLE public.knowledge_doc (
    id text NOT NULL,
    title text NOT NULL,
    doc_type text NOT NULL,
    authority_tier public.authority_tier NOT NULL,
    locale public.locale_code DEFAULT 'he'::text NOT NULL,
    scope_resort text,
    scope_park text,
    scope_experience text,
    source_kind public.source_type,
    volatility public.volatility_tier DEFAULT 'static'::text NOT NULL,
    last_verified date,
    last_seen date,
    review_status text DEFAULT 'draft'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    corroboration_count integer DEFAULT 1 NOT NULL,
    submitted_by uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product_family text,
    audience text,
    v1_priority text,
    purchase_type text,
    source_urls text[],
    country text,
    CONSTRAINT knowledge_doc_audience_check CHECK ((audience = ANY (ARRAY['international_guest'::text, 'hotel_guest'::text, 'annual_passholder'::text, 'florida_resident'::text, 'military'::text]))),
    CONSTRAINT knowledge_doc_country_iso CHECK (((country IS NULL) OR (country ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT knowledge_doc_doc_type_check CHECK ((doc_type = ANY (ARRAY['guide'::text, 'attraction_note'::text, 'faq'::text, 'policy'::text, 'tip'::text, 'community_qa'::text]))),
    CONSTRAINT knowledge_doc_product_family_check CHECK ((product_family = ANY (ARRAY['queue_access'::text, 'admission'::text, 'park_hopping'::text, 'hotel_benefit'::text, 'eligibility_program'::text, 'event_ticket'::text, 'characters'::text, 'guest_services'::text, 'photo'::text, 'weather'::text, 'park_logistics'::text]))),
    CONSTRAINT knowledge_doc_purchase_type_check CHECK ((purchase_type = ANY (ARRAY['ticket'::text, 'paid_addon'::text, 'included_benefit'::text, 'reservation_mechanism'::text, 'N/A'::text]))),
    CONSTRAINT knowledge_doc_review_status_check CHECK ((review_status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT knowledge_doc_v1_priority_check CHECK ((v1_priority = ANY (ARRAY['core'::text, 'appendix'::text])))
);

CREATE TABLE public.land (
    id text NOT NULL,
    park_id text NOT NULL,
    name text NOT NULL,
    name_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    zone text,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT land_zone_check CHECK ((zone = ANY (ARRAY['hub'::text, 'north'::text, 'south'::text, 'east'::text, 'west'::text])))
);

CREATE TABLE public.message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text,
    tool_calls jsonb,
    citations jsonb,
    answered boolean,
    refusal_reason text,
    proactive boolean DEFAULT false NOT NULL,
    model text,
    input_tokens integer,
    output_tokens integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_refusal_reason_check CHECK ((refusal_reason = ANY (ARRAY['no_data'::text, 'unverified'::text, 'safety_official_only'::text, 'out_of_scope'::text]))),
    CONSTRAINT message_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'tool'::text, 'system'::text])))
);

CREATE TABLE public.park (
    id text NOT NULL,
    resort_id text NOT NULL,
    name text NOT NULL,
    short_name text,
    name_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    typical_hours jsonb DEFAULT '{}'::jsonb NOT NULL,
    hero_image_url text,
    icon text,
    sort_order integer DEFAULT 0 NOT NULL,
    park_kind text NOT NULL,
    intro_he text,
    CONSTRAINT park_park_kind_check CHECK ((park_kind = ANY (ARRAY['theme'::text, 'water'::text]))),
    CONSTRAINT park_status_check CHECK ((status = ANY (ARRAY['open'::text, 'coming_soon'::text, 'closed'::text])))
);

CREATE TABLE public.plan_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    trip_day_id uuid,
    experience_id text,
    custom_title text,
    priority integer,
    time_preference jsonb,
    booking_note text,
    personal_notes text,
    status text DEFAULT 'wishlist'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    interest text,
    anchor_time time without time zone,
    CONSTRAINT plan_item_check CHECK (((experience_id IS NOT NULL) OR (custom_title IS NOT NULL))),
    CONSTRAINT plan_item_interest_check CHECK ((interest = ANY (ARRAY['yes'::text, 'maybe'::text, 'no'::text]))),
    CONSTRAINT plan_item_priority_check CHECK (((priority >= 1) AND (priority <= 5))),
    CONSTRAINT plan_item_status_check CHECK ((status = ANY (ARRAY['wishlist'::text, 'planned'::text, 'done'::text, 'skipped'::text])))
);

CREATE TABLE public.profile (
    id uuid NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    display_name text,
    locale public.locale_code DEFAULT 'he'::text NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profile_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])))
);

CREATE TABLE public.profile_fact (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    trip_id uuid,
    key text NOT NULL,
    value jsonb NOT NULL,
    source text NOT NULL,
    confidence real DEFAULT 1.0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT experience_must_be_stated CHECK (((key <> 'experience_by_resort'::text) OR (source = 'stated'::text))),
    CONSTRAINT persona_must_be_inferred CHECK (((key <> 'persona_labels'::text) OR (source = 'inferred'::text))),
    CONSTRAINT profile_fact_confidence_check CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision))),
    CONSTRAINT profile_fact_key_check CHECK ((key = ANY (ARRAY['planner_type'::text, 'sensitivities'::text, 'split_logistics'::text, 'experience_by_resort'::text, 'deliberate_non_planning'::text, 'staying_at_park_hotel'::text, 'travel_dates'::text, 'ticket_type'::text, 'mobility'::text, 'price_sensitivity'::text, 'dietary'::text, 'planning_focus_fit'::text, 'planning_focus_cost'::text, 'planning_depth'::text, 'park_style'::text, 'lodging_pref'::text, 'persona_labels'::text]))),
    CONSTRAINT profile_fact_source_check CHECK ((source = ANY (ARRAY['stated'::text, 'inferred'::text])))
);

CREATE VIEW public.profile_effective AS
 SELECT DISTINCT ON (user_id, trip_id, key) user_id,
    trip_id,
    key,
    value,
    source,
    confidence,
    updated_at
   FROM public.profile_fact
  ORDER BY user_id, trip_id, key, (source = 'stated'::text) DESC, updated_at DESC;

CREATE TABLE public.resort (
    id text NOT NULL,
    destination_id text NOT NULL,
    operator text NOT NULL,
    name text NOT NULL,
    name_i18n jsonb DEFAULT '{}'::jsonb NOT NULL,
    skip_line_system text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT resort_operator_check CHECK ((operator = ANY (ARRAY['disney'::text, 'universal'::text]))),
    CONSTRAINT resort_skip_line_system_check CHECK ((skip_line_system = ANY (ARRAY['lightning_lane'::text, 'express_pass'::text])))
);

CREATE TABLE public.schema_migration (
    filename text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by text NOT NULL,
    evidence text NOT NULL,
    CONSTRAINT schema_migration_applied_by_check CHECK ((applied_by = ANY (ARRAY['sql-editor'::text, 'ci'::text, 'verify'::text, 'backfill'::text]))),
    CONSTRAINT schema_migration_evidence_check CHECK ((evidence = ANY (ARRAY['observed'::text, 'verified'::text, 'assumed'::text])))
);

ALTER TABLE ONLY public.schema_migration FORCE ROW LEVEL SECURITY;

CREATE TABLE public.tester_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    turn_ref text NOT NULL,
    session_ref text NOT NULL,
    question text,
    answer text,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tester_note_answer_check CHECK ((length(answer) <= 8000)),
    CONSTRAINT tester_note_note_check CHECK (((length(note) >= 1) AND (length(note) <= 2000))),
    CONSTRAINT tester_note_question_check CHECK ((length(question) <= 2000)),
    CONSTRAINT tester_note_session_ref_check CHECK (((length(session_ref) >= 1) AND (length(session_ref) <= 64))),
    CONSTRAINT tester_note_turn_ref_check CHECK (((length(turn_ref) >= 1) AND (length(turn_ref) <= 64)))
);

ALTER TABLE ONLY public.tester_note FORCE ROW LEVEL SECURITY;

CREATE TABLE public.trip (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text,
    destination_id text NOT NULL,
    start_date date,
    end_date date,
    party jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    park_days integer,
    CONSTRAINT trip_check CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT trip_park_days_check CHECK (((park_days IS NULL) OR ((park_days >= 1) AND (park_days <= 30))))
);

CREATE TABLE public.trip_day (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    day_index integer NOT NULL,
    date date NOT NULL,
    park_ids text[] DEFAULT '{}'::text[] NOT NULL,
    notes text
);

CREATE TABLE public.trip_member (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    member_key text NOT NULL,
    role text NOT NULL,
    age integer,
    height_cm integer,
    intensity_tolerance text,
    sensitivities text[],
    field_provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trip_member_age_check CHECK (((age >= 0) AND (age <= 120))),
    CONSTRAINT trip_member_height_cm_check CHECK (((height_cm >= 30) AND (height_cm <= 220))),
    CONSTRAINT trip_member_intensity_tolerance_check CHECK ((intensity_tolerance = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'extreme'::text]))),
    CONSTRAINT trip_member_role_check CHECK ((role = ANY (ARRAY['adult'::text, 'child'::text]))),
    CONSTRAINT trip_member_sensitivities_vocab CHECK (((sensitivities IS NULL) OR (sensitivities <@ ARRAY['dark'::text, 'loudSudden'::text, 'strobe'::text, 'heights'::text, 'motionSickness'::text, 'accessibility'::text, 'longQueues'::text])))
);

CREATE TABLE public.turn_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text,
    answered boolean NOT NULL,
    refusal_reason text,
    model text,
    input_tokens integer,
    output_tokens integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT turn_log_answered_has_no_question CHECK ((NOT (answered AND (question IS NOT NULL)))),
    CONSTRAINT turn_log_question_check CHECK ((length(question) <= 500)),
    CONSTRAINT turn_log_refusal_reason_check CHECK ((refusal_reason = ANY (ARRAY['no_data'::text, 'unverified'::text, 'safety_official_only'::text, 'out_of_scope'::text])))
);

ALTER TABLE ONLY public.turn_log FORCE ROW LEVEL SECURITY;

CREATE VIEW public.unanswered_questions AS
 SELECT id AS message_id,
    conversation_id,
    refusal_reason,
    created_at,
    ( SELECT prev.content
           FROM public.message prev
          WHERE ((prev.conversation_id = m.conversation_id) AND (prev.role = 'user'::text) AND (prev.created_at < m.created_at))
          ORDER BY prev.created_at DESC
         LIMIT 1) AS question
   FROM public.message m
  WHERE ((role = 'assistant'::text) AND (answered = false));

CREATE VIEW public.unanswered_turns AS
 SELECT created_at,
    refusal_reason,
    question,
    model
   FROM public.turn_log
  WHERE (answered = false)
  ORDER BY created_at DESC;

CREATE VIEW public.usage_today AS
 SELECT count(*) AS "שאלות ב-24 שעות",
    (public.rate_limit_daily_cap() - count(*)) AS "נשאר עד הגדר",
    round(((count(*))::numeric * public.estimated_cost_per_message()), 2) AS "עלות מוערכת בשקלים",
    count(DISTINCT bucket) AS "מבקרות שונות"
   FROM public.api_call
  WHERE (created_at > (now() - '24:00:00'::interval));

CREATE VIEW public.verification_queue AS
 SELECT 'experience'::text AS kind,
    e.id,
    e.name AS title,
    e.volatility,
    e.last_verified,
    (CURRENT_DATE - e.last_verified) AS days_since
   FROM public.experience e
  WHERE ((e.last_verified IS NULL) OR (((e.volatility)::text = 'seasonal'::text) AND (e.last_verified < (CURRENT_DATE - '90 days'::interval))) OR (((e.volatility)::text = 'static'::text) AND (e.last_verified < (CURRENT_DATE - '365 days'::interval))))
UNION ALL
 SELECT 'knowledge'::text AS kind,
    d.id,
    d.title,
    d.volatility,
    d.last_verified,
    (CURRENT_DATE - d.last_verified) AS days_since
   FROM public.knowledge_doc d
  WHERE ((d.review_status = 'approved'::text) AND ((d.last_verified IS NULL) OR (((d.volatility)::text = 'seasonal'::text) AND (d.last_verified < (CURRENT_DATE - '90 days'::interval))) OR (((d.volatility)::text = 'static'::text) AND (d.last_verified < (CURRENT_DATE - '365 days'::interval)))));

ALTER TABLE ONLY public.alias_candidate
    ADD CONSTRAINT alias_candidate_experience_id_candidate_key UNIQUE (experience_id, candidate);

ALTER TABLE ONLY public.alias_candidate
    ADD CONSTRAINT alias_candidate_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.api_call
    ADD CONSTRAINT api_call_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.destination
    ADD CONSTRAINT destination_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experience_editorial
    ADD CONSTRAINT experience_editorial_pkey PRIMARY KEY (experience_id, locale);

ALTER TABLE ONLY public.experience_media
    ADD CONSTRAINT experience_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experience
    ADD CONSTRAINT experience_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.experience_source
    ADD CONSTRAINT experience_source_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ingest_key
    ADD CONSTRAINT ingest_key_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.knowledge_chunk
    ADD CONSTRAINT knowledge_chunk_doc_id_chunk_index_key UNIQUE (doc_id, chunk_index);

ALTER TABLE ONLY public.knowledge_chunk
    ADD CONSTRAINT knowledge_chunk_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.knowledge_doc
    ADD CONSTRAINT knowledge_doc_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.land
    ADD CONSTRAINT land_park_id_name_key UNIQUE (park_id, name);

ALTER TABLE ONLY public.land
    ADD CONSTRAINT land_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.park
    ADD CONSTRAINT park_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.plan_item
    ADD CONSTRAINT plan_item_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_fact
    ADD CONSTRAINT profile_fact_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile
    ADD CONSTRAINT profile_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.resort
    ADD CONSTRAINT resort_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.schema_migration
    ADD CONSTRAINT schema_migration_pkey PRIMARY KEY (filename);

ALTER TABLE ONLY public.tester_note
    ADD CONSTRAINT tester_note_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.trip_day
    ADD CONSTRAINT trip_day_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.trip_day
    ADD CONSTRAINT trip_day_trip_id_day_index_key UNIQUE (trip_id, day_index);

ALTER TABLE ONLY public.trip_member
    ADD CONSTRAINT trip_member_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.trip_member
    ADD CONSTRAINT trip_member_trip_id_member_key_key UNIQUE (trip_id, member_key);

ALTER TABLE ONLY public.trip
    ADD CONSTRAINT trip_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.turn_log
    ADD CONSTRAINT turn_log_pkey PRIMARY KEY (id);

CREATE INDEX api_call_bucket_time_idx ON public.api_call USING btree (bucket, created_at DESC);

CREATE INDEX conversation_user_idx ON public.conversation USING btree (user_id, updated_at DESC);

CREATE INDEX experience_aliases_idx ON public.experience USING gin (aliases);

CREATE INDEX experience_height_idx ON public.experience USING btree (height_requirement_cm);

CREATE INDEX experience_intensity_idx ON public.experience USING btree (intensity);

CREATE UNIQUE INDEX experience_key_uidx ON public.experience USING btree (key) WHERE (key IS NOT NULL);

CREATE INDEX experience_land_idx ON public.experience USING btree (land_id);

CREATE INDEX experience_media_exp_idx ON public.experience_media USING btree (experience_id, kind);

CREATE INDEX experience_motion_sickness_idx ON public.experience USING btree (motion_sickness_warning);

CREATE INDEX experience_name_trgm_idx ON public.experience USING gin (name extensions.gin_trgm_ops);

CREATE INDEX experience_park_idx ON public.experience USING btree (park_id);

CREATE INDEX experience_skipline_idx ON public.experience USING btree (skip_line_system);

CREATE INDEX experience_source_exp_idx ON public.experience_source USING btree (experience_id);

CREATE INDEX experience_type_idx ON public.experience USING btree (type, status);

CREATE INDEX knowledge_chunk_exp_idx ON public.knowledge_chunk USING btree (scope_experience);

CREATE INDEX knowledge_chunk_filter_idx ON public.knowledge_chunk USING btree (review_status, authority_tier, locale, scope_park);

CREATE INDEX knowledge_chunk_pending_idx ON public.knowledge_chunk USING btree (doc_id) WHERE (embedding IS NULL);

CREATE INDEX knowledge_doc_scope_idx ON public.knowledge_doc USING btree (scope_park, scope_experience);

CREATE INDEX knowledge_doc_status_idx ON public.knowledge_doc USING btree (review_status, authority_tier);

CREATE INDEX knowledge_doc_taxonomy_idx ON public.knowledge_doc USING btree (v1_priority, product_family, audience);

CREATE INDEX land_park_idx ON public.land USING btree (park_id);

CREATE INDEX message_conv_idx ON public.message USING btree (conversation_id, created_at);

CREATE INDEX message_unanswered_idx ON public.message USING btree (created_at DESC) WHERE (answered = false);

CREATE INDEX park_resort_idx ON public.park USING btree (resort_id);

CREATE INDEX plan_item_exp_idx ON public.plan_item USING btree (experience_id);

CREATE INDEX plan_item_interest_idx ON public.plan_item USING btree (trip_id, interest);

CREATE INDEX plan_item_trip_idx ON public.plan_item USING btree (trip_id, trip_day_id);

CREATE UNIQUE INDEX profile_fact_unique_idx ON public.profile_fact USING btree (user_id, COALESCE(trip_id, '00000000-0000-0000-0000-000000000000'::uuid), key, source);

CREATE INDEX profile_fact_user_idx ON public.profile_fact USING btree (user_id);

CREATE INDEX tester_note_session_idx ON public.tester_note USING btree (session_ref, created_at);

CREATE INDEX trip_day_trip_idx ON public.trip_day USING btree (trip_id);

CREATE INDEX trip_member_trip_idx ON public.trip_member USING btree (trip_id);

CREATE INDEX trip_user_idx ON public.trip USING btree (user_id);

CREATE INDEX turn_log_age_idx ON public.turn_log USING btree (created_at);

CREATE INDEX turn_log_unanswered_idx ON public.turn_log USING btree (created_at DESC) WHERE (answered = false);

CREATE TRIGGER knowledge_chunk_content_changed BEFORE UPDATE ON public.knowledge_chunk FOR EACH ROW EXECUTE FUNCTION public.knowledge_chunk_content_changed();

ALTER TABLE ONLY public.alias_candidate
    ADD CONSTRAINT alias_candidate_experience_id_fkey FOREIGN KEY (experience_id) REFERENCES public.experience(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profile(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experience_editorial
    ADD CONSTRAINT experience_editorial_experience_id_fkey FOREIGN KEY (experience_id) REFERENCES public.experience(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experience
    ADD CONSTRAINT experience_land_id_fkey FOREIGN KEY (land_id) REFERENCES public.land(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.experience_media
    ADD CONSTRAINT experience_media_experience_id_fkey FOREIGN KEY (experience_id) REFERENCES public.experience(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experience
    ADD CONSTRAINT experience_park_id_fkey FOREIGN KEY (park_id) REFERENCES public.park(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.experience_source
    ADD CONSTRAINT experience_source_experience_id_fkey FOREIGN KEY (experience_id) REFERENCES public.experience(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.knowledge_chunk
    ADD CONSTRAINT knowledge_chunk_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.knowledge_doc(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.knowledge_doc
    ADD CONSTRAINT knowledge_doc_scope_experience_fkey FOREIGN KEY (scope_experience) REFERENCES public.experience(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.knowledge_doc
    ADD CONSTRAINT knowledge_doc_scope_park_fkey FOREIGN KEY (scope_park) REFERENCES public.park(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.knowledge_doc
    ADD CONSTRAINT knowledge_doc_scope_resort_fkey FOREIGN KEY (scope_resort) REFERENCES public.resort(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.land
    ADD CONSTRAINT land_park_id_fkey FOREIGN KEY (park_id) REFERENCES public.park(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversation(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.park
    ADD CONSTRAINT park_resort_id_fkey FOREIGN KEY (resort_id) REFERENCES public.resort(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.plan_item
    ADD CONSTRAINT plan_item_experience_id_fkey FOREIGN KEY (experience_id) REFERENCES public.experience(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.plan_item
    ADD CONSTRAINT plan_item_trip_day_id_fkey FOREIGN KEY (trip_day_id) REFERENCES public.trip_day(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.plan_item
    ADD CONSTRAINT plan_item_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_fact
    ADD CONSTRAINT profile_fact_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profile(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile
    ADD CONSTRAINT profile_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.resort
    ADD CONSTRAINT resort_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.destination(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.trip_day
    ADD CONSTRAINT trip_day_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.trip
    ADD CONSTRAINT trip_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.destination(id);

ALTER TABLE ONLY public.trip_member
    ADD CONSTRAINT trip_member_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.trip
    ADD CONSTRAINT trip_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profile(id) ON DELETE CASCADE;

ALTER TABLE public.alias_candidate ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_call ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversation ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_self ON public.conversation USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.destination ENABLE ROW LEVEL SECURITY;

CREATE POLICY destination_admin ON public.destination USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY destination_read ON public.destination FOR SELECT USING (true);

ALTER TABLE public.experience ENABLE ROW LEVEL SECURITY;

CREATE POLICY experience_admin ON public.experience USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.experience_editorial ENABLE ROW LEVEL SECURITY;

CREATE POLICY experience_editorial_admin ON public.experience_editorial USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY experience_editorial_read ON public.experience_editorial FOR SELECT USING (true);

ALTER TABLE public.experience_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY experience_media_admin ON public.experience_media USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY experience_media_read ON public.experience_media FOR SELECT USING (true);

CREATE POLICY experience_read ON public.experience FOR SELECT USING (true);

ALTER TABLE public.experience_source ENABLE ROW LEVEL SECURITY;

CREATE POLICY experience_source_admin ON public.experience_source USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.ingest_key ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.knowledge_chunk ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_chunk_admin ON public.knowledge_chunk USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY knowledge_chunk_ci ON public.knowledge_chunk TO ci_content USING (true) WITH CHECK (true);

CREATE POLICY knowledge_chunk_team1 ON public.knowledge_chunk TO team1_content USING (true) WITH CHECK (true);

CREATE POLICY knowledge_chunk_team1_cap ON public.knowledge_chunk AS RESTRICTIVE TO team1_content USING ((((authority_tier)::text = 'T4'::text) AND (review_status = ANY (ARRAY['draft'::text, 'pending_review'::text])))) WITH CHECK ((((authority_tier)::text = 'T4'::text) AND (review_status = ANY (ARRAY['draft'::text, 'pending_review'::text]))));

ALTER TABLE public.knowledge_doc ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_doc_admin ON public.knowledge_doc USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY knowledge_doc_ci ON public.knowledge_doc TO ci_content USING (true) WITH CHECK (true);

CREATE POLICY knowledge_doc_submit ON public.knowledge_doc FOR INSERT WITH CHECK (((auth.uid() = submitted_by) AND (review_status = 'pending_review'::text)));

CREATE POLICY knowledge_doc_team1 ON public.knowledge_doc TO team1_content USING (true) WITH CHECK (true);

CREATE POLICY knowledge_doc_team1_cap ON public.knowledge_doc AS RESTRICTIVE TO team1_content USING ((((authority_tier)::text = 'T4'::text) AND ((source_kind)::text = 'community'::text) AND (review_status = ANY (ARRAY['draft'::text, 'pending_review'::text])))) WITH CHECK ((((authority_tier)::text = 'T4'::text) AND ((source_kind)::text = 'community'::text) AND (review_status = ANY (ARRAY['draft'::text, 'pending_review'::text]))));

ALTER TABLE public.land ENABLE ROW LEVEL SECURITY;

CREATE POLICY land_admin ON public.land USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY land_read ON public.land FOR SELECT USING (true);

ALTER TABLE public.message ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_self ON public.message USING ((EXISTS ( SELECT 1
   FROM public.conversation c
  WHERE ((c.id = message.conversation_id) AND (c.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.conversation c
  WHERE ((c.id = message.conversation_id) AND (c.user_id = auth.uid())))));

ALTER TABLE public.park ENABLE ROW LEVEL SECURITY;

CREATE POLICY park_admin ON public.park USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY park_intro_ci ON public.park FOR UPDATE TO ci_content USING (true) WITH CHECK (true);

CREATE POLICY park_read ON public.park FOR SELECT USING (true);

ALTER TABLE public.plan_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_item_self ON public.plan_item USING ((EXISTS ( SELECT 1
   FROM public.trip
  WHERE ((trip.id = plan_item.trip_id) AND (trip.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trip
  WHERE ((trip.id = plan_item.trip_id) AND (trip.user_id = auth.uid())))));

ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profile_fact ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_fact_self ON public.profile_fact USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY profile_self ON public.profile USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

ALTER TABLE public.resort ENABLE ROW LEVEL SECURITY;

CREATE POLICY resort_admin ON public.resort USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY resort_read ON public.resort FOR SELECT USING (true);

ALTER TABLE public.schema_migration ENABLE ROW LEVEL SECURITY;

CREATE POLICY schema_migration_ci ON public.schema_migration TO ci_verify USING (true) WITH CHECK (true);

ALTER TABLE public.tester_note ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.trip ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.trip_day ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_day_self ON public.trip_day USING ((EXISTS ( SELECT 1
   FROM public.trip
  WHERE ((trip.id = trip_day.trip_id) AND (trip.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trip
  WHERE ((trip.id = trip_day.trip_id) AND (trip.user_id = auth.uid())))));

ALTER TABLE public.trip_member ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_member_self ON public.trip_member USING ((EXISTS ( SELECT 1
   FROM public.trip
  WHERE ((trip.id = trip_member.trip_id) AND (trip.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trip
  WHERE ((trip.id = trip_member.trip_id) AND (trip.user_id = auth.uid())))));

CREATE POLICY trip_self ON public.trip USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.turn_log ENABLE ROW LEVEL SECURITY;

-- ── ההרשאות — כמו בייצור ──────────────────────────────────────────────
-- ⚠️ קודם מבטלים הכול. ב-Supabase ברירות המחדל נותנות ל-anon כתיבה על כל
-- טבלה חדשה — בדיוק הפער ש-O8 מצא. אחרי הביטול נשאר רק מה שיש בייצור.
do $$
declare r record;
begin
  for r in
    select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m','S')
  loop
    execute format('revoke all on %s public.%I from public, anon, authenticated, service_role, ci_verify, ci_content, team1_content, reviewer_readonly',
                   case when r.relkind = 'S' then 'sequence' else 'table' end, r.relname);
  end loop;
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role, ci_verify, ci_content, team1_content, reviewer_readonly', r.proname, r.args);
  end loop;
end
$$;

grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.alias_candidate to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.alias_candidate to authenticated;
grant SELECT on table public.alias_candidate to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.alias_candidate to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.api_call to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.api_call to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.api_call to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.conversation to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.conversation to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.conversation to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.destination to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.destination to authenticated;
grant SELECT on table public.destination to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.destination to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.experience to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.experience to authenticated;
grant SELECT on table public.experience to ci_verify;
grant SELECT on table public.experience to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.experience to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.experience_editorial to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.experience_editorial to authenticated;
grant SELECT on table public.experience_editorial to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.experience_editorial to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.experience_media to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.experience_media to authenticated;
grant SELECT on table public.experience_media to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.experience_media to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.experience_source to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.experience_source to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.experience_source to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.ingest_key to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.ingest_key to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.ingest_key to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.knowledge_chunk to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.knowledge_chunk to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.knowledge_chunk to ci_content;
grant SELECT on table public.knowledge_chunk to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.knowledge_chunk to service_role;
grant SELECT on table public.knowledge_chunk to team1_content;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.knowledge_doc to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.knowledge_doc to authenticated;
grant DELETE, INSERT, SELECT, UPDATE on table public.knowledge_doc to ci_content;
grant SELECT on table public.knowledge_doc to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.knowledge_doc to service_role;
grant SELECT on table public.knowledge_doc to team1_content;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.land to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.land to authenticated;
grant SELECT on table public.land to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.land to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.message to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.message to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.message to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.park to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.park to authenticated;
grant SELECT on table public.park to ci_content;
grant SELECT on table public.park to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.park to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.plan_item to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.plan_item to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.plan_item to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.profile to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.profile to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.profile to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.profile_effective to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.profile_effective to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.profile_effective to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.profile_fact to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.profile_fact to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.profile_fact to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.resort to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.resort to authenticated;
grant SELECT on table public.resort to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.resort to service_role;
grant INSERT, SELECT, UPDATE on table public.schema_migration to ci_verify;
grant SELECT on table public.schema_migration to reviewer_readonly;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.schema_migration to service_role;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.tester_note to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.trip to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.trip to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.trip to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.trip_day to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.trip_day to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.trip_day to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.trip_member to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.trip_member to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.trip_member to service_role;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.turn_log to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.unanswered_questions to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.unanswered_questions to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.unanswered_questions to service_role;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.unanswered_turns to anon;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.unanswered_turns to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.unanswered_turns to service_role;
grant SELECT on table public.usage_today to anon;
grant SELECT on table public.usage_today to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.usage_today to service_role;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.verification_queue to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE on table public.verification_queue to authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.verification_queue to service_role;
grant INSERT (authority_tier) on table public.knowledge_chunk to team1_content;
grant INSERT (chunk_index) on table public.knowledge_chunk to team1_content;
grant UPDATE (content) on table public.knowledge_chunk to team1_content;
grant INSERT (content) on table public.knowledge_chunk to team1_content;
grant INSERT (doc_id) on table public.knowledge_chunk to team1_content;
grant INSERT (locale) on table public.knowledge_chunk to team1_content;
grant UPDATE (review_status) on table public.knowledge_chunk to team1_content;
grant INSERT (review_status) on table public.knowledge_chunk to team1_content;
grant INSERT (scope_experience) on table public.knowledge_chunk to team1_content;
grant INSERT (scope_park) on table public.knowledge_chunk to team1_content;
grant UPDATE (audience) on table public.knowledge_doc to team1_content;
grant INSERT (audience) on table public.knowledge_doc to team1_content;
grant INSERT (authority_tier) on table public.knowledge_doc to team1_content;
grant INSERT (body) on table public.knowledge_doc to team1_content;
grant UPDATE (body) on table public.knowledge_doc to team1_content;
grant INSERT (corroboration_count) on table public.knowledge_doc to team1_content;
grant UPDATE (corroboration_count) on table public.knowledge_doc to team1_content;
grant UPDATE (country) on table public.knowledge_doc to team1_content;
grant INSERT (country) on table public.knowledge_doc to team1_content;
grant INSERT (doc_type) on table public.knowledge_doc to team1_content;
grant INSERT (id) on table public.knowledge_doc to team1_content;
grant INSERT (last_seen) on table public.knowledge_doc to team1_content;
grant UPDATE (last_seen) on table public.knowledge_doc to team1_content;
grant UPDATE (last_verified) on table public.knowledge_doc to team1_content;
grant INSERT (last_verified) on table public.knowledge_doc to team1_content;
grant INSERT (locale) on table public.knowledge_doc to team1_content;
grant UPDATE (product_family) on table public.knowledge_doc to team1_content;
grant INSERT (product_family) on table public.knowledge_doc to team1_content;
grant INSERT (purchase_type) on table public.knowledge_doc to team1_content;
grant UPDATE (purchase_type) on table public.knowledge_doc to team1_content;
grant INSERT (review_status) on table public.knowledge_doc to team1_content;
grant UPDATE (review_status) on table public.knowledge_doc to team1_content;
grant INSERT (scope_experience) on table public.knowledge_doc to team1_content;
grant INSERT (scope_park) on table public.knowledge_doc to team1_content;
grant INSERT (scope_resort) on table public.knowledge_doc to team1_content;
grant INSERT (source_kind) on table public.knowledge_doc to team1_content;
grant UPDATE (source_urls) on table public.knowledge_doc to team1_content;
grant INSERT (source_urls) on table public.knowledge_doc to team1_content;
grant UPDATE (title) on table public.knowledge_doc to team1_content;
grant INSERT (title) on table public.knowledge_doc to team1_content;
grant UPDATE (updated_at) on table public.knowledge_doc to team1_content;
grant UPDATE (v1_priority) on table public.knowledge_doc to team1_content;
grant INSERT (v1_priority) on table public.knowledge_doc to team1_content;
grant UPDATE (volatility) on table public.knowledge_doc to team1_content;
grant INSERT (volatility) on table public.knowledge_doc to team1_content;
grant UPDATE (intro_he) on table public.park to ci_content;
grant execute on function public.alias_add(p_secret text, p_experience_id text, p_candidate text, p_source text) to anon;
grant execute on function public.alias_add(p_secret text, p_experience_id text, p_candidate text, p_source text) to authenticated;
grant execute on function public.alias_add(p_secret text, p_experience_id text, p_candidate text, p_source text) to service_role;
grant execute on function public.alias_pending(p_secret text, p_limit integer) to anon;
grant execute on function public.alias_pending(p_secret text, p_limit integer) to authenticated;
grant execute on function public.alias_pending(p_secret text, p_limit integer) to service_role;
grant execute on function public.alias_remaining(p_secret text) to anon;
grant execute on function public.alias_remaining(p_secret text) to authenticated;
grant execute on function public.alias_remaining(p_secret text) to service_role;
grant execute on function public.check_rate_limit(p_bucket text) to anon;
grant execute on function public.check_rate_limit(p_bucket text) to authenticated;
grant execute on function public.check_rate_limit(p_bucket text) to service_role;
grant execute on function public.estimated_cost_per_message() to public;
grant execute on function public.find_experiences(p_name text, p_park text, p_height_cm integer, p_limit integer) to anon;
grant execute on function public.find_experiences(p_name text, p_park text, p_height_cm integer, p_limit integer) to authenticated;
grant execute on function public.find_experiences(p_name text, p_park text, p_height_cm integer, p_limit integer) to service_role;
grant execute on function public.ingest_pending(p_secret text, p_limit integer) to anon;
grant execute on function public.ingest_pending(p_secret text, p_limit integer) to authenticated;
grant execute on function public.ingest_pending(p_secret text, p_limit integer) to service_role;
grant execute on function public.ingest_remaining(p_secret text) to anon;
grant execute on function public.ingest_remaining(p_secret text) to authenticated;
grant execute on function public.ingest_remaining(p_secret text) to service_role;
grant execute on function public.ingest_set_embedding(p_secret text, p_id uuid, p_vector text, p_model text) to anon;
grant execute on function public.ingest_set_embedding(p_secret text, p_id uuid, p_vector text, p_model text) to authenticated;
grant execute on function public.ingest_set_embedding(p_secret text, p_id uuid, p_vector text, p_model text) to service_role;
grant execute on function public.ingest_set_key(p_new text, p_current text) to anon;
grant execute on function public.ingest_set_key(p_new text, p_current text) to authenticated;
grant execute on function public.ingest_set_key(p_new text, p_current text) to service_role;
grant execute on function public.is_admin() to public;
grant execute on function public.knowledge_chunk_content_changed() to public;
grant execute on function public.log_turn(p_question text, p_answered boolean, p_refusal_reason text, p_model text, p_input_tokens integer, p_output_tokens integer) to anon;
grant execute on function public.log_turn(p_question text, p_answered boolean, p_refusal_reason text, p_model text, p_input_tokens integer, p_output_tokens integer) to authenticated;
grant execute on function public.log_turn(p_question text, p_answered boolean, p_refusal_reason text, p_model text, p_input_tokens integer, p_output_tokens integer) to ci_verify;
grant execute on function public.match_knowledge(p_embedding text, p_limit integer, p_resort text) to anon;
grant execute on function public.match_knowledge(p_embedding text, p_limit integer, p_resort text) to authenticated;
grant execute on function public.match_knowledge(p_embedding text, p_limit integer, p_resort text) to service_role;
grant execute on function public.park_candidates(p_per_park integer) to anon;
grant execute on function public.park_candidates(p_per_park integer) to authenticated;
grant execute on function public.rate_limit_bucket_daily_cap() to public;
grant execute on function public.rate_limit_daily_cap() to public;
grant execute on function public.rate_limit_max_per_window() to public;
grant execute on function public.rate_limit_window_minutes() to public;
grant execute on function public.save_tester_note(p_key text, p_turn_ref text, p_session_ref text, p_note text, p_question text, p_answer text) to anon;
grant execute on function public.save_tester_note(p_key text, p_turn_ref text, p_session_ref text, p_note text, p_question text, p_answer text) to authenticated;
grant execute on function public.tester_notes(p_limit integer) to ci_verify;
grant execute on function public.unanswered_sample(p_limit integer) to ci_verify;

-- migrate:down
-- ⚠️ אין. baseline אינו מתבטל — ביטול שלו הוא מחיקת המסד.
