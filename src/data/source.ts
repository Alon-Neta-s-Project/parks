import { isConfigured, supabase } from "../lib/supabase";
import { experiences as bundled, parks as bundledParks } from "./index";
import { EXPERIENCE_SELECT, toExperience, toParks, type ExperienceRow } from "./from-db";
import type { Experience, Park } from "./schema";

/**
 * Where the content on screen actually came from.
 *
 * ⚠️ The rule this file exists for (CLAUDE.md): there is no silent fall back to
 * an older data source. The bundled dataset is a real fallback — it keeps the
 * product working with no keys and no network — but the moment it is what the
 * screen is showing, that has to be visible, because content frozen at build
 * time displayed as current is the failure this product is built against.
 *
 * So "bundled" is not an error state and "database" is not a success message.
 * The state is simply reported, and the UI says which one is true.
 */
export type SourceState =
  | { status: "loading"; experiences: Experience[]; parks: Park[] }
  | { status: "database"; experiences: Experience[]; parks: Park[]; refused: string[] }
  | { status: "bundled"; experiences: Experience[]; parks: Park[]; reason: Reason };

/** Why the database is not what you are looking at. Each is shown differently. */
export type Reason =
  | { kind: "not_configured" }
  | { kind: "unreachable"; detail: string }
  | { kind: "empty" }
  /** ⚠️ Rows came back and none of them could be understood. Not the same as empty. */
  | { kind: "all_refused"; refused: string[] };

const fallback = (reason: Reason): SourceState => ({
  status: "bundled",
  experiences: bundled,
  parks: bundledParks,
  reason,
});

/**
 * Load the content from the database, or say why not.
 *
 * ⚠️ Never throws. A thrown error here would leave the caller with nothing to
 * render and no explanation — the blank screen is the silent failure in its
 * loudest form.
 */
export async function loadContent(): Promise<SourceState> {
  if (!isConfigured) return fallback({ kind: "not_configured" });

  let rows: ExperienceRow[];
  try {
    const client = supabase();
    if (!client) return fallback({ kind: "not_configured" });
    const { data, error } = await client.from("experience").select(EXPERIENCE_SELECT);
    if (error) return fallback({ kind: "unreachable", detail: error.message });
    rows = (data ?? []) as unknown as ExperienceRow[];
  } catch (e) {
    return fallback({ kind: "unreachable", detail: String((e as Error)?.message ?? e) });
  }

  if (rows.length === 0) return fallback({ kind: "empty" });

  const mapped = rows.map(toExperience);
  const experiences = mapped.filter((m): m is Experience => !("refused" in m));
  const refused = mapped.flatMap((m) => ("refused" in m ? [m.refused] : []));

  // ⚠️ Every row refused is not "an empty database" and must not read as one.
  // It means the shape changed under us, and that is a different problem with a
  // different fix.
  if (experiences.length === 0) return fallback({ kind: "all_refused", refused });

  // ⚠️ Partial refusal still uses the database, and still reports the count.
  // Quietly serving 230 rows out of 232 is exactly the kind of small silent loss
  // that nobody notices until a family cannot find a ride.
  return { status: "database", experiences, parks: toParks(experiences), refused };
}
