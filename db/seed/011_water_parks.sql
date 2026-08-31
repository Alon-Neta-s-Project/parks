-- 011_water_parks.sql — שלושת פארקי המים, שנשמטו מה-seed הראשון.
-- אידמפוטנטי.
BEGIN;

insert into park (id, resort_id, name, short_name, name_i18n, park_kind, status, sort_order)
values
  ('bb',  'wdw','Disney''s Blizzard Beach Water Park','Blizzard Beach','{"he":"בליזרד ביץ׳"}','water','open', 8),
  ('tl',  'wdw','Disney''s Typhoon Lagoon Water Park','Typhoon Lagoon','{"he":"טייפון לגון"}','water','open', 9),
  ('vb',  'uor','Universal Volcano Bay',              'Volcano Bay',   '{"he":"וולקנו ביי"}',  'water','open',10)
on conflict (id) do update set
  resort_id = excluded.resort_id, name = excluded.name,
  short_name = excluded.short_name, name_i18n = excluded.name_i18n,
  park_kind = excluded.park_kind, sort_order = excluded.sort_order;

COMMIT;
