/**
 * Which rides answer a filter — **the one place the filter rules live**, for the web app's
 * recommendation (`apps/web/src/lib/recommend.ts`) and for Tim's `query_rides` tool
 * (`apps/server/src/db/query-rides.ts`).
 *
 * 🔴 **Moved from the web app, not rewritten (30.09).** `matchesFilters` was written there
 * "so the later model layer calls this"; the model layer is on the server, so the rules moved
 * here, as they were, and both sides feed them. A third copy in the server is exactly the
 * duplication the fit rule just got rid of (fit.ts).
 *
 * The rules that hold whatever the data happens to contain:
 *   - An unrated ride is **never** an answer to a question about intensity (CLAUDE.md).
 *   - A ride nobody checked for a sensitivity the group asked to avoid is **out** by default —
 *     a family reading a list reads it as clean.
 *   - "na" (the question does not apply — a show) is an answer, and never "unchecked".
 *   - A filter never turns an unknown into a match: the height too (fit.ts `heightFit`).
 *
 * ⚠️ Park and land are not here: they are lookups, and each side matches its own names
 * (the web app by its display name, the server by id or name in SQL).
 */
import { heightFit } from "./fit";

/** The four-state flag columns: "na" is "does not apply", null is "not checked". */
export type QuadState = "true" | "false" | "na" | null;

export type Sensitivity =
  | "dark"
  | "loudSudden"
  | "strobe"
  | "heights"
  | "motionSickness"
  | "accessibility"
  | "longQueues";

export const sensitivities: Sensitivity[] = [
  "dark", "loudSudden", "strobe", "heights", "motionSickness", "accessibility", "longQueues",
];

/**
 * The ones a column can answer. `longQueues` is a fact about the day, not the ride — no column
 * holds it — so it never tags a ride.
 */
export const rideSensitivities: Sensitivity[] = sensitivities.filter((s) => s !== "longQueues");

/**
 * What we know about one ride on one sensitivity. Five states, never collapsed to a boolean:
 * "unchecked" is nobody having looked; "depends" is checked, and the answer is about the
 * person; "notApplicable" is a full answer (a show), not a gap.
 */
export type SensitivityState = "flagged" | "clear" | "depends" | "notApplicable" | "unchecked";

/** What the filter needs to know about a ride — each side maps its own rows into this. */
export interface RideFacts {
  kind: "attraction" | "entertainment";
  /** "check" — coming soon, or temporarily closed: not "closed", and kept by default. */
  state: "open" | "closed" | "check";
  singlePassRequired: boolean;
  intensity: number | null;
  /** Never inferred from category "dark_ride" — an industry term that predicts nothing (CLAUDE.md). */
  sensEnclosedDark: QuadState;
  sensLoudSudden: QuadState;
  sensStrobe: QuadState;
  /** Whether it goes high — not `minCm`, which is the opposite thing. */
  sensHeights: QuadState;
  motionSicknessWarning: QuadState;
  wheelchair: string | null;
  minCm: number | null;
  maxCm: number | null;
}

/**
 * 🔴 **Five states, and the fifth was added after its absence cost 77 rows.** The master writes
 * `N/A` on all 77 Entertainment rows (shows, parades, character meets): "the question does not
 * apply". The import collapsed it to null, null read as "not checked", and a family avoiding
 * heights **lost every show** — exactly what suits them. Approved by Paula through Philip, 08.09.
 */
const fromFlag = (v: QuadState): SensitivityState =>
  v === null ? "unchecked" : v === "na" ? "notApplicable" : v === "true" ? "flagged" : "clear";

/** Whether this ride carries this sensitivity. */
export function sensitivityState(r: RideFacts, s: Sensitivity): SensitivityState {
  switch (s) {
    case "dark":
      return fromFlag(r.sensEnclosedDark);
    case "loudSudden":
      return fromFlag(r.sensLoudSudden);
    case "strobe":
      return fromFlag(r.sensStrobe);
    case "heights":
      // Not the height requirement, which is the opposite thing (how tall you must be). This is
      // whether the ride goes high enough to frighten someone afraid of heights. Every one of
      // the 165 attractions is TRUE or FALSE; the 77 shows are N/A — somebody did look.
      return fromFlag(r.sensHeights);
    case "accessibility":
      // Five values. Only one is a barrier for every wheelchair user; three are a transfer,
      // a fact about the person — so neither excluded nor cleared: "depends".
      switch (r.wheelchair) {
        case null:
          return "unchecked";
        case "must_be_ambulatory":
          return "flagged";
        case "remain_in_wheelchair":
          return "clear";
        default:
          return "depends";
      }
    case "motionSickness":
      return fromFlag(r.motionSicknessWarning);
    case "longQueues":
      return "unchecked";
  }
}

