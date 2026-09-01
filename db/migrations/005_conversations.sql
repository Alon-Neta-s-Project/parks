-- 005_conversations.sql
-- שיחות טים + יומן השאלות שלא נענו.
--
-- היומן אינו לוג תפעולי — הוא מכשיר מדידה. רשימת השאלות שטים לא ידע
-- לענות עליהן היא מפת הדרכים של התוכן הבא, והיא רצה 24/7 על משתמשים
-- אמיתיים בזמן שהם באמת מתכננים.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

create table conversation (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profile(id) on delete cascade,
  trip_id    uuid references trip(id) on delete set null,
  title      text,
  summary    text,                    -- סיכום מתגלגל. שדה טקסט, לא נשלף וקטורית.
  locale     locale_code not null default 'he',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversation_user_idx on conversation (user_id, updated_at desc);

create table message (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversation(id) on delete cascade,
  role            text not null check (role in ('user','assistant','tool','system')),
  content         text,
  tool_calls      jsonb,     -- מה נקרא ועם אילו פרמטרים. עליו רצות בדיקות סט הזהב.
  citations       jsonb,     -- [{chunk_id|experience_id, tier, source_url}]
  -- טים מסמן בעצמו כשלא ידע לענות. זה מה שמזין את היומן.
  answered        boolean,
  refusal_reason  text check (refusal_reason in
                    ('no_data','unverified','safety_official_only','out_of_scope')),
  proactive       boolean not null default false,  -- שכבת "כדאי שתדע"
  model           text,
  input_tokens    int,
  output_tokens   int,
  created_at      timestamptz not null default now()
);
create index message_conv_idx on message (conversation_id, created_at);
create index message_unanswered_idx on message (created_at desc)
  where answered = false;

-- שאלות שטים לא ידע לענות עליהן, מוכנות להפוך לתוכן או למקרה בסט הזהב.
create view unanswered_questions as
  select m.id            as message_id,
         m.conversation_id,
         m.refusal_reason,
         m.created_at,
         (select prev.content
            from message prev
           where prev.conversation_id = m.conversation_id
             and prev.role = 'user'
             and prev.created_at < m.created_at
           order by prev.created_at desc
           limit 1) as question
    from message m
   where m.role = 'assistant'
     and m.answered = false;

COMMIT;
