import { experiences } from "../data";
import type { Experience, IntensityLevel } from "../data/schema";
import type { Profile } from "./profile";

/**
 * The recommendation engine, and the only place experiences are selected.
 *
 * It is deterministic on purpose. Every line of a recommendation traces to a
 * column in the workbook, so the product cannot answer from anything it does not
 * hold — the brief's first iron rule, enforced by construction rather than by a
 * prompt. A model layer for free-form questions would sit above this and call
 * searchExperiences as its tool, not replace it.
 */

export interface SearchFilters {
  parks?: string[];
  /**
   * Replaces the four sensitivity filters and motion_sickness_max.
   *
   * Not the operator's own safety notice — that turned out to mark a whole
   * class of rides at once and said nothing about nausea. This reflects sources
   * that actually rate it, which are T3/T4, so the field sits outside the
   * T1-only carve-out that now covers height limits and accessibility alone.
   *
   * true  — only rides carrying an official warning
   * false — only rides explicitly found to carry none
   * Rides where it is simply unknown are never swept into either answer.
   */
  hasMotionSicknessWarning?: boolean;
  kinds?: ("attraction" | "entertainment")[];
  intensityMin?: IntensityLevel | null;
  intensityMax?: IntensityLevel | null;
  includeUnrated?: boolean;
  /** Drop rides the workbook flags as temporarily unavailable. */
  includeClosed?: boolean;
  /** Explicit opt-in: only rides whose short queue the group's pass covers. */
  excludeSinglePass?: boolean;
  land?: string;
}

/**
 * Whether one experience satisfies the filters.
 *
 * Exported separately so the rules can be tested against constructed rows. The
 * unrated rule in particular must keep holding when the live data happens to
 * contain no unrated rides — a new ride arrives without a rating, which is
 * exactly why the column stays nullable.
 */
export function matchesFilters(e: Experience, filters: SearchFilters): boolean {
  const {
    parks,
    kinds,
    intensityMin = null,
    intensityMax = null,
    includeUnrated = false,
    includeClosed = false,
    excludeSinglePass = false,
    hasMotionSicknessWarning,
    land,
  } = filters;

  {
    if (parks?.length && !parks.includes(e.park)) return false;
    if (kinds?.length && !kinds.includes(e.kind)) return false;
    if (land && e.land !== land) return false;
    if (!includeClosed && e.status.state === "closed") return false;
    if (excludeSinglePass && e.fastAccess.singlePassRequired) return false;

    if (hasMotionSicknessWarning !== undefined) {
      // "na" and null both mean we cannot answer, so neither counts as a match
      // in either direction — an unknown must not read as a clean bill.
      const want = hasMotionSicknessWarning ? "true" : "false";
      if (e.motionSicknessWarning !== want) return false;
    }

    if (!e.intensity.rated) {
      // An unrated ride is never an answer to a question about intensity.
      // Returning one under "intensity up to 2" would assert something nobody
      // established — the exact false promise this product exists to avoid — so
      // an active bound excludes it regardless of includeUnrated. That flag only
      // governs whether unrated rides are listed when no bound is set at all.
      if (intensityMin !== null || intensityMax !== null) return false;
      return includeUnrated;
    }
    const value = e.intensity.value as IntensityLevel;
    if (intensityMin !== null && value < intensityMin) return false;
    if (intensityMax !== null && value > intensityMax) return false;
    return true;
  }
}

/** Mirrors the tool signature in brief §7 so the later model layer calls this. */
export function searchExperiences(filters: SearchFilters): Experience[] {
  return experiences.filter((e) => matchesFilters(e, filters));
}

export interface LandGroup {
  /** Lands are unique per park, but the reader still needs to know which park. */
  park: string;
  land: string;
  items: Experience[];
}

export interface Recommendation {
  groups: LandGroup[];
  total: number;
  /** Everything the reader would be misled by if it were left unsaid. */
  notes: {
    /** Rides excluded purely because nobody rated their intensity. */
    unratedExcluded: number;
    /** Matches needing a separately paid Single Pass for the short queue. */
    singlePass: Experience[];
    /** Matches the workbook marks as seasonal or needing a re-check. */
    needsCheck: Experience[];
    /** Universal rows where official Express participation is unconfirmed. */
    unconfirmedFastAccess: number;
    /** Hidden purely by the condensed view, so the count can be stated. */
    condensedAway: number;
    /** Parks in the profile that carry no intensity ratings at all. */
    unratedParks: string[];
  };
  verifiedAt: string | null;
}

