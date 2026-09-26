-- where-are-we.sql — "איפה אנחנו?" ("where are we?") in one query.
--
-- Paste into the Supabase SQL Editor and run. Read-only — changes nothing, can
-- be run again and again.
--
-- Nothing here assumes the tables exist: the counts go through query_to_xml,
-- because "from experience" on a missing table fails the whole query at parse time —
-- that is, in exactly the state it is meant to diagnose.

with
c(name, n) as (
  select v.name,
         case when to_regclass('public.' || v.name) is null then null
              else (xpath('/row/c/text()',
                     query_to_xml('select count(*) as c from public.' || quote_ident(v.name),
                                  false, true, '')))[1]::text::bigint end
  from (values ('experience'), ('park'), ('land'), ('profile'), ('trip'),
               ('conversation'), ('message'), ('knowledge_doc'), ('trip_member')) v(name)
),
-- ⚠️ The table name is part of the row and not a constant. Previously all counts were on
-- experience, and counting knowledge chunks needed a second CTE copying the same
-- query_to_xml guard — two separate identical guards is how one of them gets forgotten.
x(k, n) as (
  select v.k,
         case when to_regclass('public.' || v.tbl) is null then null
              else (xpath('/row/c/text()',
                     query_to_xml('select count(*) as c from public.' || v.tbl
                                  || ' where ' || v.w,
                                  false, true, '')))[1]::text::bigint end
  from (values
    ('chunks',  'knowledge_chunk', 'true'),
    ('vectors', 'knowledge_chunk', 'embedding is not null'),
    ('h_pos',  'experience', 'height_requirement_cm > 0'),
    ('h_zero', 'experience', 'height_requirement_cm = 0'),
    ('h_null', 'experience', 'height_requirement_cm is null'),
    ('wet_na', 'experience', $q$gets_wet = 'na'$q$),
    ('wet_null', 'experience', 'gets_wet is null'),
    ('he_bad', 'experience', $q$name_i18n->>'he' is null or name_i18n->>'he' = ''$q$),
    ('closed', 'experience', $q$status <> 'open'$q$),
    ('skip_null', 'experience', 'skip_line_system is null'),
    ('skip_none', 'experience', $q$skip_line_system = 'none'$q$)
  ) v(k, tbl, w)
),
mig(n, ok) as (values
  ( 1, (select exists (select 1 from pg_extension where extname = 'vector'))),
  ( 2, to_regclass('public.experience') is not null),
  ( 3, to_regclass('public.knowledge_doc') is not null),
  ( 4, to_regclass('public.profile') is not null),
  ( 5, to_regclass('public.conversation') is not null),
  -- ⚠️ **The count was replaced entirely.** This used to be `count(*) >= 29`, and migration 035
  -- dropped one policy on purpose — so the detector reported ❌ on a healthy database. That is
  -- the tenth time a frozen expectation is read as a failure in this project, and this time it also
  -- punished **a security fix**.
  --
  -- The two rules that actually matter, and both stand on their own:
  --   a. RLS enabled on every table in public. A table without it is fully open.
  --   b. The private tables are not reachable without an identity — every policy on them
  --      must be conditioned on auth.uid() or is_admin().
  ( 6, (select count(*) = 0 from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and not c.relrowsecurity)
       and (select count(*) = 0 from pg_policies
             where schemaname = 'public'
               and tablename in ('profile','profile_fact','trip','trip_day',
                                 'trip_member','conversation','message')
               and coalesce(qual, '') not like '%auth.uid%'
               and coalesce(qual, '') not like '%is_admin%')),
  ( 7, to_regclass('public.experience_motion_sickness_idx') is not null),
  ( 8, (select exists (select 1 from pg_constraint where conname = 'experience_must_be_stated'))),
  ( 9, to_regclass('public.plan_item_interest_idx') is not null),
  (10, to_regclass('public.trip_member') is not null),
  (11, (select exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='park' and column_name='park_kind'))),
  (12, (select exists (select 1 from pg_constraint where conrelid = to_regclass('public.experience')
        and conname = 'experience_height_requirement_cm_check'
        and pg_get_constraintdef(oid) like '%= 0%'))),
  (13, (select exists (select 1 from pg_constraint where conrelid = to_regclass('public.experience')
        and conname = 'experience_category_check'
        and pg_get_constraintdef(oid) like '%scenic_ride%'))),
  (14, (select exists (select 1 from pg_constraint where conrelid = to_regclass('public.experience')
        and conname = 'experience_gets_wet_check'
        and pg_get_constraintdef(oid) like '%na%'))),
  (15, (select exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='trip' and column_name='park_days'))),
  -- Not by the string 'express': it is also contained in 'express_pass' of the old
  -- vocabulary, and that returned ✅ on a database that had not run the migration. The unambiguous sign is
  -- that the column became nullable.
  (16, (select exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='experience'
          and column_name='skip_line_system' and is_nullable='YES'))),
  (17, (select not exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='experience'
          and column_name='skip_line_extra_cost'))),
  (18, to_regclass('public.api_call') is not null),
  (19, (select exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='experience' and column_name='status_note'))),
  -- 020 and 021 both create check_rate_limit. The difference is not in the name but in the signature:
  -- 020 returns a boolean from three arguments, 021 text from four. A check by name
  -- alone would report ✅ on a database with no daily limit at all.
  (20, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname='check_rate_limit'))),
  -- ⚠️ 021 was previously identified by a four-argument signature — and that is exactly the signature
  -- 026 removes to close the loophole. That is, the detector would report the migration as
  -- **missing** after we closed the hole, and whoever ran it again would reopen
  -- it. A detector must measure what the migration **brought**, not the shape it
  -- took: what 021 brought is the global daily limit.
  (21, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname='rate_limit_daily_cap'))),
  (22, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname='estimated_cost_per_message'))),
  -- Not by the existence of the new columns alone: 023 also drops the bag, and that is the part
  -- that can be forgotten. The two conditions together are the migration.
  (23, (select exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='experience'
            and column_name='max_speed_kmh')
        and not exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='experience'
            and column_name='intensity_factors'))),
  -- ⚠️ Not by format_type. Its output depends on search_path: here it is
  -- 'extensions.vector(1536)' and on Supabase, which puts extensions on the path,
  -- it is 'vector(1536)'. The detector reported ❌ on a database where the migration ran successfully.
  -- This is the third detector of mine that broke on the same thing. atttypmod is the dimension itself,
  -- and it does not depend on any path.
  (24, (select t.typname = 'vector' and a.atttypmod = 1536
        from pg_attribute a join pg_type t on t.oid = a.atttypid
        where a.attrelid = to_regclass('public.knowledge_chunk')
          and a.attname = 'embedding')),
  -- ⚠️ Two conditions, not one: 025 both adds taxonomy and releases
  -- embedding_model from NOT NULL. Without the second, loading stops, and a check that sees only
  -- the first would report ✅ on a database that cannot be loaded into.
  (25, (select exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='knowledge_doc'
            and column_name='source_urls')
        and exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='knowledge_chunk'
            and column_name='embedding_model' and is_nullable='YES'))),
  -- 🔴 026 closes a loophole, so it is checked as an absence and not a presence: there must **never** be
  -- a version of check_rate_limit with more than one argument. Such a version is granted
  -- to anon and lets the caller send their own cap — that is, the loophole silently returns.
  (26, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname='public' and p.proname='check_rate_limit' and p.pronargs = 1)
        and not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname='public' and p.proname='check_rate_limit' and p.pronargs <> 1))),
  (27, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname='public' and p.proname='ingest_set_embedding'))),
  (28, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname='public' and p.proname='match_knowledge'))),
  -- ⚠️ Tim's tool. Without it he answers about rides from his training — data
  -- that may be two years old and has no verification date.
  (29, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname='public' and p.proname='find_experiences'))),
  -- ⚠️ 030 fixes a bug in the function body and does not add a new object — so
  -- the presence of find_experiences does not distinguish 029 from 030. The detector reads
  -- the body itself and looks for the word that exists only in the fixed version.
  (30, (select pg_get_functiondef(p.oid) like '%regexp_split_to_table%'
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname='find_experiences')),
  (31, (select to_regclass('public.alias_candidate') is not null)),
  -- ⚠️ 032 replaces the body of alias_add and adds no object, so the detector
  -- reads the body — like 030. The presence of the function does not distinguish between the versions.
  (32, (select pg_get_functiondef(p.oid) like '%from park p%'
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname='alias_add')),
  -- ⚠️ The trigger itself, not its function. A function that exists and is not attached
  -- to the table looks identical to a trigger that works — and that is exactly the distinction this migration
  -- exists for.
  (33, (select exists (select 1 from pg_trigger
          where tgrelid = to_regclass('public.knowledge_chunk')
            and tgname = 'knowledge_chunk_content_changed'
            and not tgisinternal))),
  -- ⚠️ The constraint **and also** the absence of NOT NULL. A constraint installed on a column that is still
  -- NOT NULL DEFAULT '{}' looks installed and solves nothing — the distinction between
  -- "not asked" and "none" is erased before the constraint is even checked.
  (34, (select exists (select 1 from pg_constraint
          where conname = 'trip_member_sensitivities_vocab')
        and not (select attnotnull from pg_attribute
                  where attrelid = to_regclass('public.trip_member')
                    and attname = 'sensitivities'))),
  -- ⚠️ The absence of an open policy **and also** RLS enabled. A table without RLS is fully
  -- open, and deleting its last policy closes nothing.
  (35, (select not exists (select 1 from pg_policies
          where schemaname='public' and tablename='experience_source'
            and cmd in ('SELECT','ALL')
            and coalesce(qual,'') not like '%is_admin%')
        and (select relrowsecurity from pg_class
              where oid = to_regclass('public.experience_source')))),
  -- ⚠️ Same pattern, second place. The knowledge tables carried source_url, submitted_by
  -- and embedding, and all of them were readable by anonymous users.
  (36, (select not exists (select 1 from pg_policies
          where schemaname='public'
            and tablename in ('knowledge_doc','knowledge_chunk')
            and cmd in ('SELECT','ALL')
            and coalesce(qual,'') not like '%is_admin%')
        and (select bool_and(relrowsecurity) from pg_class
              where oid in (to_regclass('public.knowledge_doc'),
                            to_regclass('public.knowledge_chunk'))))),
  -- ⚠️ The function exists **and also** the body actually calls it. A cap function that exists
  -- and is not called looks installed and protects nothing — and that is exactly what happened
  -- in 021.
  (37, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
          where ns.nspname='public' and p.proname='rate_limit_bucket_daily_cap')
        and (select pg_get_functiondef(p.oid) like '%rate_limit_bucket_daily_cap%'
               from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
              where ns.nspname='public' and p.proname='check_rate_limit')))
),
-- ⚠️ The total is counted from the list of detectors and is not written as a number. "32" was written here
-- by hand, so adding the 33rd detector lit ❌ on a perfectly healthy database — the
-- seventh time a frozen expectation reports as a failure. Now adding a detector updates
-- the total by itself.
g(passed, total, missing) as (
  select count(*) filter (where ok),
         count(*),
         coalesce(string_agg(lpad(n::text, 3, '0'), ', ') filter (where not ok), '')
  from mig
),
n(experience, park, land, profile, trip, conversation, knowledge_doc, chunks, vectors,
  h_pos, h_zero, h_null, wet_na, wet_null, he_bad, closed, skip_null, skip_none,
  tables, policies, passed, total, missing) as (
  select (select n from c where name='experience'),
         (select n from c where name='park'),
         (select n from c where name='land'),
         (select n from c where name='profile'),
         (select n from c where name='trip'),
         (select n from c where name='conversation'),
         (select n from c where name='knowledge_doc'),
         (select n from x where k='chunks'),
         (select n from x where k='vectors'),
         (select n from x where k='h_pos'),
         (select n from x where k='h_zero'),
         (select n from x where k='h_null'),
         (select n from x where k='wet_na'),
         (select n from x where k='wet_null'),
         (select n from x where k='he_bad'),
         (select n from x where k='closed'),
         (select n from x where k='skip_null'),
         (select n from x where k='skip_none'),
         (select count(*) from information_schema.tables
            where table_schema='public' and table_type='BASE TABLE'),
         (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
         (select passed from g), (select total from g), (select missing from g)
),
report(ord, "מה", "מצב") as (
  select 1, 'מיגרציות',
         case when passed = total then total || ' מתוך ' || total || ' ✅'
              else passed || ' מתוך ' || total || ' ❌  — חסרות: ' || missing end from n
  union all
  select 2, 'מבנה',
         -- ⚠️ 20, not 19: migration 027 added ingest_key. A detector that stayed on
              -- the old number reports ❌ on a healthy database, and that is exactly the kind of report that sends you
              -- looking for a fault that does not exist.
              case when tables = 21 then '21 טבלאות ✅'
              when tables = 20 then '20 טבלאות — חסרה alias_candidate, לא הורץ קובץ 031 ❌'
              when tables = 19 then '19 טבלאות — חסרה ingest_key, לא הורץ קובץ 027 ❌'
              when tables = 18 then '18 טבלאות — חסרה api_call, לא הורץ קובץ 018 ❌'
              when tables = 0  then 'המסד ריק לגמרי ❌ — לא הורץ supabase-bundle.sql'
              else tables || ' טבלאות מתוך 21 ❌' end from n
  union all
  select 3, 'הרשאות (RLS)',
         -- ⚠️ Measured as "how many tables **without** RLS", not how many policies there are.
         -- The number of policies goes up and down with every fix; a table without RLS is
         -- always a bug.
         case when policies = 0 then 'כל הטבלאות עם RLS ✅'
              else policies || ' טבלאות בלי RLS ❌' end from n
  union all
  select 4, 'התוכן — מתקנים',
         -- ⚠️ **Reported, not compared to a frozen number.** The row count changes with every content
              -- batch, and a detector left on the old one reports ⚠️ on a healthy database and sends you looking for
              -- a fault that does not exist. This happened here five times. The check that the load
              -- completed sits in the content file itself, where there is something to compare against.
              case when experience is null then 'הטבלה לא קיימת ❌'
              when experience = 0 then 'ריק ❌ — לא הורץ קובץ התוכן'
              else experience || ' מתקנים' end from n
  union all
  select 5, 'התוכן — פארקים',
         case when park is null then 'הטבלה לא קיימת ❌'
              when park = 10 then '10 מתוך 10 ✅'
              when park = 7  then '7 מתוך 10 ⚠️ — חסרים פארקי המים'
              else coalesce(park::text,'0') || ' מתוך 10 ❌' end from n
  union all
  select 6, 'שם עברי לכל מתקן',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              when he_bad = 0 then 'לכולם יש ✅'
              -- ⚠️ A real content gap, not a stale detector: the character meet-and-greets added
              -- in v7_10 arrived without a Hebrew name.
              else he_bad || ' בלי שם עברי ❌ — פער תוכן' end from n
  union all
  select 7, 'גובה — שלושת המצבים',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              -- ⚠️ **The rule is h_null = 0, not the breakdown.** How many rides have a
              -- restriction and how many do not is a description that changes with the content; what is forbidden is
              -- a ride whose height was not checked, because NULL is not "suitable for the whole family".
              when h_null = 0
                then h_pos || ' עם מגבלה · ' || h_zero || ' בלי · 0 לא נבדקו ✅'
              else h_null || ' מתקנים שגובהם לא נבדק ❌' end from n
  union all
  select 8, 'gets_wet',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              -- ⚠️ **The rule is no NULL.** 'na' is a value — the question does not
              -- apply, and that is an answer. NULL is "not checked". The old detector expected
              -- exactly 66 and described the gap as "the export writes an empty cell" — and that
              -- turned out to be wrong: the master wrote N/A and our import threw it away.
              when wet_null = 0 then wet_na || ' na · 0 לא נבדקו ✅'
              else wet_null || ' מתקנים שלא נבדקו ❌' end from n
  union all
  select 9, 'מתקנים שאינם פתוחים',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              when closed > 0 then closed || ' מסומנים סגור/בקרוב ✅'
              else 'הכל נטען כפתוח ❌ — סטטוס נמעך' end from n
  union all
  select 9.5, 'מוצר דילוג בתור',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              -- ⚠️ Reported. The real failure is collapse: if no row is NULL,
              -- someone silently turned "not checked" into 'none'.
              when skip_null = 0 and skip_none = experience
                then 'כל השורות מסומנות "אין" ❌ — הכיווץ חזר'
              else skip_null || ' לא נבדקו · ' || skip_none || ' נבדקו ואין' end from n
  union all
  select 10, 'אזורים בפארקים (land)',
         case when land is null then 'הטבלה לא קיימת ❌'
              -- ⚠️ 79, not 77. "Park-wide" appears in three parks, and was counted once
              -- in the list of unique names. The expectation here said 77 and the seeding
              -- succeeded — that is, the check reported ⚠️ on a perfectly healthy database.
              -- ⚠️ Reported. The number of lands changes with the content.
              when land = 0 then 'ריק — האזורים עוד לא נשתלו ⏳'
              else land || ' אזורים ✅' end from n
  union all
  select 11, 'מאגר הידע',
         case when knowledge_doc is null then 'הטבלה לא קיימת ❌'
              when knowledge_doc = 0 then 'ריק — עוד לא נטען ⏳'
              when chunks = 0 then knowledge_doc || ' מסמכים, ואפס קטעים ❌'
              when vectors = 0
                then knowledge_doc || ' מסמכים · ' || chunks
                     || ' קטעים · אף אחד עדיין בלי וקטור ⏳ — טים לא ישלוף מהם'
              when vectors < chunks
                then vectors || ' מתוך ' || chunks || ' קטעים חושבו ⏳'
              else knowledge_doc || ' מסמכים · ' || chunks || ' קטעים · כולם חושבו ✅'
              end from n
  union all
  select 17, 'סוד הטעינה',
         case when to_regclass('public.ingest_key') is null
                then 'לא הורצה מיגרציה 027 ⏳'
              when not exists (select 1 from ingest_key) then
                'לא נקבע ⏳ — להריץ select ingest_set_key(...)'
              else 'נקבע ✅' end
  union all
  select 12, 'משתמשים רשומים',
         case when profile is null then 'הטבלה לא קיימת ❌'
              when profile = 0 then 'ריק — הרשמה עוד לא נבנתה ⏳'
              else profile || ' משתמשים' end from n
  union all
  select 13, 'טיולים שנשמרו',
         case when trip is null then 'הטבלה לא קיימת ❌'
              when trip = 0 then 'ריק — האפליקציה עוד לא כותבת למסד ⏳'
              else trip || ' טיולים' end from n
  union all
  select 15, 'מוכן לחיבור המודל',
         case when to_regclass('public.api_call') is null
                then '❌ חסרה טבלת הגבלת הקצב — לא הורץ קובץ 018'
              else '✅ כן — אפשר להתקדם למדריך של ג׳מיני' end from n
  union all
  select 14, 'שיחות שנשמרו',
         case when conversation is null then 'הטבלה לא קיימת ❌'
              when conversation = 0 then 'ריק — האפליקציה עוד לא כותבת למסד ⏳'
              else conversation || ' שיחות' end from n
)
select "מה", "מצב" from report order by ord;
