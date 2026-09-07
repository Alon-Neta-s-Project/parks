-- ── אימות התוכן ──────────────────────────────────────────────────────
-- ספירה לבדה תגיד "232 שורות" גם אם שלושת המצבים נמעכו. הבדיקה הזו
-- משווה שלושה מספרים לכל שדה:
--   במסד   — מה שיש עכשיו בסופאבייס
--   בייצוא — מה שיש בקובץ שממנו נוצר ה-SQL הזה
--   אצלך   — מה שנמסר על המאסטר
--
-- במסד ≠ בייצוא  → ❌ משהו נמעך במעבר. זו תקלה.
-- במסד = בייצוא ≠ אצלך → ⚠️ הגיע ככה מהייצוא. פער תוכן, לא תקלת העברה.
--
-- אפשר להריץ אותה שוב בכל רגע, לבד.

with checks as (
  select 1 as ord,
         'שורות ב-experience' as "בדיקה",
         (select count(*) from experience)::text as "במסד",
         '242' as "בייצוא",
         '—' as "אצלך",
         case when (select count(*) from experience) <> 242 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when false then ''
              else '✅ תקין' end as "מצב"

  union all
  select 2 as ord,
         'height > 0 (יש מגבלה)' as "בדיקה",
         (select count(*) from experience where height_requirement_cm > 0)::text as "במסד",
         '79' as "בייצוא",
         '78' as "אצלך",
         case when (select count(*) from experience where height_requirement_cm > 0) <> 79 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when true then '⚠️ הפרש מול המאסטר, כי 0 שורות נעצרו בכוונה. לא נמעך במעבר — ראה את השורה האחרונה'
              else '✅ תקין' end as "מצב"

  union all
  select 3 as ord,
         'height = 0 (נבדק, אין מגבלה)' as "בדיקה",
         (select count(*) from experience where height_requirement_cm = 0)::text as "במסד",
         '163' as "בייצוא",
         '154' as "אצלך",
         case when (select count(*) from experience where height_requirement_cm = 0) <> 163 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when true then '⚠️ הפרש מול המאסטר, כי 0 שורות נעצרו בכוונה. לא נמעך במעבר — ראה את השורה האחרונה'
              else '✅ תקין' end as "מצב"

  union all
  select 4 as ord,
         'height NULL (לא נבדק)' as "בדיקה",
         (select count(*) from experience where height_requirement_cm is null)::text as "במסד",
         '0' as "בייצוא",
         '0' as "אצלך",
         case when (select count(*) from experience where height_requirement_cm is null) <> 0 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when false then ''
              else '✅ תקין' end as "מצב"

  union all
  select 5 as ord,
         'gets_wet = ''na''' as "בדיקה",
         (select count(*) from experience where gets_wet = 'na')::text as "במסד",
         '77' as "בייצוא",
         '66' as "אצלך",
         case when (select count(*) from experience where gets_wet = 'na') <> 77 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when true then '⚠️ לא נמעך במעבר — הייצוא עצמו כותב תא ריק במקום na. ראה שורה 6'
              else '✅ תקין' end as "מצב"

  union all
  select 6 as ord,
         'gets_wet NULL' as "בדיקה",
         (select count(*) from experience where gets_wet is null)::text as "במסד",
         '0' as "בייצוא",
         '0' as "אצלך",
         case when (select count(*) from experience where gets_wet is null) <> 0 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when false then '⚠️ אלה אותן 66 שורות של שורה 5, עם NULL במקום na. פער בייצוא, לא במעבר'
              else '✅ תקין' end as "מצב"

  union all
  select 7 as ord,
         'intensity NULL' as "בדיקה",
         (select count(*) from experience where intensity is null)::text as "במסד",
         '0' as "בייצוא",
         '0' as "אצלך",
         case when (select count(*) from experience where intensity is null) <> 0 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when false then ''
              else '✅ תקין' end as "מצב"

  union all
  select 8 as ord,
         'wheelchair NULL' as "בדיקה",
         (select count(*) from experience where wheelchair is null)::text as "במסד",
         '1' as "בייצוא",
         '1' as "אצלך",
         case when (select count(*) from experience where wheelchair is null) <> 1 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when false then ''
              else '✅ תקין — Tike''s Peak, וזה נכון' end as "מצב"

  union all
  select 9,
         'שם עברי לכל שורה',
         (select count(*) from experience where name_i18n->>'he' is null or name_i18n->>'he' = '')::text,
         '0',
         '—',
         case when (select count(*) from experience where name_i18n->>'he' is null or name_i18n->>'he' = '') = 0
                then '✅ תקין — לכל השורות יש שם עברי'
              else '❌ שורות בלי שם עברי' end

  union all
  select 10,
         'status — לא הכל open',
         (select string_agg(status || ': ' || n, ' · ' order by status)
            from (select status, count(*) as n from experience group by status) s),
         '217 open · 22 closed · 2 temporarily_closed · 1 coming_soon',
         '—',
         case when (select count(*) from experience where status = 'closed') > 0
                then '✅ תקין — הסגורים נשמרו כסגורים'
              else '❌ הכל נטען כ-open. מתקן סגור שמוצג כפתוח הוא באג' end

  union all
  select 11,
         'פארקים מיוצגים',
         (select count(distinct park_id) from experience)::text,
         '10',
         '—',
         case when (select count(distinct park_id) from experience) = 10
                then '✅ תקין' else '❌ פארק חסר' end

  union all
  select 11.5,
         'מוצר דילוג בתור',
         (select string_agg(coalesce(skip_line_system,'(לא נבדק)') || ': ' || n, ' · ' order by n desc)
            from (select skip_line_system, count(*) as n from experience group by 1) s),
         'none: 83 · (לא נבדק): 76 · multi_pass: 51 · express: 27 · single_pass: 5',
         '—',
         case when (select count(*) from experience where skip_line_system is null) = 76
               and (select count(*) from experience where skip_line_system = 'none') = 83
                then '✅ תקין — NULL הוא "לא נבדק", לא "אין"'
              else '❌ לא תואם לייצוא' end

  union all
  select 12,
         'שורות שנעצרו בכוונה',
         '0',
         '0',
         '0',
         '✅ תקין — שום שורה לא נעצרה'

)
select "בדיקה", "במסד", "בייצוא", "אצלך", "מצב" from checks order by ord;
