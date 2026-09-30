import type { ParkCandidate } from "../tim/lookup";
import type { Sql } from "./client";

/**
 * `park_candidates`, run from the server — the rides Tim chooses from on a recommendation
 * question that names no ride.
 *
 * 🔴 **A copy of the function's body, not a rewrite** — `apps/server/db/migrations/
 * 20260926000000_baseline.sql`, `public.park_candidates`. What changed, and only this: the
 * parameter is bound (`p_per_park` → `${p.perPark}`), and the output columns are aliased
 * (`park_name as park` …) — a function's `RETURNS TABLE` names them by position, a plain query
 * has to say them. `npm run parity:park-candidates` runs both on the same database and fails
 * on any difference.
 *
 * ⚠️ **A spread across the intensities, not "the most popular"** — the rows are there so the
 * model can choose in both directions, calm and strong, so the ranking is within each
 * intensity separately.
 */
export async function parkCandidates(sql: Sql, p: { perPark: number | null }): Promise<ParkCandidate[]> {
  const rows = await sql`
    with ranked as (
      select
        p.name as park_name,
        e.name,
        e.name_i18n->>'he' as name_he,
        l.name as land_name,
        e.category,
        e.intensity,
        e.height_requirement_cm,
        e.max_height_requirement_cm,
        e.gets_wet,
        row_number() over (
          partition by p.id, e.intensity
          order by e.name
        ) as rn
      from experience e
      join park p on p.id = e.park_id
      left join land l on l.id = e.land_id
      where p.park_kind = 'theme'
        -- The seven theme parks only (Paula's decision): a water park is no answer to
        -- "which park suits us".
        and e.kind = 'attraction'
        -- A closed ride is no candidate. Unlike a question about a named ride, where a
        -- closed one IS returned, with its status — there we were asked about it.
        and e.status = 'open'
        -- 🔴 And a ride with no intensity rating never gets in (CLAUDE.md): it would arrive
        -- as "not rated" inside an answer that is all about intensity.
        and e.intensity is not null
    )
    select park_name as park, name, name_he, land_name as land, category,
           intensity, height_requirement_cm as height_cm, max_height_requirement_cm as max_height_cm, gets_wet
      from ranked
     where rn <= greatest(coalesce(${p.perPark}::int, 4), 1)
     order by park_name, intensity, name
  `;
  return rows as unknown as ParkCandidate[];
}
