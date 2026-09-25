-- 009_plan_item_interest.sql
-- כן / לא / אולי — כוונת המשתמש לגבי מתקן.
--
-- נפרד מ-status בכוונה. status הוא מחזור חיים (wishlist→planned→done),
-- ו-interest הוא כוונה. "לא" הוא לא היעדר "כן": דחייה מפורשת היא מידע
-- שמנוע המסלול חייב לכבד, אחרת הוא יציע שוב את מה שכבר נדחה.

BEGIN;

-- ההרחבות יושבות בסכמת extensions (ראה 001). הקובץ הזה משתמש בשמות
-- לא-מוסמכים מתוכן, ולכן הוא קובע search_path בעצמו — כדי שיוכל לרוץ
-- לבד, בסשן נפרד, ולא רק כחלק מ-supabase-bundle.sql.
set local search_path = public, extensions;

alter table plan_item
  add column interest text check (interest in ('yes','maybe','no'));

comment on column plan_item.interest is
  'כוונת המשתמש מהגיליון. NULL = טרם סומן. no = נדחה מפורשות, לעולם לא יוצע במסלול.';

-- עוגן זמן: הזמנת דילוג-תור שהמשתמש הזין ידנית. אין אינטגרציה עם
-- אפליקציות הפארקים, ולכן זהו קלט ידני שהמנוע מתייחס אליו כאילוץ קשיח.
alter table plan_item
  add column anchor_time time;

comment on column plan_item.anchor_time is
  'שעת הזמנה שהמשתמש הזין (Lightning Lane / Express). אילוץ קשיח למנוע המסלול.';

create index plan_item_interest_idx on plan_item (trip_id, interest);

COMMIT;

-- <migration-log>
-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.
-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.
select public.record_migration('009_plan_item_interest.sql', 'sha256:5f6beab9801549e1a1b6edce10191fc4',
  coalesce(current_setting('app.migration_source', true), 'sql-editor'));
-- </migration-log>
