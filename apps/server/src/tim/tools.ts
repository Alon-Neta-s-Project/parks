import type { QueryRidesInput } from "../db/query-rides";
import { classify, type Sensitivity } from "../../../../packages/shared/src/filters";
import { fitFor, type Member } from "../../../../packages/shared/src/fit";
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
/** `experience.category` — a closed vocabulary (CLAUDE.md: no transport). */
const CATEGORIES = [
  "dark_ride", "coaster", "simulator", "water_ride", "show", "walkthrough", "playground", "meet_greet", "scenic_ride", "360_film",
] as const;

export const TOOLS: FunctionDeclaration[] = [
  {
    name: "find_ride",
    description:
      "Rides by name — minimum and maximum height, intensity, sensitivities, status, getting wet, skip-the-line. " +
      "For a question about specific rides, also when a name was mentioned only earlier in the conversation; several names in one call. " +
      "With a group, each ride says who in it can ride. A closed ride is returned with its status.",
    parameters: {
      type: "object",
      properties: {
        names: {
          type: "array", items: { type: "string" },
          description: "The rides' names, in English or Hebrew, without question words — several for a comparison",
        },
        group: {
          type: "array",
          description: "Everyone the question is about — each child, and each adult when they ride too. Adults: age 18 or more, no height",
          items: {
            type: "object",
            properties: {
              age: { type: "integer", description: "Age in years, if known" },
              height_cm: { type: "integer", description: "Height in cm, if given (children)" },
            },
          },
        },
      },
      required: ["names"],
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
        parks: {
          type: "array", items: { type: "string" },
          description: "Parks: ids (mk, epcot, hs, ak, us, ioa, epic, vb, bb, tl) or names",
        },
        land: { type: "string", description: "A land within the park, by its English name" },
        categories: {
          type: "array", items: { type: "string", enum: [...CATEGORIES] },
          description: "The ride's form — coaster, dark_ride, water_ride, simulator…",
        },
        kinds: { type: "array", items: { type: "string", enum: ["attraction", "entertainment"] }, description: "attraction = a ride, entertainment = a show" },
        intensity_min: { type: "integer", description: "Minimum intensity, 1–4" },
        intensity_max: { type: "integer", description: "Maximum intensity, 1–4" },
        group: {
          type: "array",
          description: "Everyone the question is about — each child, and each adult when they ride too. Adults: age 18 or more, no height",
          items: {
            type: "object",
            properties: {
              age: { type: "integer", description: "Age in years, if known" },
              height_cm: { type: "integer", description: "Height in cm, if given (children)" },
            },
          },
        },
        group_fit: {
          type: "string", enum: ["everyone", "anyone"],
          description: "everyone (default) = rides the whole group can ride · anyone = rides at least one of them can ride",
        },
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
      properties: {
        per_park: { type: "integer", description: "How many per intensity level in each park (default 3)" },
        group: {
          type: "array",
          description: "Who is going — each child, and each adult when they ride too. Adults: age 18 or more, no height",
          items: {
            type: "object",
            properties: {
              age: { type: "integer", description: "Age in years, if known" },
              height_cm: { type: "integer", description: "Height in cm, if given (children)" },
            },
          },
        },
      },
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
/** An array from the model: only allowed values — or, with `free`, any short non-empty strings. */
const list = <T extends string>(v: unknown, allowed: readonly T[], free = false): T[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = free
    ? v.map(str).filter((x): x is string => !!x).slice(0, 8) as T[]
    : v.filter((x): x is T => (allowed as readonly unknown[]).includes(x));
  return out.length ? out : undefined;
};

/**
 * The group the model passed, as the shared fit rule reads it (fit.ts `Member`).
 *
 * ⚠️ **A member without an age is a child** — with a height if one was given, unmeasured if
 * not. Read as an adult, it would be cleared past every minimum height without anyone saying
 * so; read as a child, the worst case is "unknown", which is said.
 */
export function readGroup(v: unknown): Member[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined;
  return v.slice(0, 8).map((m, i) => {
    const o = (m && typeof m === "object" ? m : {}) as Args;
    const heightCm = int(o.height_cm, 50, 200);
    const age = int(o.age, 0, 120);
    return { id: `#${i + 1}`, age: age ?? 10, heightCm };
  });
}

const who = (m: Member) => `${m.id} (age ${m.age}${m.heightCm !== null ? `, ${m.heightCm} cm` : ""})`;

/**
 * Who in the group can ride this one — the same rule as the screen's chip (fit.ts `fitFor`),
 * every state in its own words, what is known before what is missing.
 */
export function groupLine(r: { height_cm: number | null; max_height_cm?: number | null }, group: Member[]): string {
  const limits = { minCm: r.height_cm, maxCm: r.max_height_cm ?? null };
  const g = fitFor(limits, group);
  if (g.fit === "everyone") return "Group: everyone can ride.";
  const why = (m: Member) =>
    limits.maxCm !== null && (m.age >= 14 || (m.heightCm ?? 0) > limits.maxCm)
      ? `${who(m)} — above the ${limits.maxCm} cm maximum`
      : `${who(m)} — below the ${limits.minCm} cm minimum`;
  const bits = [
    g.canRide.length ? `can ride: ${g.canRide.map(who).join(", ")}` : null,
    g.cannotRide.length ? `cannot ride: ${g.cannotRide.map(why).join("; ")}` : null,
    g.underCeiling.length
      ? `not too tall (up to ${limits.maxCm} cm), but whether there is a minimum is unknown: ${g.underCeiling.map(who).join(", ")}`
      : null,
    g.unmeasured.length ? `height not given: ${g.unmeasured.map(who).join(", ")}` : null,
    limits.minCm === null && limits.maxCm === null ? "whether there is a minimum height is unknown" : null,
  ].filter(Boolean);
  return `Group: ${bits.join(" · ")}.`;
}

/** Each ride's block, and under it who in the group can ride it. */
const withGroup = (rides: ExperienceRow[], group: Member[] | undefined) =>
  rides.map((r) => formatExperiences([r]) + (group ? `\n${groupLine(r, group)}` : "")).join("\n\n");

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
        // Several names in one call (a comparison); `name` alone still read, for an older call.
        const names = [...new Set([...(list(args.names, [] as string[], true) ?? []), str(args.name)].filter((n): n is string => !!n))].slice(0, 4);
        if (!names.length) return empty("No ride name given.", false);
        const group = readGroup(args.group);
        // One height without a group: the fit in the ride's own line, as before (lookup.ts withFit).
        const heightCm = group ? null : int(args.height_cm, 50, 200);
        const found = await Promise.all(names.map((name) => direct.findExperiences({ name, park: null, limit: 6 }, signal())));
        const blocks = found.map((rows, i) => rows.length
          ? withGroup(withFit(rows, heightCm), group)
          : `No ride named "${names[i]}" in our data.`);
        const rides = found.flatMap((rows) => withFit(rows, heightCm));
        return { ...empty(blocks.join("\n\n")), rides };
      }
      case "query_rides": {
        if (!direct.queryRides) return empty("This tool is not available.", false);
        const group = readGroup(args.group);
        const input: QueryRidesInput = {
          park: str(args.park),
          parks: list(args.parks, [] as string[], true),
          land: str(args.land),
          categories: list(args.categories, CATEGORIES),
          group,
          groupFit: args.group_fit === "anyone" ? "anyone" : "everyone",
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
        const text = [head, r.rides.length ? withGroup(r.rides, group) : null, heldBackLine(r.heldBack)]
          .filter(Boolean).join("\n\n");
        return { ...empty(text), rides: r.rides };
      }
      case "park_candidates": {
        const all = await direct.parkCandidates({ perPark: int(args.per_park, 1, 6) ?? 3 }, signal());
        const group = readGroup(args.group);
        // With a group: only rides at least one of them can ride — the shared rule, as query_rides.
        const held = { unrated: 0, sensitivityUnchecked: 0, heightUnknown: 0 };
        const candidates = group
          ? all.filter((c) => {
            const v = classify({
              kind: "attraction", state: "open", singlePassRequired: false, intensity: c.intensity,
              sensEnclosedDark: "false", sensLoudSudden: "false", sensStrobe: "false", sensHeights: "false",
              motionSicknessWarning: "false", wheelchair: null, minCm: c.height_cm, maxCm: c.max_height_cm,
            }, { group, groupFit: "anyone", includeUnrated: true });
            if (v === "heightUnknown") held.heightUnknown++;
            return v === "match";
          })
          : all;
        const text = [candidates.length ? formatCandidates(candidates) : "No candidates in the data.", heldBackLine(held)]
          .filter(Boolean).join("\n\n");
        return { ...empty(text), candidates };
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
    // Ride names: how many, and how long — not the words.
    else if (k === "names") out[k] = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? `‹${x.length} chars›` : typeof x)) : typeof v;
    // The group: its size, and how many ages and heights were given — never the heights.
    else if (k === "group") {
      const g = Array.isArray(v) ? v.filter((m) => m && typeof m === "object") as Args[] : [];
      out[k] = `‹${g.length} members · ${g.filter((m) => m.age != null).length} ages · ${g.filter((m) => m.height_cm != null).length} heights›`;
    }
    else if (k === "height_cm") out[k] = v == null ? null : "‹given›";
    else if (typeof v === "string") out[k] = v.slice(0, 20);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").map((x) => String(x).slice(0, 20)).slice(0, 8);
    else out[k] = typeof v;
  }
  return out;
}
