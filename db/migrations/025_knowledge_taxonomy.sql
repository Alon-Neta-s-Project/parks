-- 025_knowledge_taxonomy.sql
-- ארבעת שדות הטקסונומיה של מסמכי הידע, ו-source_url כרשימה.
--
-- 53 המסמכים נושאים 12 שדות ב-frontmatter. שמונה מהם יש להם בית ב-003;
-- לארבעה אין: product_family · audience · v1_priority · purchase_type.
--
-- ⚠️ ולמה זה לא קוסמטי (פולה): **שדה שמסננים עליו וחסר בו ערך אינו חוסר
-- מידע אלא הדרה שקטה.** 14 מסמכים היו חסרים audience, והם דמויות, גשם,
-- עגלות והחלפת הורים — כלומר בדיוק מה שמשפחה שואלת. שליפה שמסננת על
-- audience הייתה מחזירה אותם כלא-קיימים, בלי שגיאה.
--
-- ⚠️ purchase_type מקבל 'N/A' כערך מפורש, ולא NULL. שלושת המצבים באותה
-- שכבה: ריק = לא בדקנו · N/A = השאלה לא קיימת (לעגלות ולגשם אין סוג
-- רכישה) · כל השאר = תשובה. שאילתה שמסננת על purchase_type חייבת להחליט
-- ביודעין אם N/A נכנס — ואם היא מתעלמת, השורות האלה נעלמות.
--
-- ⚠️ source_url הופך למערך, ולא לעמודה שנייה. source_url_2 בוטל בכוונה
-- (פולה): הוא נשבר ברגע שיש מקור שלישי, ו-source_url_3 אינו פתרון.
-- שבעה מסמכים נושאים היום שני קישורים, והשאר אחד — מערך גדל בלי לשנות
-- סכמה. **גם כשיש בו איבר אחד הוא מערך**, כי שתי צורות לאותו דבר הן שני
-- מקורות אמת.

BEGIN;

set local search_path = public, extensions;

-- ── ארבעת שדות הטקסונומיה ────────────────────────────────────────────
-- nullable ובלי ברירת מחדל, כמו 019. NOT NULL DEFAULT על שדה שמגיע
-- מאיסוף חיצוני הוא הצהרה שאיש לא בדק.
alter table knowledge_doc add column if not exists product_family text
  check (product_family in (
    'queue_access', 'admission', 'park_hopping', 'hotel_benefit',
    'eligibility_program', 'event_ticket',
    'characters', 'guest_services', 'photo', 'weather', 'park_logistics'));

alter table knowledge_doc add column if not exists audience text
  check (audience in (
    'international_guest', 'hotel_guest', 'annual_passholder',
    'florida_resident', 'military'));

alter table knowledge_doc add column if not exists v1_priority text
  check (v1_priority in ('core', 'appendix'));

alter table knowledge_doc add column if not exists purchase_type text
  check (purchase_type in (
    'ticket', 'paid_addon', 'included_benefit', 'reservation_mechanism', 'N/A'));

-- ── source_url כרשימה ────────────────────────────────────────────────
alter table knowledge_doc add column if not exists source_urls text[];

-- ⚠️ ההעברה עטופה בבדיקת קיום, כי המיגרציה מוחקת בהמשך את העמודה
-- שהיא קוראת ממנה — והרצה שנייה הייתה נופלת על "source_url does not
-- exist". מיגרציה שנשברת כשמריצים אותה פעמיים היא מלכודת, כי הרצה
-- כפולה בטעות היא בדיוק מה שקורה כשלא בטוחים אם הראשונה עברה.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'knowledge_doc'
                and column_name = 'source_url') then
    update knowledge_doc
       set source_urls = array[source_url]
     where source_urls is null and source_url is not null;
  end if;
end
$$;

-- העמודה הישנה יורדת. עמודה שמחזיקה את האיבר הראשון של מערך שקיים
-- לידה היא מקור אמת שני, והוא מתפצל בשקט ברגע שמישהו מעדכן רק אחד מהם.
alter table knowledge_doc drop column if exists source_url;

comment on column knowledge_doc.source_urls is
  'רשימת המקורות הרשמיים, גם כשיש אחד. ⚠️ אינה מוצגת בממשק — טים מדווח ערך ולעולם אינו מייחס אותו למקור.';
comment on column knowledge_doc.purchase_type is
  'ticket/paid_addon/included_benefit/reservation_mechanism/N/A. ⚠️ N/A הוא ערך ולא היעדרו: ריק = לא נבדק, N/A = השאלה לא קיימת. סינון שמתעלם מ-N/A מוחק את מסמכי העגלות והגשם.';
comment on column knowledge_doc.audience is
  'הקהל שהמסמך מדבר אליו. ⚠️ חסר כאן אינו חוסר מידע אלא הדרה שקטה מהשליפה.';

-- ── "טרם חושב" הוא מצב, וצריך שאפשר יהיה לייצג אותו ─────────────────
--
-- ⚠️ embedding_model היה not null, ו-embedding היה nullable. כלומר קטע
-- שטרם חושב לו וקטור **לא יכול להיכנס לטבלה** — הטעינה נעצרת עליו. וזה
-- לא תקלה בסקריפט אלא חוסר מצב בסכמה: "נטען וטרם חושב" הוא שלב אמיתי
-- בחיים של כל קטע, והוא לא היה ניתן לביטוי.
--
-- הפתרון אינו למלא את שם המודל מראש. שם מודל שנכתב לפני שחושב משהו הוא
-- הצהרה שאיש לא בדק — אותה תבנית שנתפסה כאן שמונה פעמים.
--
-- ⚠️ במקום זה: שניהם nullable, **וחייבים להיות ריקים או מלאים יחד.**
-- הכלל ש-003 בא לאכוף — "אסור לערבב מודלים באותו אינדקס, שאילתה במודל
-- אחד מול מסמכים באחר מחזירה רעש בלי שום שגיאה" — נשמר בדיוק: המצב
-- המסוכן הוא וקטור בלי שם מודל, וזה בדיוק מה שנחסם.
alter table knowledge_chunk alter column embedding_model drop not null;

alter table knowledge_chunk drop constraint if exists knowledge_chunk_model_with_embedding;
alter table knowledge_chunk add constraint knowledge_chunk_model_with_embedding
  check ((embedding is null) = (embedding_model is null));

comment on column knowledge_chunk.embedding_model is
  'שם המודל שחישב את הווקטור. ⚠️ ריק אך ורק כשהווקטור ריק — נאכף ב-check. וקטור בלי שם מודל הוא רעש שאין דרך לזהות.';

-- ── אינדקס לסינון על הטקסונומיה ──────────────────────────────────────
create index if not exists knowledge_doc_taxonomy_idx
  on knowledge_doc (v1_priority, product_family, audience);

-- ⚠️ אינדקס חלקי על מה שטרם חושב. פונקציית החישוב שואלת בדיוק את זה
-- בכל סבב, והיא תרוץ שוב בכל פעם שייכנסו מסמכים חדשים.
create index if not exists knowledge_chunk_pending_idx
  on knowledge_chunk (doc_id) where embedding is null;

COMMIT;
