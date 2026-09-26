-- verify.sql — a verification check after running all the migrations.
--
-- One query. Every row is one check: what was actually found, what we expected, and status.
-- No SQL knowledge is needed to read it — if every row in the "מצב" (status) column is ✅,
-- the run succeeded in full.
--
-- The numbers here were measured from a real run of the file on an empty database, not written from memory.
-- If you add a migration, update them here.
--
-- This query can be run again at any moment, on its own, without the migrations.

with checks as (

  select 1 as ord,
         'טבלאות שנוצרו' as "בדיקה",
         count(*)::text  as "נמצא",
         '18'            as "ציפינו",
         case when count(*) = 18 then '✅ תקין'
              when count(*) >  18 then '⚠️ יותר מהצפוי — יש טבלאות נוספות ב-public'
              else '❌ חסרות טבלאות — ראי איזו מיגרציה נפלה' end as "מצב"
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'

  union all
  select 2,
         'Views שנוצרו',
         count(*)::text,
         '3',
         case when count(*) = 3 then '✅ תקין'
              else '❌ חסר view — 008_profile_axes או 011_conformance_fixes לא רצו' end
  from information_schema.views where table_schema = 'public'

  union all
  select 3,
         'מדיניות RLS',
         count(*)::text,
         '29',
         case when count(*) = 29 then '✅ תקין'
              when count(*) >  29 then '⚠️ יותר מהצפוי'
              else '❌ חסרה מדיניות — 006_rls או 010_trip_members לא הושלמו' end
  from pg_policies where schemaname = 'public'

  union all
  select 4,
         'טבלאות עם RLS פעיל',
         "עם"::text,
         '18',
         case when "בלי" > 0
                then '❌ ' || "בלי" || ' טבלאות חשופות. זו דליפת מידע, לא אי-נוחות'
              when "עם" = 18 then '✅ תקין — RLS פעיל על כל 18 הטבלאות'
              else '❌ לא כל הטבלאות נוצרו, ולכן אי אפשר לומר ש-RLS שלם' end
  from (
    select count(*) filter (where rowsecurity)     as "עם",
           count(*) filter (where not rowsecurity) as "בלי"
    from pg_tables where schemaname = 'public'
  ) r

  union all
  select 5,
         'אינדקסים',
         count(*)::text,
         '50',
         case when count(*) = 50 then '✅ תקין'
              when count(*) <  50 then '❌ חסרים אינדקסים'
              else '⚠️ יותר מהצפוי' end
  from pg_indexes where schemaname = 'public'

  union all
  select 6,
         'הטבלה experience קיימת',
         case when to_regclass('public.experience') is null then 'לא' else 'כן' end,
         'כן',
         case when to_regclass('public.experience') is null
              then '❌ חסרה — 002_content לא רץ'
              else '✅ תקין' end

  union all
  select 7,
         'עמודות בטבלה experience',
         count(*)::text,
         '39',
         case when count(*) = 39 then '✅ תקין'
              when count(*) <  39 then '❌ חסרות עמודות — 007 / 011 / 012 / 014 לא רצו במלואן'
              else '⚠️ יותר מהצפוי' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'experience'

  union all
  select 8,
         'הטבלה park קיימת',
         case when to_regclass('public.park') is null then 'לא' else 'כן' end,
         'כן',
         case when to_regclass('public.park') is null
              then '❌ חסרה — 002_content לא רץ'
              else '✅ תקין' end

  union all
  -- The count goes through query_to_xml and not through "from park", because a table that does not exist
  -- fails the whole query at parse time — that is, in exactly the state the check is meant
  -- to diagnose. The CASE is evaluated at run time, so it does not touch a missing table.
  select 9,
         'פארקים שנשתלו',
         coalesce(park_count::text, 'אין טבלה'),
         '10',
         case when park_count is null then '❌ הטבלה park לא קיימת בכלל'
              when park_count = 10 then '✅ תקין — 7 פארקי נושא ו-3 פארקי מים'
              when park_count = 7  then '❌ חסרים פארקי המים — 011_water_parks לא רץ'
              else '❌ ה-seed לא הושלם' end
  from (
    select case when to_regclass('public.park') is null then null
                else (xpath('/row/c/text()',
                       query_to_xml('select count(*) as c from public.park',
                                    false, true, '')))[1]::text::int
           end as park_count
  ) p

  union all
  select 10,
         'הרחבות מותקנות',
         coalesce(string_agg(extname, ', ' order by extname), 'אין'),
         'pg_trgm, pgcrypto, vector',
         case when count(*) = 3 then '✅ תקין'
              else '❌ חסרה הרחבה — 001 לא הושלמה' end
  from pg_extension where extname in ('vector','pg_trgm','pgcrypto')

  union all
  select 11,
         'gets_wet מקבל na',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.experience')
                  and pg_get_constraintdef(oid) like '%gets_wet%'
                  and pg_get_constraintdef(oid) like '%na%'
              ) then 'כן' else 'לא' end,
         'כן',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.experience')
                  and pg_get_constraintdef(oid) like '%gets_wet%'
                  and pg_get_constraintdef(oid) like '%na%'
              ) then '✅ תקין' else '❌ 014_gets_wet_na לא רץ' end

  union all
  select 12,
         'height_requirement_cm מרשה 0',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.experience')
                  and pg_get_constraintdef(oid) like '%height_requirement_cm%'
                  and pg_get_constraintdef(oid) like '%= 0)%'
              ) then 'כן' else 'לא' end,
         'כן',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.experience')
                  and pg_get_constraintdef(oid) like '%height_requirement_cm%'
                  and pg_get_constraintdef(oid) like '%= 0)%'
              ) then '✅ תקין' else '❌ 012_height_none לא רץ' end

  union all
  -- ⚠️ A scalar subquery, not "from information_schema.columns" directly:
  --    a missing column would return zero rows, and the check would disappear from the table
  --    instead of lighting up red. This way exactly one row always comes out.
  select 13,
         'trip.park_days',
         coalesce(state, 'אין עמודה'),
         'integer · NULL מותר · בלי ברירת מחדל',
         case when state is null
                then '❌ 015_trip_park_days לא רץ'
              when state = 'integer · NULL מותר · בלי ברירת מחדל'
                then '✅ תקין'
              else '❌ העמודה קיימת אבל לא כפי שהוגדרה. ברירת מחדל או NOT NULL '
                   || 'הופכים "לא נשאל" ל"נענה" — זה הבאג שהמיגרציה נועדה למנוע' end
  from (
    select (select data_type
                || (case when is_nullable = 'YES' then ' · NULL מותר' else ' · NOT NULL' end)
                || (case when column_default is null then ' · בלי ברירת מחדל'
                         else ' · ברירת מחדל ' || column_default end)
            from information_schema.columns
            where table_schema = 'public'
              and table_name   = 'trip'
              and column_name  = 'park_days') as state
  ) pd

  union all
  select 14,
         'התחום של park_days',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.trip')
                  and pg_get_constraintdef(oid) like '%park_days%'
                  and pg_get_constraintdef(oid) like '%30%'
              ) then '1..30' else 'אין' end,
         '1..30',
         case when exists (
                select 1 from pg_constraint
                where conrelid = to_regclass('public.trip')
                  and pg_get_constraintdef(oid) like '%park_days%'
                  and pg_get_constraintdef(oid) like '%30%'
              ) then '✅ תקין' else '❌ אילוץ התחום חסר' end
)
select "בדיקה", "נמצא", "ציפינו", "מצב" from checks order by ord;