export interface SearchFilters {
  /**
   * true — only rides carrying a warning; false — only rides explicitly found to carry none.
   * Unknown ("na" or null) is never swept into either answer.
   */
  hasMotionSicknessWarning?: boolean;
  kinds?: ("attraction" | "entertainment")[];
  intensityMin?: number | null;
  intensityMax?: number | null;
  includeUnrated?: boolean;
  /** Drop rides flagged as closed (not "check"). */
  includeClosed?: boolean;
  /** Explicit opt-in: only rides whose short queue the group's pass covers. */
  excludeSinglePass?: boolean;
  /** A ride flagged for any of them is out — and so, by default, is one nobody checked. */
  avoidSensitivities?: Sensitivity[];
  /** ⚠️ Default false, and the default is the safety property. */
  includeUncheckedSensitivity?: boolean;
  /**
   * Only rides this height can ride (fit.ts `heightFit`): "fits" is in; too short, too tall,
   * an unchecked floor, and a ceiling with an unchecked floor are out — never a match.
   */
  heightCm?: number | null;
}

/**
 * Why a ride is not a match — and whether it is out because of something we do not know.
 * The unknowns are counted apart, so a short list is never read as "that is all there is"
 * (CLAUDE.md: silence about a value reads as its absence).
 */
export type Verdict = "match" | "no" | "unrated" | "sensitivityUnchecked" | "heightUnknown";

export function classify(r: RideFacts, f: SearchFilters): Verdict {
  const {
    kinds, intensityMin = null, intensityMax = null, includeUnrated = false, includeClosed = false,
    excludeSinglePass = false, hasMotionSicknessWarning, avoidSensitivities,
    includeUncheckedSensitivity = false, heightCm = null,
  } = f;

  if (kinds?.length && !kinds.includes(r.kind)) return "no";
  if (!includeClosed && r.state === "closed") return "no";
  if (excludeSinglePass && r.singlePassRequired) return "no";

  let unchecked = false;
  if (avoidSensitivities?.length) {
    for (const s of rideSensitivities) {
      if (!avoidSensitivities.includes(s)) continue;
      const state = sensitivityState(r, s);
      if (state === "flagged") return "no";
      if (state === "unchecked" && !includeUncheckedSensitivity) unchecked = true;
      // "depends" stays in deliberately: dropping it would hide most of a park from someone
      // who can transfer. It is surfaced beside the ride instead.
    }
  }

  if (hasMotionSicknessWarning !== undefined) {
    // "na" and null both mean we cannot answer — neither counts as a match in either direction.
    if (r.motionSicknessWarning !== (hasMotionSicknessWarning ? "true" : "false")) return "no";
  }

  let height: Verdict | null = null;
  if (heightCm !== null) {
    const fit = heightFit({ minCm: r.minCm, maxCm: r.maxCm }, heightCm);
    if (fit === "too_short" || fit === "too_tall") return "no";
    if (fit !== "fits") height = "heightUnknown";
  }

  if (r.intensity === null) {
    // An active bound excludes an unrated ride regardless of includeUnrated; that flag only
    // governs whether unrated rides are listed when no bound is set at all.
    if (intensityMin !== null || intensityMax !== null) return "unrated";
    if (!includeUnrated) return "unrated";
  } else {
    if (intensityMin !== null && r.intensity < intensityMin) return "no";
    if (intensityMax !== null && r.intensity > intensityMax) return "no";
  }

  // A known "no" above wins over an unknown; among the unknowns, the sensitivity first.
  if (unchecked) return "sensitivityUnchecked";
  return height ?? "match";
}

/** Whether one ride satisfies the filters. */
export const matchesFilters = (r: RideFacts, f: SearchFilters): boolean => classify(r, f) === "match";
