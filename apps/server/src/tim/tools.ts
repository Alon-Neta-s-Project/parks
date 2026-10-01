import type { QueryRidesInput } from "../db/query-rides";
import type { Sensitivity } from "../../../../packages/shared/src/filters";
import { formatCandidates, formatChunks, formatExperiences } from "./context";
import { isTimeout, noteTimeout, signalFor, type Limit } from "./deadline";
import type { FunctionDeclaration } from "./gemini";
import { embedQuery, withFit, type DirectQueries, type ExperienceRow, type KnowledgeChunk, type ParkCandidate } from "./lookup";

/**
 * The agent's four tools (O13, Alon 26.09) — what Gemini may ask for, and how each is run.
 *
 * 🔴 **Typed parameters, never free SQL.** The model decides *what* to ask; the server decides
 * *how* the rules apply (packages/shared). Raw rows would skip `formatExperiences`, where every
 * state gets its own words — and NULL read as "no limit" is the pattern CLAUDE.md counts seven
 * times.
 *
 * ⚠️ **A tool never throws to the agent.** A failure or a timeout comes back as a result the
 * model can read ("the tool failed — there is no data"), so it says it does not know instead
 * of answering from memory. Its instructions forbid a ride fact without a tool row behind it.
 *
 * ⚠️ Descriptions and messages are in English (Alon, 01.10). The ride rows themselves go through
 * the existing Hebrew formatters — they carry the wording Tim must use with the family.
 *
 * ⚠️ **The result is text, through the same formatters as the classic context** — the model
 * sees a ride the same way whichever path brought it.
 */

const SENSITIVITIES = ["dark", "loudSudden", "strobe", "heights", "motionSickness", "accessibility"] as const;

export const TOOLS: FunctionDeclaration[] = [
  {
    name: "find_ride",
    description:
      "One ride by name — minimum and maximum height, intensity, sensitivities, status, getting wet, skip-the-line. " +
      "For a question about a specific ride, also when the name was mentioned only earlier in the conversation. A closed ride is returned with its status.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The ride's name, in English or Hebrew, without question words" },
        height_cm: { type: "integer", description: "The child's height in cm, if stated — to say whether it fits" },
      },
      required: ["name"],
    },
  },
  {
    name: "query_rides",
    description:
      "A filtered list of rides — for questions about a set: \"which rides…\". Every constraint stated, including earlier in the conversation. " +
      "Also returns how many rides were held back because something about them is unknown — and that must be said.",
    parameters: {
      type: "object",
      properties: {
        park: { type: "string", description: "Park: an id (mk, epcot, hs, ak, us, ioa, epic, vb, bb, tl) or a name" },
        land: { type: "string", description: "A land within the park, by its English name" },
        kinds: { type: "array", items: { type: "string", enum: ["attraction", "entertainment"] }, description: "attraction = a ride, entertainment = a show" },
        intensity_min: { type: "integer", description: "Minimum intensity, 1–4" },
        intensity_max: { type: "integer", description: "Maximum intensity, 1–4" },
        height_cm: { type: "integer", description: "Only rides a child of this height can ride" },
        avoid: { type: "array", items: { type: "string", enum: [...SENSITIVITIES] }, description: "Sensitivities to avoid" },
        motion_sickness_warning: { type: "boolean", description: "false = only rides without a motion-sickness warning" },
        exclude_single_pass: { type: "boolean", description: "Leave out rides that need a paid Single Pass" },
        include_closed: { type: "boolean", description: "Include closed rides" },
        per_park: { type: "integer", description: "At most this many per park" },
        limit: { type: "integer", description: "At most this many rows (default 20, up to 40)" },
      },
    },
  },
  {
    name: "park_candidates",
    description:
      "Open rides to choose from across the seven theme parks, spread over the intensity levels — for a recommendation: \"which park suits us\".",
    parameters: {
      type: "object",
      properties: { per_park: { type: "integer", description: "How many per intensity level in each park (default 3)" } },
    },
  },
  {
    name: "search_knowledge",
    description:
      "Search the knowledge base — parking, tickets, weather, hotels, tips. The knowledge found for the question is already attached to it; " +
      "search again only with different wording, or for one resort.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for, in your own words" },
        resort: { type: "string", enum: ["wdw", "uor"], description: "wdw = Disney, uor = Universal" },
      },
      required: ["query"],
    },
  },
];

/** What one tool call returned — the text for the model, and the rows for the counts. */
export interface ToolResult {
  text: string;
  rides: ExperienceRow[];
  candidates: ParkCandidate[];
  chunks: KnowledgeChunk[];
  ok: boolean;
  timedOut: boolean;
}

export interface ToolContext {
  direct: DirectQueries;
  key: string;
  limit?: Limit;
}

