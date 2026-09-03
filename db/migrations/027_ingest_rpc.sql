-- 027_ingest_rpc.sql
-- החישוב עובר ל-RPC עם סוד, כי service_role אינו נפתר בפרויקט הזה.
--
-- ⚠️ **עובדה שנמדדה ולא שוערה:** פונקציית embed ניסתה לקרוא את הקטעים
-- עם SUPABASE_SERVICE_ROLE_KEY וקיבלה **403**. זהו אותו 403 שקיבלנו
-- במיגרציה 020 — כלומר המפתח כן מתקבל, והתפקיד שהוא נפתר אליו אינו
-- service_role. הפרויקט על מערכת המפתחות החדשה, ואיני יכול לאמת מכאן
-- לאיזה תפקיד כל מפתח נפתר. במקום לנחש שוב — אותו פתרון שכבר עבד:
-- פונקציית security definer, שעובדת ללא תלות בתפקיד.
--
-- ⚠️ **אבל כאן, בשונה מ-check_rate_limit, נדרש סוד.** גדר הקצב מקבלת
-- מחרוזת ומחזירה כן/לא — היא לא מזיקה למי שקורא לה. כתיבת embedding כן:
-- מי שיכולה לכתוב וקטור שרירותי יכולה לגרום לטים לשלוף את הקטע הלא
-- נכון לכל שאלה, בשקט מוחלט. **הרעלה של אינדקס שליפה אינה נראית על
-- המסך כתקלה — היא נראית כתשובה.**
--
-- ⚠️ והלקח מ-026 מיושם כאן מראש: **הגג אינו ארגומנט.** p_limit נחתך
-- בתוך הפונקציה, כדי שהקוראת לא תוכל לבקש את כל הטבלה בבת אחת.

BEGIN;

set local search_path = public, extensions;

-- ── הסוד, כגיבוב ─────────────────────────────────────────────────────
--
-- ⚠️ נשמר כ-sha256 ולא כטקסט. הטבלה סגורה ב-RLS בלי שום מדיניות, כלומר
-- היא בלתי נראית מבחוץ לחלוטין — אבל סוד שנשמר בצורתו הקריאה הוא סוד
-- שמי שמקבל גישה למסד קורא. הפונקציות מגבבות את מה שנשלח ומשוות.
create table if not exists ingest_key (
  id       int primary key default 1 check (id = 1),
  hash     text not null,
  set_at   timestamptz not null default now()
);
alter table ingest_key enable row level security;
-- אין מדיניות, בכוונה. רק security definer רואה אותה.

/**
 * קביעת הסוד. בפעם הראשונה — פתוחה; אחר כך דורשת את הקודם.
 *
 * ⚠️ בלי התנאי הזה כל מי שיכולה לקרוא ל-RPC הייתה יכולה **להחליף** את
 * הסוד ואז להשתמש בו. "אין עדיין סוד" ו"יש סוד ואני לא יודעת אותו" הם
 * שני מצבים שונים, ורק הראשון פתוח.
 */
create or replace function public.ingest_set_key(p_new text, p_current text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
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

create or replace function public.ingest_check(p_secret text) returns boolean
language sql stable security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from ingest_key
     where id = 1 and hash = encode(sha256(coalesce(p_secret, '')::bytea), 'hex')
  )
$$;

-- ── מה עוד לא חושב ───────────────────────────────────────────────────
create or replace function public.ingest_pending(p_secret text, p_limit int default 25)
returns table (id uuid, content text)
language plpgsql
security definer
set search_path = public, extensions
as $$
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

-- ── כתיבת הווקטור ────────────────────────────────────────────────────
--
-- ⚠️ הווקטור מגיע כטקסט ומומר כאן. PostgREST שולח JSON ואינו יודע לבנות
-- טיפוס vector; המרה בצד המסד היא גם מה שמוודא שהממד נכון — ערך באורך
-- אחר נדחה על ידי הטיפוס עצמו, ולא נכנס.
create or replace function public.ingest_set_embedding(
  p_secret text,
  p_id     uuid,
  p_vector text,
  p_model  text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
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

-- ── כמה נשארו ────────────────────────────────────────────────────────
create or replace function public.ingest_remaining(p_secret text) returns int
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare n int;
begin
  if not public.ingest_check(p_secret) then
    raise exception 'סוד שגוי';
  end if;
  select count(*) into n from knowledge_chunk where embedding is null;
  return n;
end
$$;

-- ── הרשאות ───────────────────────────────────────────────────────────
-- ⚠️ ingest_check אינה מוענקת לאיש. היא כלי פנימי של השלוש האחרות, והענקה
-- שלה הייתה נותנת אורקל לניחוש הסוד — תשובה מיידית של אמת/שקר לכל ניסיון.
do $$
declare r text; f text;
begin
  revoke all on function public.ingest_check(text) from public;
  foreach f in array array[
    'ingest_set_key(text, text)',
    'ingest_pending(text, int)',
    'ingest_set_embedding(text, uuid, text, text)',
    'ingest_remaining(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    foreach r in array array['anon','authenticated','service_role'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('grant execute on function public.%s to %I', f, r);
      end if;
    end loop;
  end loop;
end
$$;

comment on function public.ingest_set_embedding(text, uuid, text, text) is
  '⚠️ כתיבת וקטור. דורשת סוד: מי שיכולה לכתוב וקטור שרירותי יכולה לגרום לטים לשלוף את הקטע הלא נכון לכל שאלה — והרעלת אינדקס שליפה אינה נראית כתקלה אלא כתשובה.';

COMMIT;
