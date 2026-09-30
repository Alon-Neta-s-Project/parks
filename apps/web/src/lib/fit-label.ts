import type { FitResult } from "./group";

/** What the fit chip says: an he.json key under `fit`, its values, and the chip's tone. */
export interface FitLabel {
  key: "everyone" | "some" | "unknown" | "underCeiling";
  values: Record<string, number>;
  /** The explanation on hover. */
  why?: { key: "unknownWhy" | "unmeasuredWhy" | "underCeilingWhy" | "ceilingWhy"; values: Record<string, number> };
  tone: "open" | "warn" | "missing";
}

/**
 * The words for a fit result — every state its own words (CLAUDE.md), and what is known before
 * what is missing.
 *
 * ⚠️ **A ceiling with an unchecked floor (decision 2, C) is not "unknown" alone.** We know who
 * is not too tall; that is said first, and the missing floor after it. The tone stays
 * "missing": it is not a "fits".
 */
export function fitLabel(r: FitResult, total: number, maxCm: number | null): FitLabel {
  if (r.fit === "unknown") {
    if (r.unmeasured.length) {
      return { key: "unknown", values: {}, why: { key: "unmeasuredWhy", values: { count: r.unmeasured.length } }, tone: "missing" };
    }
    if (r.underCeiling.length && maxCm !== null) {
      return {
        key: "underCeiling",
        values: { count: r.underCeiling.length, total },
        why: { key: "underCeilingWhy", values: { max: maxCm } },
        tone: "missing",
      };
    }
    return { key: "unknown", values: {}, why: { key: "unknownWhy", values: {} }, tone: "missing" };
  }
  // With a ceiling, "3 of 4" needs its reason: adults count as unable to ride (decision 1b).
  const why = maxCm !== null ? { key: "ceilingWhy" as const, values: { max: maxCm } } : undefined;
  if (r.fit === "everyone") return { key: "everyone", values: {}, why, tone: "open" };
  return { key: "some", values: { count: r.canRide.length, total }, why, tone: "warn" };
}
