-- ── 034 · אוצר מילים אחד לרגישויות, ו"לא נשאל" שאינו "אין" ──────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
--
-- ⚠️ שני פערים, ושניהם עוד לא הזיקו רק מפני שהאפליקציה אינה כותבת
-- ל-trip_member היום — הפרופיל חי בדפדפן. ברגע שמסך ההרשמה ייכנס
-- והפרופיל יישמר, שניהם מתחילים לעבוד.
--
-- ── הפער הראשון: שני אוצרות מילים ──────────────────────────────────
--
-- מיגרציה 010 תיעדה בהערה:
--     motion_sickness · fear_dark · fear_heights · claustrophobia
--
-- והקוד ב-src/lib/sensitivity.ts, שנבנה מול העמודות שקיימות בפועל
-- בטבלת experience, מכיר:
--     dark · loudSudden · strobe · heights · motionSickness ·
--     accessibility · longQueues
--
-- אין ביניהם התאמה. ל-010 יש claustrophobia שאין לו עמודה בכלל, ולקוד
-- יש ארבעה שאין ב-010. שני מקורות אמת לאותו דבר, וזה בדיוק מה שמייצר
-- ערך שנכתב ואינו נקרא — או גרוע ממנו, ערך שנקרא ואינו מסנן.
--
-- ⚠️ **המחרוזות כאן זהות לאלה שבקוד, אות באות, ובכוונה.** הן מזהי
-- אפליקציה ולא שמות עמודות, וכל תרגום ביניהן — snake_case מול
-- camelCase — היה קוד שיכול להיסחף. בדיקה ברפו קוראת את הרשימה מכאן
-- ומשווה אותה למערך ב-TypeScript, כדי שסחיפה בכל אחד מהכיוונים תיפול.
--
-- ── הפער השני: NOT NULL DEFAULT '{}' ───────────────────────────────
--
-- 🔴 זו התבנית שנתפסה בפרויקט הזה תשע פעמים. מערך ריק אינו "אין
-- רגישויות" — הוא "לא נשאל", ושני אלה מובילים להתנהגות שונה: על שאלה
-- שדולגה שואלים פעם נוספת אחת (כלל הברזל החמישי), ועל שאלה שנענתה
-- בשלילה לא חוזרים לעולם.
--
-- בממשק ההבחנה כבר קיימת — יש תשובה מפורשת "אין רגישויות מיוחדות".
-- העמודה הייתה מוחקת אותה בכניסה.
--
--   NULL  — לא נשאל / לא נענה
--   '{}'  — נשאל, ואין רגישויות
--   {...} — נשאל, ואלה הן

BEGIN;

set local search_path = public, extensions;

-- ⚠️ סדר הפעולות חשוב. הסרת ה-DEFAULT לפני הסרת ה-NOT NULL תשאיר
-- שורות קיימות עם '{}' — שהוא ערך תקין, רק שמשמעותו השתנתה. אין
-- שורות בייצור היום, אבל הסדר נכתב כך שהוא יהיה נכון גם כשיהיו.
alter table trip_member alter column sensitivities drop default;
alter table trip_member alter column sensitivities drop not null;

alter table trip_member drop constraint if exists trip_member_sensitivities_vocab;
alter table trip_member add constraint trip_member_sensitivities_vocab
  check (
    sensitivities is null
    or sensitivities <@ array[
         'dark',
         'loudSudden',
         'strobe',
         'heights',
         'motionSickness',
         'accessibility',
         'longQueues'
       ]::text[]
  );

comment on column trip_member.sensitivities is
  'NULL = לא נשאל · {} = נשאל ואין · אחרת הרשימה. אוצר המילים נעול ב-CHECK ומשווה ל-src/lib/sensitivity.ts.';

-- ── והכלל שאין לו CHECK, ולכן הוא נכתב כאן ──────────────────────────
--
-- ⚠️ trip_member היא **אנונימית לצמיתות**. אין בה שם ואין תאריך לידה,
-- ויש בה גיל כמספר וגובה רק מתחת לגיל 14.
--
-- 🔴 וזה עומד להיבחן. אם המוצר יהפוך לסוכן נסיעות מורשה, יידרש שם מלא
-- ותאריך לידה — כרטיס נושא שם. הפיתוי יהיה להוסיף את העמודות כאן.
--
-- אסור. ברגע שהן באותה שורה, ההבטחה "איננו יודעים מי הילד הזה" מתה
-- לגבי **כל** מי שנרשם — כולל מי שרק תכנן יום ולא הזמין דבר. זהות
-- להזמנה שייכת לטבלה נפרדת, שטים אינו קורא ממנה לעולם.
--
-- הפירוט ב-docs/commercial-foundations.md. בדיקה ברפו נכשלת אם עמודה
-- כזו נוספת.
comment on table trip_member is
  'חבר אחד בקבוצה. אנונימי לצמיתות: בלי שם ובלי תאריך לידה. זהות להזמנה — טבלה נפרדת. ראה docs/commercial-foundations.md.';

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק התנהגות ולא קיום. אילוץ שקיים ואינו תופס נראה זהה לאילוץ
-- שעובד, וזו ההבחנה שהפרויקט הזה נכשל עליה שוב ושוב.

BEGIN;

set local search_path = public, extensions;

-- ⚠️ הבדיקה רצה על **עותק** של הטבלה, ולא עליה עצמה. trip_member
-- תלויה ב-trip שתלויה במשתמש אמיתי, ומיגרציה אינה יכולה לייצר כזה —
-- וגם אין משתמשים בייצור היום. `LIKE ... INCLUDING CONSTRAINTS` מעתיק
-- את אילוצי ה-CHECK בלי המפתחות הזרים, ולכן זו אותה בדיקה בדיוק על
-- אותו אילוץ, בלי להמציא נתונים.

create temp table sens_probe (like trip_member including constraints including defaults)
  on commit drop;

do $$
declare
  rejected boolean;
begin
  -- א. ערך שאינו באוצר המילים חייב להידחות
  begin
    insert into sens_probe (trip_id, member_key, role, age, sensitivities)
    values (gen_random_uuid(), 'p1', 'adult', 30, array['fear_dark']);
    rejected := false;
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception '❌ אוצר המילים אינו נאכף — fear_dark התקבל.';
  end if;

  -- ב. NULL מתקבל, והוא "לא נשאל"
  insert into sens_probe (trip_id, member_key, role, age, sensitivities)
  values (gen_random_uuid(), 'p2', 'adult', 30, null);

  -- ג. מערך ריק מתקבל, והוא "נשאל ואין"
  insert into sens_probe (trip_id, member_key, role, age, sensitivities)
  values (gen_random_uuid(), 'p3', 'adult', 30, array[]::text[]);

  -- ד. ערכים תקינים מתקבלים
  insert into sens_probe (trip_id, member_key, role, age, sensitivities)
  values (gen_random_uuid(), 'p4', 'adult', 30, array['loudSudden','heights']);

  -- ה. ⚠️ וההבחנה עצמה: NULL אינו מערך ריק
  if (select count(*) from sens_probe where sensitivities is null) <> 1
     or (select count(*) from sens_probe where sensitivities = array[]::text[]) <> 1 then
    raise exception '❌ NULL ומערך ריק אינם נבדלים.';
  end if;

  raise notice '✅ תקין — אוצר המילים נאכף, ו-NULL נבדל ממערך ריק.';
end $$;

COMMIT;

select '✅ 034 הותקנה' as "מצב";
