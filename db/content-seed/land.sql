-- ==========================================================================
-- Park Day Companion — אזורים בפארקים (81 שורות)
-- ==========================================================================
--
-- ⚠️ להריץ **לפני** קובצי התוכן. experience.land_id הוא מפתח זר לטבלה
--    הזו, ובלעדיה כל שורות המתקנים נדחות.
--
-- נוצר על ידי scripts/build-content-seed.py. אין לערוך ביד.
--
-- המזהה נגזר מהפארק ומשם האזור, ולכן הוא זהה כאן ובשורות המתקנים בלי
-- טבלת תרגום ובלי סיכון שהשניים ייפרדו.
--
-- zone ו-sort_order אינם נכתבים: הייצוא אינו נושא אותם. sort_order נשאר
-- בברירת המחדל 0, כלומר "בלי סדר", ולא כהצהרה על סדר.
-- ==========================================================================

BEGIN;

set local search_path = public, extensions;

insert into land (id, park_id, name, name_i18n)
values
('ak-africa', 'ak', 'Africa', '{}'::jsonb),
('ak-africa-rafiki-s-planet-watch', 'ak', 'Africa / Rafiki''s Planet Watch', '{}'::jsonb),
('ak-asia', 'ak', 'Asia', '{}'::jsonb),
('ak-discovery-island', 'ak', 'Discovery Island', '{}'::jsonb),
('ak-n-a', 'ak', 'N/A', '{}'::jsonb),
('ak-oasis', 'ak', 'Oasis', '{}'::jsonb),
('ak-pandora-the-world-of-avatar', 'ak', 'Pandora – The World of Avatar', '{}'::jsonb),
('ak-park-wide', 'ak', 'Park-wide', '{}'::jsonb),
('ak-rafiki-s-planet-watch', 'ak', 'Rafiki''s Planet Watch', '{}'::jsonb),
('ak-rafiki-s-planet-watch-conservation-station', 'ak', 'Rafiki''s Planet Watch / Conservation Station', '{}'::jsonb),
('ak-theater-in-the-wild', 'ak', 'Theater in the Wild', '{}'::jsonb),
('ak-tree-of-life-theater', 'ak', 'Tree of Life Theater', '{}'::jsonb),
('bb-melt-away-bay', 'bb', 'Melt-Away Bay', '{}'::jsonb),
('bb-mount-gushmore', 'bb', 'Mount Gushmore', '{}'::jsonb),
('bb-park-wide', 'bb', 'Park-wide', '{}'::jsonb),
('bb-ski-patrol-training-camp', 'bb', 'Ski Patrol Training Camp', '{}'::jsonb),
('bb-tike-s-peak', 'bb', 'Tike''s Peak', '{}'::jsonb),
('epcot-n-a', 'epcot', 'N/A', '{}'::jsonb),
('epcot-world-celebration', 'epcot', 'World Celebration', '{}'::jsonb),
('epcot-world-discovery', 'epcot', 'World Discovery', '{}'::jsonb),
('epcot-world-nature', 'epcot', 'World Nature', '{}'::jsonb),
('epcot-world-showcase-lagoon', 'epcot', 'World Showcase Lagoon', '{}'::jsonb),
('epcot-world-showcase-american-adventure', 'epcot', 'World Showcase – American Adventure', '{}'::jsonb),
('epcot-world-showcase-canada', 'epcot', 'World Showcase – Canada', '{}'::jsonb),
('epcot-world-showcase-france', 'epcot', 'World Showcase – France', '{}'::jsonb),
('epcot-world-showcase-japan', 'epcot', 'World Showcase – Japan', '{}'::jsonb),
('epcot-world-showcase-mexico', 'epcot', 'World Showcase – Mexico', '{}'::jsonb),
('epcot-world-showcase-norway', 'epcot', 'World Showcase – Norway', '{}'::jsonb),
('epcot-world-showcase-united-kingdom', 'epcot', 'World Showcase – United Kingdom', '{}'::jsonb),
('epic-celestial-park', 'epic', 'Celestial Park', '{}'::jsonb),
('epic-dark-universe', 'epic', 'Dark Universe', '{}'::jsonb),
('epic-how-to-train-your-dragon-isle-of-berk', 'epic', 'How to Train Your Dragon – Isle of Berk', '{}'::jsonb),
('epic-super-nintendo-world', 'epic', 'SUPER NINTENDO WORLD', '{}'::jsonb),
('epic-super-nintendo-world-donkey-kong-country', 'epic', 'SUPER NINTENDO WORLD – Donkey Kong Country', '{}'::jsonb),
('epic-the-wizarding-world-of-harry-potter-ministry-of-magic', 'epic', 'The Wizarding World of Harry Potter – Ministry of Magic', '{}'::jsonb),
('hs-animation-courtyard', 'hs', 'Animation Courtyard', '{}'::jsonb),
('hs-chinese-theatre', 'hs', 'Chinese Theatre', '{}'::jsonb),
('hs-echo-lake', 'hs', 'Echo Lake', '{}'::jsonb),
('hs-hollywood-boulevard', 'hs', 'Hollywood Boulevard', '{}'::jsonb),
('hs-n-a', 'hs', 'N/A', '{}'::jsonb),
('hs-star-wars-galaxy-s-edge', 'hs', 'Star Wars: Galaxy''s Edge', '{}'::jsonb),
('hs-sunset-boulevard', 'hs', 'Sunset Boulevard', '{}'::jsonb),
('hs-toy-story-land', 'hs', 'Toy Story Land', '{}'::jsonb),
('ioa-hogsmeade', 'ioa', 'Hogsmeade', '{}'::jsonb),
('ioa-jurassic-park', 'ioa', 'Jurassic Park', '{}'::jsonb),
('ioa-marvel-super-hero-island', 'ioa', 'Marvel Super Hero Island', '{}'::jsonb),
('ioa-seuss-landing', 'ioa', 'Seuss Landing', '{}'::jsonb),
('ioa-skull-island', 'ioa', 'Skull Island', '{}'::jsonb),
('ioa-the-wizarding-world-of-harry-potter-hogsmeade', 'ioa', 'The Wizarding World of Harry Potter – Hogsmeade', '{}'::jsonb),
('ioa-toon-lagoon', 'ioa', 'Toon Lagoon', '{}'::jsonb),
('mk-adventureland', 'mk', 'Adventureland', '{}'::jsonb),
('mk-cinderella-castle', 'mk', 'Cinderella Castle', '{}'::jsonb),
('mk-fantasyland', 'mk', 'Fantasyland', '{}'::jsonb),
('mk-fantasyland-storybook-circus', 'mk', 'Fantasyland / Storybook Circus', '{}'::jsonb),
('mk-frontierland', 'mk', 'Frontierland', '{}'::jsonb),
('mk-liberty-square', 'mk', 'Liberty Square', '{}'::jsonb),
('mk-main-street-u-s-a', 'mk', 'Main Street, U.S.A.', '{}'::jsonb),
('mk-parade-route', 'mk', 'Parade Route', '{}'::jsonb),
('mk-tomorrowland', 'mk', 'Tomorrowland', '{}'::jsonb),
('tl-hideaway-bay', 'tl', 'Hideaway Bay', '{}'::jsonb),
('tl-ketchakiddee-creek', 'tl', 'Ketchakiddee Creek', '{}'::jsonb),
('tl-mount-mayday', 'tl', 'Mount Mayday', '{}'::jsonb),
('tl-park-wide', 'tl', 'Park-wide', '{}'::jsonb),
('tl-surf-pool', 'tl', 'Surf Pool', '{}'::jsonb),
('tl-typhoon-lagoon', 'tl', 'Typhoon Lagoon', '{}'::jsonb),
('us-diagon-alley', 'us', 'Diagon Alley', '{}'::jsonb),
('us-dreamworks-land', 'us', 'DreamWorks Land', '{}'::jsonb),
('us-hollywood', 'us', 'Hollywood', '{}'::jsonb),
('us-illumination-s-minion-land', 'us', 'Illumination''s Minion Land', '{}'::jsonb),
('us-new-york', 'us', 'New York', '{}'::jsonb),
('us-new-york-production-central', 'us', 'New York / Production Central', '{}'::jsonb),
('us-park-wide-parade-route', 'us', 'Park-wide parade route', '{}'::jsonb),
('us-san-francisco', 'us', 'San Francisco', '{}'::jsonb),
('us-springfield-u-s-a', 'us', 'Springfield, U.S.A.', '{}'::jsonb),
('us-the-wizarding-world-of-harry-potter-diagon-alley', 'us', 'The Wizarding World of Harry Potter – Diagon Alley', '{}'::jsonb),
('us-universal-studios-lagoon', 'us', 'Universal Studios Lagoon', '{}'::jsonb),
('us-world-expo', 'us', 'World Expo', '{}'::jsonb),
('vb-krakatau', 'vb', 'Krakatau', '{}'::jsonb),
('vb-rainforest-village', 'vb', 'Rainforest Village', '{}'::jsonb),
('vb-river-village', 'vb', 'River Village', '{}'::jsonb),
('vb-wave-village', 'vb', 'Wave Village', '{}'::jsonb)
on conflict (id) do update set
  park_id = excluded.park_id,
  name = excluded.name;

COMMIT;
