import { classify, type RideFacts, type SearchFilters } from "../../../../packages/shared/src/filters";
import { withFit, type ExperienceRow } from "../tim/lookup";
import type { Sql } from "./client";

/**
 * `query_rides` — the agent's tool for set questions ("no water, up to 110 cm, intensity ≤ 3"),
 * O13. **Server code, not a database function** (Alon, 26.09).
 *
 * The split:
 *   - **Lookups in SQL:** the park (id or name, like find_experiences) and the land (name).
 *   - **The rules in TypeScript, shared with the web app** (packages/shared/src/filters.ts):
 *     intensity, sensitivities, motion sickness, closed, Single Pass, and the height (fit.ts).
 *     A third copy of those rules is what this avoids.
 *
 * 🔴 **A filter never turns an unknown into a match — and the unknowns are counted, not
 * dropped in silence.** A short list reads as "that is all there is"; "and 14 more nobody
 * checked for noise" is a different answer (CLAUDE.md: silence reads as absence).
 *
 * ⚠️ Capped (`limit`, at most 40; `perPark`): the rows go into the model's context.
 */
export interface QueryRidesInput extends SearchFilters {
  park?: string | null;
  land?: string | null;
  /** At most this many per park, before the overall limit. */
  perPark?: number | null;
  /** Default 20, at most 40. */
  limit?: number | null;
}

export interface QueryRidesResult {
  /** The matches shown, with the fit said for `heightCm` (lookup.ts `withFit`). */
  rides: ExperienceRow[];
  /** All matches, before the caps — so "20 of 57" can be said. */
  matched: number;
  /** Rides out only because of something we do not know. */
  heldBack: { unrated: number; sensitivityUnchecked: number; heightUnknown: number };
}

type Row = ExperienceRow & {
  kind: "attraction" | "entertainment";
  single_pass: boolean;
  wheelchair: string | null;
  motion_sickness: RideFacts["motionSicknessWarning"];
};

/** The database's five statuses, as the shared rules read them: coming soon / temporarily closed are "check". */
const state = (s: string): RideFacts["state"] => (s === "open" ? "open" : s === "closed" ? "closed" : "check");

export const rowFacts = (r: Row): RideFacts => ({
  kind: r.kind,
  state: state(r.status),
  singlePassRequired: r.single_pass,
  intensity: r.intensity,
  sensEnclosedDark: (r.sens_dark ?? null) as RideFacts["sensEnclosedDark"],
  sensLoudSudden: (r.sens_loud ?? null) as RideFacts["sensLoudSudden"],
  sensStrobe: (r.sens_strobe ?? null) as RideFacts["sensStrobe"],
  sensHeights: (r.sens_heights ?? null) as RideFacts["sensHeights"],
  motionSicknessWarning: r.motion_sickness,
  wheelchair: r.wheelchair,
  minCm: r.height_cm,
  maxCm: r.max_height_cm ?? null,
});

/** Every match and every held-back count, before the caps — what the parity check compares. */
export async function selectRides(sql: Sql, input: Omit<QueryRidesInput, "perPark" | "limit">) {
  const { park = null, land = null, ...filters } = input;
  // The same columns find_experiences returns, so formatExperiences says every state of them.
  const rows = (await sql`
    select
      e.id, e.name, e.name_i18n->>'he' as name_he, p.name as park, l.name as land,
      e.category, e.kind, e.status, e.status_note, e.intensity,
      e.height_requirement_cm as height_cm, e.max_height_requirement_cm as max_height_cm,
      e.gets_wet, e.wheelchair, e.motion_sickness_warning as motion_sickness,
      e.sens_enclosed_dark as sens_dark, e.sens_heights, e.sens_loud_sudden as sens_loud,
      e.sens_strobe, e.skip_line_system as skip_line, e.skip_line_system = 'single_pass' as single_pass,
      e.last_verified::text as last_verified
    from experience e
    join park p on p.id = e.park_id
    left join land l on l.id = e.land_id
    where (${park}::text is null or p.id = ${park}::text or p.name ilike '%' || ${park}::text || '%')
      and (${land}::text is null or l.name ilike '%' || ${land}::text || '%')
    order by p.name, e.intensity desc nulls last, e.name
  `) as unknown as Row[];

  const heldBack = { unrated: 0, sensitivityUnchecked: 0, heightUnknown: 0 };
  const matches: Row[] = [];
  for (const r of rows) {
    const v = classify(rowFacts(r), filters);
    if (v === "match") matches.push(r);
    else if (v !== "no") heldBack[v]++;
  }
  return { matches, heldBack };
}

export async function queryRides(sql: Sql, input: QueryRidesInput): Promise<QueryRidesResult> {
  const { perPark = null, limit = null, ...rest } = input;
  const { matches, heldBack } = await selectRides(sql, rest);

  const per = perPark && perPark > 0 ? perPark : Infinity;
  const seen = new Map<string, number>();
  const capped = matches.filter((r) => {
    const n = (seen.get(r.park) ?? 0) + 1;
    seen.set(r.park, n);
    return n <= per;
  });
  const shown = capped.slice(0, Math.min(Math.max(limit ?? 20, 1), 40));
  return { rides: withFit(shown, rest.heightCm ?? null), matched: matches.length, heldBack };
}
