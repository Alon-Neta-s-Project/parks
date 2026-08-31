-- 010_reference.sql — נתוני ייחוס יציבים בלבד.
--
-- מה שכאן: יעד, שני ריזורטים, ושבעה פארקים. אלה עובדות מבניות שלא משתנות.
-- מה שאין כאן בכוונה: אזורים (lands) ומתקנים. זהו תוכן, וכלל העבודה
-- בפרויקט הוא שתוכן מגיע מנטע ומאומת מול המקורות הרשמיים — לא מהזיכרון
-- של מודל שפה. שתילת רשימת מתקנים "מהידע הכללי" הייתה מכניסה למסד
-- בדיוק את סוג המידע הלא-מאומת שהמוצר קיים כדי לפתור.
--
-- אידמפוטנטי: אפשר להריץ שוב בבטחה.

insert into destination (id, name, name_i18n, country_code, timezone, is_active, sort_order)
values ('orlando','Orlando','{"he":"אורלנדו"}','US','America/New_York',true,1)
on conflict (id) do update set
  name = excluded.name, name_i18n = excluded.name_i18n, is_active = excluded.is_active;

insert into resort (id, destination_id, operator, name, name_i18n, skip_line_system, sort_order)
values
  ('wdw','orlando','disney','Walt Disney World Resort','{"he":"וולט דיסני וורלד"}','lightning_lane',1),
  ('uor','orlando','universal','Universal Orlando Resort','{"he":"יוניברסל אורלנדו"}','express_pass',2)
on conflict (id) do update set
  name = excluded.name, name_i18n = excluded.name_i18n,
  skip_line_system = excluded.skip_line_system;

insert into park (id, resort_id, name, short_name, name_i18n, park_kind, status, sort_order)
values
  ('mk',    'wdw','Magic Kingdom Park',            'Magic Kingdom',   '{"he":"מג''יק קינגדום"}',        'theme','open', 1),
  ('epcot', 'wdw','EPCOT',                         'EPCOT',           '{"he":"אפקוט"}',                 'theme','open', 2),
  ('hs',    'wdw','Disney''s Hollywood Studios',   'Hollywood Studios','{"he":"הוליווד סטודיוס"}',      'theme','open', 3),
  ('ak',    'wdw','Disney''s Animal Kingdom Theme Park','Animal Kingdom','{"he":"אנימל קינגדום"}',      'theme','open', 4),
  ('us',    'uor','Universal Studios Florida',     'Universal Studios','{"he":"יוניברסל סטודיוס"}',     'theme','open', 5),
  ('ioa',   'uor','Universal Islands of Adventure','Islands of Adventure','{"he":"איילנדס אוף אדוונצ''ר"}','theme','open',6),
  ('epic',  'uor','Universal Epic Universe',       'Epic Universe',   '{"he":"אפיק יוניברס"}',          'theme','open', 7)
on conflict (id) do update set
  resort_id = excluded.resort_id, name = excluded.name,
  short_name = excluded.short_name, name_i18n = excluded.name_i18n,
  park_kind = excluded.park_kind, sort_order = excluded.sort_order;
