-- 003_knowledge.sql
-- מאגר הידע הלא-מובנה: מה שנשלף ב-RAG.
--
-- שים לב להפרדה: עובדות קשות יושבות ב-experience ונשלפות דרך כלים.
-- כאן יושב רק מה שהוא פרוזה — דעה, טיפים, מדריכים, תוכן קהילתי.
-- ערבוב השניים הוא בדיוק הטעות שהארכיטקטורה נועדה למנוע.

-- ממד ה-embedding נגזר מהמודל. 1024 = Cohere embed-multilingual-v3.0.
-- שינוי מודל בעל ממד אחר מחייב מיגרציה — להכריע לפני שנבנים על זה.
BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

create table knowledge_doc (
  id            text primary key,               -- מזהה יציב מה-frontmatter. ingest אידמפוטנטי לפיו.
  title         text not null,
  doc_type      text not null check (doc_type in
                  ('guide','attraction_note','faq','policy','tip','community_qa')),
  authority_tier authority_tier not null,
  locale        locale_code not null default 'he',

  scope_resort  text references resort(id) on delete set null,
  scope_park    text references park(id) on delete set null,
  scope_experience text references experience(id) on delete set null,

  source_url    text,
  source_kind   source_type,
  volatility    volatility_tier not null default 'static',
  last_verified date,
  last_seen     date,                            -- לתפוגה של טיפים קהילתיים

  -- תוכן קהילתי אינו נכנס לאינדקס לפני אישור אדמין. אף פעם.
  review_status text not null default 'draft' check (review_status in
                  ('draft','pending_review','approved','rejected')),
  reviewed_by   uuid,
  reviewed_at   timestamptz,

  corroboration_count int not null default 1,    -- בכמה מקורות בלתי-תלויים חזר הטיפ
  submitted_by  uuid,

  body          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index knowledge_doc_status_idx on knowledge_doc (review_status, authority_tier);
create index knowledge_doc_scope_idx  on knowledge_doc (scope_park, scope_experience);

create table knowledge_chunk (
  id             uuid primary key default gen_random_uuid(),
  doc_id         text not null references knowledge_doc(id) on delete cascade,
  chunk_index    int not null,
  content        text not null,

  -- משוכפל מה-doc בכוונה: השליפה מסננת על השדות האלה, ו-join לכל שאילתה
  -- על טבלה קטנה הוא בזבוז. ingest אחראי לעקביות.
  authority_tier authority_tier not null,
  locale         locale_code not null,
  scope_park     text,
  scope_experience text,
  review_status  text not null,

  embedding      vector(1024),
  embedding_model text not null,   -- אסור לערבב מודלים באותו אינדקס. שאילתה במודל
                                   -- אחד מול מסמכים באחר מחזירה רעש בלי שום שגיאה.
  created_at     timestamptz not null default now(),
  unique (doc_id, chunk_index)
);

-- אין אינדקס ANN בכוונה. מתחת ל-10,000 שורות סריקה מדויקת מהירה יותר מ-HNSW
-- וגם לא מאבדת recall. להוסיף רק כשהקורפוס גדל — ראה נספח 6א במסמך השליפה.
create index knowledge_chunk_filter_idx on knowledge_chunk
  (review_status, authority_tier, locale, scope_park);
create index knowledge_chunk_exp_idx on knowledge_chunk (scope_experience);

-- תור אימות האדמין: אדם מאשר, לא רובוט מעדכן.
create view verification_queue as
  select 'experience' as kind, e.id, e.name as title,
         e.volatility, e.last_verified,
         current_date - e.last_verified as days_since
    from experience e
   where e.last_verified is null
      or (e.volatility = 'seasonal' and e.last_verified < current_date - interval '90 days')
      or (e.volatility = 'static'   and e.last_verified < current_date - interval '365 days')
  union all
  select 'knowledge', d.id, d.title, d.volatility, d.last_verified,
         current_date - d.last_verified
    from knowledge_doc d
   where d.review_status = 'approved'
     and (d.last_verified is null
       or (d.volatility = 'seasonal' and d.last_verified < current_date - interval '90 days')
       or (d.volatility = 'static'   and d.last_verified < current_date - interval '365 days'));

COMMIT;
