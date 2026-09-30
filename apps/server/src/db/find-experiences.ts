import type { ExperienceRow } from "../tim/lookup";
import type { Sql } from "./client";

/**
 * `find_experiences`, run from the server — the database function's search (the word split,
 * the Hebrew prefixes, the scoring).
 *
 * ⚠️ **Without the function's fit `CASE`, since 30.09.** The fit is the one rule in
 * `packages/shared/src/fit.ts`, applied by Tim in `lookup.ts` (`withFit`) — so this query no
 * longer takes the height.
 *
 * 🔴 **A copy of the function's body, not a rewrite** — `apps/server/db/migrations/
 * 20260926000000_baseline.sql`, `public.find_experiences`. Only the parameters changed.
 * `npm run parity:find-experiences` runs both on the same database (every column but the
 * fit) and fails on any difference; a fix (the "ב-" hyphen) comes only after parity, as its
 * own step.
 *
 * ⚠️ `last_verified::text` — PostgREST returns a date as "YYYY-MM-DD"; the driver would
 * return a Date object, and Tim formats the string.
 */
export async function findExperiences(
  sql: Sql,
  p: { name: string | null; park: string | null; limit: number },
): Promise<ExperienceRow[]> {
  const rows = await sql`
    with tok as (
      select distinct btrim(t, ',.;:!?()"''[]{}<>/-') as t
      from regexp_split_to_table(coalesce(${p.name}::text, ''), '[[:space:]]+') t
    ),
    words as (
      select t from tok where length(t) >= 3
    ),
    forms as (
      select t as t, t as root from words
      union
      select t, substr(t, 2) from words
      where length(t) >= 5 and substr(t, 1, 1) in ('ל','ב','ה','מ','ש','ו','כ')
    ),
    scored as (
      select
        e.id, e.name, e.name_i18n->>'he' as name_he,
        p.name as park_name, l.name as land_name,
        e.category, e.status, e.status_note, e.intensity,
        e.height_requirement_cm, e.max_height_requirement_cm, e.gets_wet, e.wheelchair,
        e.motion_sickness_warning,
        e.sens_enclosed_dark, e.sens_heights, e.sens_loud_sudden, e.sens_strobe,
        e.skip_line_system, e.last_verified,
        (select count(distinct f.t) from forms f
          where e.name ilike '%' || f.root || '%'
             or coalesce(e.name_i18n->>'he', '') ilike '%' || f.root || '%'
             or exists (
               select 1 from jsonb_array_elements_text(
                 coalesce(e.aliases_i18n->'he', '[]'::jsonb)) a
               where a ilike '%' || f.root || '%'
             )) as hits
      from experience e
      join park p on p.id = e.park_id
      left join land l on l.id = e.land_id
      where (${p.park}::text is null or p.id = ${p.park}::text or p.name ilike '%' || ${p.park}::text || '%')
    )
    select
      s.id, s.name, s.name_he, s.park_name as park, s.land_name as land,
      s.category, s.status, s.status_note, s.intensity,
      s.height_requirement_cm as height_cm, s.max_height_requirement_cm as max_height_cm,
      s.gets_wet, s.wheelchair, s.motion_sickness_warning as motion_sickness,
      s.sens_enclosed_dark as sens_dark, s.sens_heights, s.sens_loud_sudden as sens_loud,
      s.sens_strobe, s.skip_line_system as skip_line, s.last_verified::text as last_verified
    from scored s
    where
      (select count(*) from words) = 0
      or s.hits = (select max(x.hits) from scored x where x.hits > 0)
    order by
      case when ${p.name}::text is not null and s.name ilike ${p.name}::text || '%' then 0 else 1 end,
      s.name
    limit least(coalesce(${p.limit}::int, 8), 25)
  `;
  return rows as unknown as ExperienceRow[];
}
