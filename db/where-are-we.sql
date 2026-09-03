-- where-are-we.sql — "איפה אנחנו?" בשאילתה אחת.
--
-- להדביק ל-Supabase SQL Editor ולהריץ. קוראת בלבד — לא משנה כלום, אפשר
-- להריץ שוב ושוב.
--
-- שום דבר כאן לא מניח שהטבלאות קיימות: הספירות עוברות דרך query_to_xml,
-- כי "from experience" על טבלה חסרה מפיל את השאילתה כולה בזמן ניתוח —
-- כלומר בדיוק במצב שהיא נועדה לאבחן.

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
-- ⚠️ שם הטבלה הוא חלק מהשורה ולא קבוע. קודם כל הספירות היו על
-- experience, וספירת קטעי ידע דרשה CTE שני שמעתיק את אותה הגנה של
-- query_to_xml — שתי הגנות זהות נפרדות זו הצורה שבה אחת מהן נשכחת.
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
  ( 6, (select count(*) from pg_policies where schemaname = 'public') >= 29),
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
  -- לא לפי המחרוזת 'express': היא מוכלת גם ב-'express_pass' של אוצר המילים
  -- הישן, וזה החזיר ✅ על מסד שלא הריץ את המיגרציה. הסימן החד-משמעי הוא
  -- שהעמודה הפכה ל-nullable.
  (16, (select exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='experience'
          and column_name='skip_line_system' and is_nullable='YES'))),
  (17, (select not exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='experience'
          and column_name='skip_line_extra_cost'))),
  (18, to_regclass('public.api_call') is not null),
  (19, (select exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='experience' and column_name='status_note'))),
  -- 020 ו-021 שתיהן יוצרות check_rate_limit. ההבדל אינו בשם אלא בחתימה:
  -- 020 מחזירה בוליאני משלושה ארגומנטים, 021 טקסט מארבעה. בדיקה לפי שם
  -- בלבד הייתה מדווחת ✅ על מסד שאין בו גדר יומי כלל.
  (20, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname='check_rate_limit'))),
  -- ⚠️ 021 נזהתה קודם לפי חתימה של ארבעה ארגומנטים — וזו בדיוק החתימה
  -- ש-026 מסירה כדי לסגור את הפרצה. כלומר הגלאי היה מדווח שמיגרציה
  -- **חסרה** אחרי שסגרנו את החור, ומי שהיה מריץ אותה שוב היה פותח אותו
  -- מחדש. גלאי חייב למדוד את מה שהמיגרציה **הביאה**, לא את הצורה שהיא
  -- לבשה: מה ש-021 הביאה הוא הגדר היומי הגלובלי.
  (21, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname='rate_limit_daily_cap'))),
  (22, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname='public' and p.proname='estimated_cost_per_message'))),
  -- לא לפי קיום העמודות החדשות בלבד: 023 גם מורידה את השק, וזה החלק
  -- שאפשר לשכוח. שני התנאים יחד הם המיגרציה.
  (23, (select exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='experience'
            and column_name='max_speed_kmh')
        and not exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='experience'
            and column_name='intensity_factors'))),
  -- ⚠️ לא לפי format_type. הפלט שלו תלוי ב-search_path: אצלנו הוא
  -- 'extensions.vector(1536)' ובסופאבייס, ששמה את extensions בנתיב,
  -- הוא 'vector(1536)'. הגלאי דיווח ❌ על מסד שהמיגרציה רצה בו בהצלחה.
  -- זה הגלאי השלישי שלי שנשבר על אותו דבר. atttypmod הוא הממד עצמו,
  -- והוא אינו תלוי בשום נתיב.
  (24, (select t.typname = 'vector' and a.atttypmod = 1536
        from pg_attribute a join pg_type t on t.oid = a.atttypid
        where a.attrelid = to_regclass('public.knowledge_chunk')
          and a.attname = 'embedding')),
  -- ⚠️ שני תנאים, לא אחד: 025 גם מוסיפה טקסונומיה וגם משחררת את
  -- embedding_model מ-NOT NULL. בלי השני הטעינה נעצרת, ובדיקה שרואה רק
  -- את הראשון הייתה מדווחת ✅ על מסד שלא ניתן לטעון אליו.
  (25, (select exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='knowledge_doc'
            and column_name='source_urls')
        and exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='knowledge_chunk'
            and column_name='embedding_model' and is_nullable='YES'))),
  -- 🔴 026 סוגרת פרצה, ולכן היא נבדקת כהיעדר ולא כנוכחות: **אסור** שתהיה
  -- גרסה של check_rate_limit עם יותר מארגומנט אחד. גרסה כזו מוענקת
  -- ל-anon ומאפשרת לשלוח גג משלך — כלומר הפרצה חוזרת בשקט.
  (26, (select exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname='public' and p.proname='check_rate_limit' and p.pronargs = 1)
        and not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname='public' and p.proname='check_rate_limit' and p.pronargs <> 1)))
),
g(passed, missing) as (
  select count(*) filter (where ok),
         coalesce(string_agg(lpad(n::text, 3, '0'), ', ') filter (where not ok), '')
  from mig
),
n(experience, park, land, profile, trip, conversation, knowledge_doc, chunks, vectors,
  h_pos, h_zero, h_null, wet_na, he_bad, closed, skip_null, skip_none,
  tables, policies, passed, missing) as (
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
         (select n from x where k='he_bad'),
         (select n from x where k='closed'),
         (select n from x where k='skip_null'),
         (select n from x where k='skip_none'),
         (select count(*) from information_schema.tables
            where table_schema='public' and table_type='BASE TABLE'),
         (select count(*) from pg_policies where schemaname='public'),
         (select passed from g), (select missing from g)
),
report(ord, "מה", "מצב") as (
  select 1, 'מיגרציות',
         case when passed = 26 then '26 מתוך 26 ✅'
              else passed || ' מתוך 26 ❌  — חסרות: ' || missing end from n
  union all
  select 2, 'מבנה',
         case when tables = 19 then '19 טבלאות ✅'
              when tables = 18 then '18 טבלאות — חסרה api_call, לא הורץ קובץ 018 ❌'
              when tables = 0  then 'המסד ריק לגמרי ❌ — לא הורץ supabase-bundle.sql'
              else tables || ' טבלאות מתוך 19 ❌' end from n
  union all
  select 3, 'הרשאות (RLS)',
         case when policies >= 29 then policies || ' מדיניות ✅'
              else policies || ' מתוך 29 ❌' end from n
  union all
  select 4, 'התוכן — מתקנים',
         case when experience is null then 'הטבלה לא קיימת ❌'
              when experience = 232 then '232 מתוך 232 ✅'
              when experience = 0   then 'ריק ❌ — לא הורץ קובץ התוכן'
              else experience || ' מתוך 232 ⚠️ — הטעינה לא הושלמה' end from n
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
              else he_bad || ' מתקנים בלי שם עברי ❌' end from n
  union all
  select 7, 'גובה — שלושת המצבים',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              when h_pos = 78 and h_zero = 154 and h_null = 0
                then '78 עם מגבלה · 154 בלי · 0 לא נבדקו ✅'
              else h_pos || ' עם מגבלה · ' || h_zero || ' בלי · ' || h_null
                   || ' לא נבדקו ⚠️ — לא תואם למאסטר' end from n
  union all
  select 8, 'gets_wet',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              when wet_na = 66 then '66 שורות na ✅'
              else wet_na || ' שורות na במקום 66 ⚠️ — הייצוא כותב תא ריק. פער תוכן, לא תקלה' end from n
  union all
  select 9, 'מתקנים שאינם פתוחים',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              when closed > 0 then closed || ' מסומנים סגור/בקרוב ✅'
              else 'הכל נטען כפתוח ❌ — סטטוס נמעך' end from n
  union all
  select 9.5, 'מוצר דילוג בתור',
         case when experience is null or experience = 0 then 'אין תוכן עדיין'
              when skip_null = 74 and skip_none = 75
                then '74 לא נבדקו · 75 נבדקו ואין ✅'
              when skip_null = 0 and skip_none = 232
                then 'כל 232 מסומנים "אין" ❌ — לא הורצה מיגרציה 016'
              else skip_null || ' לא נבדקו · ' || skip_none || ' נבדקו ואין ⚠️' end from n
  union all
  select 10, 'אזורים בפארקים (land)',
         case when land is null then 'הטבלה לא קיימת ❌'
              -- ⚠️ 79 ולא 77. "Park-wide" מופיע בשלושה פארקים, ונספר פעם
              -- אחת ברשימת השמות הייחודיים. הציפייה כאן אמרה 77 והשתילה
              -- הצליחה — כלומר הבדיקה דיווחה ⚠️ על מסד תקין לחלוטין.
              when land = 0 then 'ריק — 79 האזורים עוד לא נשתלו ⏳'
              when land = 79 then '79 אזורים ✅'
              else land || ' אזורים מתוך 79 ⚠️' end from n
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