// ── Reading what the model sent — never trusted as typed ──────────────
type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
const int = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null;
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const list = <T extends string>(v: unknown, allowed: readonly T[]) =>
  Array.isArray(v) ? v.filter((x): x is T => (allowed as readonly unknown[]).includes(x)) : undefined;

const empty = (text: string, ok = true, timedOut = false): ToolResult =>
  ({ text, rides: [], candidates: [], chunks: [], ok, timedOut });

/** Hebrew counts the model must say — the unknowns are never dropped in silence. */
function heldBackLine(h: { unrated: number; sensitivityUnchecked: number; heightUnknown: number }): string | null {
  const bits = [
    h.unrated ? `${h.unrated} with no intensity rating` : null,
    h.sensitivityUnchecked ? `${h.sensitivityUnchecked} never checked for a sensitivity they asked to avoid` : null,
    h.heightUnknown ? `${h.heightUnknown} where it is unknown whether the height fits` : null,
  ].filter(Boolean);
  return bits.length ? `⚠️ Held back because something about them is unknown — this must be said: ${bits.join(" · ")}.` : null;
}

export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<ToolResult> {
  const { direct, limit } = ctx;
  const signal = () => signalFor(limit, "dbMs");
  try {
    switch (name) {
      case "find_ride": {
        const ride = str(args.name);
        if (!ride) return empty("No ride name given.", false);
        const heightCm = int(args.height_cm, 50, 200);
        const rides = withFit(await direct.findExperiences({ name: ride, park: null, limit: 6 }, signal()), heightCm);
        return rides.length
          ? { ...empty(formatExperiences(rides)), rides }
          : empty("No ride by that name in our data.");
      }
      case "query_rides": {
        if (!direct.queryRides) return empty("This tool is not available.", false);
        const input: QueryRidesInput = {
          park: str(args.park),
          land: str(args.land),
          kinds: list(args.kinds, ["attraction", "entertainment"] as const),
          intensityMin: int(args.intensity_min, 1, 4),
          intensityMax: int(args.intensity_max, 1, 4),
          heightCm: int(args.height_cm, 50, 200),
          avoidSensitivities: list(args.avoid, SENSITIVITIES) as Sensitivity[] | undefined,
          hasMotionSicknessWarning: bool(args.motion_sickness_warning),
          excludeSinglePass: bool(args.exclude_single_pass),
          includeClosed: bool(args.include_closed),
          perPark: int(args.per_park, 1, 20),
          limit: int(args.limit, 1, 40),
        };
        const r = await direct.queryRides(input, signal());
        const head = r.matched > r.rides.length
          ? `${r.matched} rides match; ${r.rides.length} shown.`
          : `${r.matched} rides match.`;
        const text = [head, r.rides.length ? formatExperiences(r.rides) : null, heldBackLine(r.heldBack)]
          .filter(Boolean).join("\n\n");
        return { ...empty(text), rides: r.rides };
      }
      case "park_candidates": {
        const candidates = await direct.parkCandidates({ perPark: int(args.per_park, 1, 6) ?? 3 }, signal());
        return candidates.length
          ? { ...empty(formatCandidates(candidates)), candidates }
          : empty("No candidates in the data.");
      }
      case "search_knowledge": {
        const query = str(args.query);
        if (!query) return empty("Nothing to search for.", false);
        const resort = args.resort === "wdw" || args.resort === "uor" ? args.resort : null;
        const vector = await embedQuery(ctx.key, query, limit);
        if (!vector) return empty("The search failed — no data.", false);
        const chunks = await direct.matchKnowledge({ embedding: JSON.stringify(vector), limit: 5, resort }, signal());
        return chunks.length ? { ...empty(formatChunks(chunks)), chunks } : empty("No knowledge found on this.");
      }
      default:
        return empty(`There is no tool named ${name}.`, false);
    }
  } catch (e) {
    noteTimeout(limit, `tool:${name}`, e);
    return empty("The tool failed — no data. Do not answer this from memory.", false, isTimeout(e));
  }
}

/**
 * The arguments as the log may hold them (log.ts, O2): what the model *asked for*, so a wrong
 * call can be debugged — but **not the family's words**. Free text (a ride name, a search) is
 * logged by length; a child's height only as given or not.
 */
export function argsForLog(args: Args): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    if (k === "name" || k === "query" || k === "land") out[k] = typeof v === "string" ? `‹${v.length} chars›` : typeof v;
    else if (k === "height_cm") out[k] = v == null ? null : "‹given›";
    else if (typeof v === "string") out[k] = v.slice(0, 20);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").map((x) => String(x).slice(0, 20)).slice(0, 8);
    else out[k] = typeof v;
  }
  return out;
}
