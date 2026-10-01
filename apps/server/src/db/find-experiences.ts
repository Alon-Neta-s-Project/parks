import type { ExperienceRow } from "../tim/lookup";
import { withSignal, type Sql } from "./client";

/**
 * `find_ride`'s search — a ride by the name the agent passes (tools.ts).
 *
 * 🔴 **Language-neutral since 01.10 (Alon: "the tools should be generic, not coupled to a
 * language").** Understanding Hebrew, prefixes and typos is the model's job: measured on all 51
 * eval questions, the agent passed clean English names every time — "בהגריד" arrived as
 * "Hagrid's Magical Creatures Motorbike Adventure", "velocicoster" as "VelociCoaster". So:
 *   - **No Hebrew prefix stripping** (ל/ב/ה/מ/ש/ו/כ) — the database function's, built for the
 *     regex's leftovers ("ב-Space Mountain לילד"). It never fired on the agent's names.
 *   - **Every name in every language the data holds** — `name`, each `name_i18n` value, each
 *     `aliases_i18n` value — not `->>'he'`. A new language is data, not code.
 *   - **The word scoring stays:** split on whitespace, trim punctuation, keep the rides that
 *     match the most words. That is what finds "Tron Lightcycle Run" ("TRON Lightcycle / Run")
 *     and "Everest - Legend…" (a hyphen for an en dash), where a plain substring failed.
 * Measured on the agent's 20 real names (`npm run eval:ride-names`): 19/20 found, 18 first,
 * 24 rows — against substring 17/20 and trigram 19/20 with 35–44 rows.
 *
 * ⚠️ `name_he` in the output is presentation — Tim answers in Hebrew — not matching.
 * ⚠️ No fit here: it is the one rule in `packages/shared/src/fit.ts` (lookup.ts `withFit`).
 * ⚠️ `last_verified::text` — PostgREST returns a date as "YYYY-MM-DD"; the driver would return a
 * Date object, and Tim formats the string.
 *
 * History: until 01.10 a copy of the database function's body (parity 1312/1312), prefixes
 * included. The function lives on in production for the classic flow, until the cut-over.
 */
export async function findExperiences(
  sql: Sql,
  p: { name: string | null; park: string | null; limit: number },
  signal?: AbortSignal,
): Promise<ExperienceRow[]> {
  const rows = await withSignal(sql`
    with tok as (
      select distinct btrim(t, ',.;:!?()"''[]{}<>/-') as t
      from regexp_split_to_table(coalesce(${p.name}::text, ''), '[[:space:]]+') t
    ),
    words as (
      select t from tok where length(t) >= 3
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
        (select count(distinct w.t) from words w
          where exists (
            select 1 from (
              select e.name as v
              union all select value from jsonb_each_text(coalesce(e.name_i18n, '{}'::jsonb))
              union all select a from jsonb_each(coalesce(e.aliases_i18n, '{}'::jsonb)) l,
                                      jsonb_array_elements_text(l.value) a
            ) n
            where n.v ilike '%' || w.t || '%'
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
  `, signal);
  return rows as unknown as ExperienceRow[];
}