const emptyRecommendation: Recommendation = {
  groups: [],
  total: 0,
  notes: {
    unratedExcluded: 0,
    singlePass: [],
    needsCheck: [],
    unconfirmedFastAccess: 0,
    condensedAway: 0,
    unratedParks: [],
  },
  verifiedAt: null,
};

/**
 * Ordering, and why.
 *
 * The workbook holds no popularity, duration or wait data, so any "best first"
 * ranking would be invented. What it does hold is intensity and land, both
 * complete enough to order on, so the ordering is two levels and neither claims
 * more than the data supports:
 *
 *   Lands come first by how much is in them, because walking between lands is
 *   the real cost of a park day and the fullest land is where a group gets the
 *   most done for the least walking.
 *
 *   Within a land, the most intense ride the group said it tolerates leads,
 *   since that is usually the one worth queueing for.
 */
export function recommend(profile: Profile): Recommendation {
  const parks = profile.parks;
  // No park chosen yet means no answer -- an unfiltered dump of the whole
  // dataset is not a recommendation.
  if (!parks.length) return emptyRecommendation;

  const matches = searchExperiences({
    parks,
    kinds: profile.kinds,
    intensityMin: profile.intensityMin,
    intensityMax: profile.intensityMax,
    includeUnrated: profile.includeUnrated,
    excludeSinglePass: profile.onlyIncludedInPass,
  });

  const sorted = [...matches].sort((a, b) => {
    const ai = a.intensity.value ?? -1;
    const bi = b.intensity.value ?? -1;
    if (ai !== bi) return bi - ai;
    return a.nameEn.localeCompare(b.nameEn, "en");
  });

  // Keyed by park as well as land: two parks in one answer would otherwise
  // produce a flat run of land names with nothing saying where each one is.
  const byLand = new Map<string, Experience[]>();
  for (const item of sorted) {
    const key = `${item.park}\u0000${item.land}`;
    const bucket = byLand.get(key);
    if (bucket) bucket.push(item);
    else byLand.set(key, [item]);
  }

  const CONDENSED_PER_LAND = 3;

  const groups: LandGroup[] = [...byLand.entries()]
    .map(([key, items]) => {
      const [park = "", land = ""] = key.split("\u0000");
      return { park, land, items };
    })
    // A park is visited as a unit, so its lands stay together. Within a park the
    // fullest land leads, for the same walking reason as before.
    .sort(
      (a, b) =>
        parks.indexOf(a.park) - parks.indexOf(b.park) ||
        b.items.length - a.items.length ||
        a.land.localeCompare(b.land, "en"),
    )
    // A condensed list keeps the top few per land rather than dropping lands,
    // so the shape of the park still reads.
    .map((g) =>
      profile.condensed ? { ...g, items: g.items.slice(0, CONDENSED_PER_LAND) } : g,
    );

  const unratedExcluded = profile.includeUnrated
    ? 0
    : experiences.filter(
        (e) =>
          parks.includes(e.park) &&
          !e.intensity.rated &&
          e.status.state !== "closed" &&
          (!profile.kinds.length || profile.kinds.includes(e.kind)),
      ).length;

  const unratedParks = parks.filter(
    (park) => !experiences.some((e) => e.park === park && e.intensity.rated),
  );

  return {
    groups,
    total: matches.length,
    notes: {
      unratedExcluded,
      singlePass: matches.filter((e) => e.fastAccess.singlePassRequired),
      needsCheck: matches.filter((e) => e.status.state === "check"),
      unconfirmedFastAccess: matches.filter((e) => e.fastAccess.unconfirmed).length,
      condensedAway: matches.length - groups.reduce((n, g) => n + g.items.length, 0),
      unratedParks,
    },
    verifiedAt: matches[0]?.lastVerified ?? null,
  };
}

/** The one number worth showing while the questions are still being answered. */
export function countFor(profile: Profile): number {
  if (!profile.parks.length) return 0;
  return searchExperiences({
    parks: profile.parks,
    kinds: profile.kinds,
    intensityMin: profile.intensityMin,
    intensityMax: profile.intensityMax,
    includeUnrated: profile.includeUnrated,
    excludeSinglePass: profile.onlyIncludedInPass,
  }).length;
}
