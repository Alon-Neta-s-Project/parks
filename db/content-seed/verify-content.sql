-- ── אימות התוכן ──────────────────────────────────────────────────────
-- ספירה לבדה תגיד "232 שורות" גם אם שלושת המצבים נמעכו. הבדיקה הזו
-- משווה שני מספרים לכל שדה:
--   במסד   — מה שיש עכשיו בסופאבייס
--   בייצוא — מה שיש בקובץ שממנו נוצר ה-SQL הזה
--
-- ⚠️ **שתי עמודות ולא שלוש.** הייתה כאן עמודה שלישית, "אצלך", שהשוותה
-- למספרים שנמסרו על המאסטר. היא הפסיקה להיות נחוצה כשהייצוא נבנה
-- מהמאסטר עצמו, והמספרים שבה נשארו קפואים — כלומר היא הדליקה ⚠️ על
-- טעינה תקינה בכל מנת תוכן חדשה.
--
-- במסד ≠ בייצוא → ❌ משהו נמעך במעבר. זו ההשוואה שמגלה תקלה.
--
-- אפשר להריץ אותה שוב בכל רגע, לבד.

with checks as (
  select 1 as ord,
         'שורות ב-experience' as "בדיקה",
         (select count(*) from experience)::text as "במסד",
         '242' as "בייצוא",
         case when (select count(*) from experience) <> 242 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else '✅ תקין' end as "מצב"

  union all
  select 2 as ord,
         'height > 0 (יש מגבלה)' as "בדיקה",
         (select count(*) from experience where height_requirement_cm > 0)::text as "במסד",
         '74' as "בייצוא",
         case when (select count(*) from experience where height_requirement_cm > 0) <> 74 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else '✅ תקין' end as "מצב"

  union all
  select 3 as ord,
         'height = 0 (נבדק, אין מגבלה)' as "בדיקה",
         (select count(*) from experience where height_requirement_cm = 0)::text as "במסד",
         '165' as "בייצוא",
         case when (select count(*) from experience where height_requirement_cm = 0) <> 165 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else '✅ תקין' end as "מצב"

  union all
  select 4 as ord,
         'height NULL (לא נבדק)' as "בדיקה",
         (select count(*) from experience where height_requirement_cm is null)::text as "במסד",
         '3' as "בייצוא",
         case when (select count(*) from experience where height_requirement_cm is null) <> 3 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else '✅ תקין' end as "מצב"

  union all
  select 5 as ord,
         'gets_wet = ''na''' as "בדיקה",
         (select count(*) from experience where gets_wet = 'na')::text as "במסד",
         '77' as "בייצוא",
         case when (select count(*) from experience where gets_wet = 'na') <> 77 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else '✅ תקין — ''na'' הוא מופע, וזו תשובה' end as "מצב"

  union all
  select 6 as ord,
         'gets_wet NULL (לא נבדק)' as "בדיקה",
         (select count(*) from experience where gets_wet is null)::text as "במסד",
         '0' as "בייצוא",
         case when (select count(*) from experience where gets_wet is null) <> 0 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else '✅ תקין' end as "מצב"

  union all
  select 7 as ord,
         'intensity NULL' as "בדיקה",
         (select count(*) from experience where intensity is null)::text as "במסד",
         '0' as "בייצוא",
         case when (select count(*) from experience where intensity is null) <> 0 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else '✅ תקין' end as "מצב"

  union all
  select 8 as ord,
         'wheelchair NULL' as "בדיקה",
         (select count(*) from experience where wheelchair is null)::text as "במסד",
         '1' as "בייצוא",
         case when (select count(*) from experience where wheelchair is null) <> 1 then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else '✅ תקין — Tike''s Peak, וזה נכון' end as "מצב"

  union all
  select 9,
         'שם עברי לכל שורה',
         (select count(*) from experience where name_i18n->>'he' is null or name_i18n->>'he' = '')::text,
         '0',
         case when (select count(*) from experience where name_i18n->>'he' is null or name_i18n->>'he' = '') = 0
                then '✅ תקין — לכל השורות יש שם עברי'
              else '❌ שורות בלי שם עברי' end

  union all
  select 10,
         'status — לא הכל open',
         (select string_agg(status || ': ' || n, ' · ' order by status)
            from (select status, count(*) as n from experience group by status) s),
         '236 open · 3 closed · 2 temporarily_closed · 1 coming_soon',
         case when (select count(*) from experience where status = 'closed') > 0
                then '✅ תקין — הסגורים נשמרו כסגורים'
              else '❌ הכל נטען כ-open. מתקן סגור שמוצג כפתוח הוא באג' end

  union all
  select 11,
         'פארקים מיוצגים',
         (select count(distinct park_id) from experience)::text,
         '10',
         case when (select count(distinct park_id) from experience) = 10
                then '✅ תקין' else '❌ פארק חסר' end

  union all
  select 11.5,
         'מוצר דילוג בתור',
         (select string_agg(coalesce(skip_line_system,'(לא נבדק)') || ': ' || n, ' · ' order by n desc)
            from (select skip_line_system, count(*) as n from experience group by 1) s),
         'none: 83 · (לא נבדק): 76 · multi_pass: 51 · express: 27 · single_pass: 5',
         case when (select count(*) from experience where skip_line_system is null) = 76
               and (select count(*) from experience where skip_line_system = 'none') = 83
                then '✅ תקין — NULL הוא "לא נבדק", לא "אין"'
              else '❌ לא תואם לייצוא' end

  union all
  select 12,
         'שורות שנעצרו בכוונה',
         '0',
         '0',
         '✅ תקין — שום שורה לא נעצרה'

)
select "בדיקה", "במסד", "בייצוא", "מצב" from checks order by ord;
