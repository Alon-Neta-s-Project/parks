-- ── 033 · וקטור שלא מתאים לטקסט שלו ──────────────────────────────────
--
-- להריץ ב: **סופהבייס → SQL Editor → קוורי חדש**. פעם אחת.
--
-- ⚠️ הבעיה שזה סוגר, ובלשון פשוטה:
--
-- לכל קטע ידע יש טקסט, ולצידו וקטור — רשימת מספרים שמתארת את
-- **המשמעות** של הטקסט. השליפה של טים אינה מחפשת מילים; היא מחפשת
-- וקטור קרוב. כלומר הווקטור הוא מה שקובע מתי הקטע נשלף, והטקסט הוא
-- מה שנקרא כשהוא נשלף.
--
-- ולכן: אם מישהו מתקן את הטקסט ולא מוחק את הווקטור, הקטע ממשיך
-- להישלף **לפי המשמעות הישנה** ולהיקרא לפי הטקסט החדש. שני הצדדים
-- נראים תקינים בנפרד. אין שגיאה, אין אזהרה, ואף בדיקת ספירה לא
-- תתפוס את זה — מספר הקטעים לא השתנה.
--
-- זו בדיוק התבנית שנתפסה כאן שבע פעמים, בפעם השמינית: שדה שנראה
-- כאילו יש בו ערך תקף. הפעם הערך תקף — הוא פשוט של טקסט אחר.
--
-- ⚠️ הצינור הרגיל אינו חשוף לזה. build-knowledge-seed.py מוחק את כל
-- הקטעים וכותב אותם מחדש, ולכן הווקטור נולד NULL ומחושב מאפס. החשיפה
-- היא ל-UPDATE ידני בעורך ה-SQL — וזה בדיוק מה שעומד לקרות כשפולה
-- מתקנת ניסוח על שורה בודדת.
--
-- מה שזה עושה: מאפס את הווקטור בכל פעם שהטקסט משתנה. הקטע יוצא
-- מהשליפה עד שהוא מחושב מחדש — כלומר הכשל הופך מ"תשובה שגויה בשקט"
-- ל"הקטע חסר", וזו נפילה שרואים.

-- ⚠️ BEGIN מפורש, ולא רק `set local`. מחוץ לטרנזקציה `set local` אינו
-- עושה דבר — והטיפוס vector יושב ב-extensions ולא ב-public, ולכן בלוק
-- האימות היה נופל על "type vector does not exist" בסופהבייס. זו אותה
-- נפילת search_path שכבר תפסה אותי כאן, וזה הדפוס שכל שאר המיגרציות
-- כבר משתמשים בו.
BEGIN;

set local search_path = public, extensions;

create or replace function knowledge_chunk_content_changed()
returns trigger
language plpgsql
as $$
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

comment on function knowledge_chunk_content_changed() is
  'מאפס את הווקטור כשהטקסט משתנה. וקטור שאינו תואם לטקסט שלו שולף את הקטע לפי המשמעות הישנה, בלי שום שגיאה.';

drop trigger if exists knowledge_chunk_content_changed on knowledge_chunk;

create trigger knowledge_chunk_content_changed
  before update on knowledge_chunk
  for each row
  execute function knowledge_chunk_content_changed();

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
-- ⚠️ בודק את ההתנהגות ולא את קיום הטריגר. טריגר שקיים ואינו יורה נראה
-- זהה לטריגר שעובד, וזו בדיוק הבחנה שהפרויקט הזה נכשל עליה.

BEGIN;

set local search_path = public, extensions;

do $$
declare
  probe_doc  text;
  probe_id   uuid;
  after_edit boolean;
  dim        int;
begin
  -- ⚠️ המימד נקרא מהעמודה ולא נכתב כמספר. הוא כבר השתנה פעם אחת
  -- (1024 → 1536, מיגרציה 024), ומספר קשיח כאן היה נשבר בשקט בפעם
  -- הבאה — הבדיקה הייתה נכשלת על המימד ולא על מה שהיא באה לבדוק.
  select atttypmod into dim
    from pg_attribute
   where attrelid = 'knowledge_chunk'::regclass
     and attname  = 'embedding';
  select id into probe_doc from knowledge_doc limit 1;
  if probe_doc is null then
    raise notice '⚠️ אין מסמכים — הטריגר הותקן אך לא נבדק. להריץ שוב אחרי טעינת הידע.';
    return;
  end if;

  insert into knowledge_chunk (doc_id, chunk_index, content, authority_tier, locale, review_status)
  values (probe_doc, -1, 'בדיקת טריגר — נמחקת מיד', 'T1', 'he', 'approved')
  returning id into probe_id;

  -- וקטור מלאכותי, כדי שיהיה מה לאפס. ⚠️ עם שם מודל, כי האילוץ דורש
  -- ששני השדות יהיו מלאים יחד.
  update knowledge_chunk
     set embedding = (
           select format('[%s]', string_agg('0.1', ','))::vector
             from generate_series(1, dim)
         ),
         embedding_model = 'probe-033'
   where id = probe_id;

  update knowledge_chunk set content = 'טקסט אחר לגמרי' where id = probe_id;

  select embedding is null into after_edit from knowledge_chunk where id = probe_id;

  delete from knowledge_chunk where id = probe_id;

  if after_edit then
    raise notice '✅ תקין — שינוי טקסט מאפס את הווקטור.';
  else
    raise exception '❌ הטריגר לא ירה. וקטור ישן שרד שינוי טקסט.';
  end if;
end $$;

COMMIT;

select '✅ 033 הותקנה' as "מצב";

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('033_embedding_follows_content.sql', 'sha256:9409c400147bf52bbecaf4e55965bb1f',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
