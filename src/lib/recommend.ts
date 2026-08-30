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
  kinds?: ("attraction" | "entertainment")[];
  intensityMin?: IntensityLevel | null;
  intensityMax?: IntensityLevel | null;
  includeUnrated?: boolean;
  /** Drop rides the workbook flags as temporarily unavailable. */
  includeClosed?: boolean;
  land?: string;
}

/** Mirrors the tool signature in brief §7 so the later model layer calls this. */
export function searchExperiences(filters: SearchFilters): Experience[] {
  const {
    parks,
    kinds,
    intensityMin = null,
    intensityMax = null,
    includeUnrated = false,
    includeClosed = false,
    land,
  } = filters;

  return experiences.filter((e) => {
    if (parks?.length && !parks.includes(e.park)) return false;
    if (kinds?.length && !kinds.includes(e.kind)) return false;
    if (land && e.land !== land) return false;
    if (!includeClosed && e.status.state === "closed") return false;

    if (!e.intensity.rated) return includeUnrated;
    const value = e.intensity.value as IntensityLevel;
    if (intensityMin !== null && value < intensityMin) return false;
    if (intensityMax !== null && value > intensityMax) return false;
    return true;
  });
}

export interface LandGroup {
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
  });

  const sorted = [...matches].sort((a, b) => {
    const ai = a.intensity.value ?? -1;
    const bi = b.intensity.value ?? -1;
    if (ai !== bi) return bi - ai;
    return a.nameEn.localeCompare(b.nameEn, "en");
  });

  const byLand = new Map<string, Experience[]>();
  for (const item of sorted) {
    const bucket = byLand.get(item.land);
    if (bucket) bucket.push(item);
    else byLand.set(item.land, [item]);
  }

  const groups: LandGroup[] = [...byLand.entries()]
    .map(([land, items]) => ({ land, items }))
    .sort((a, b) => b.items.length - a.items.length || a.land.localeCompare(b.land, "en"));

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
      unratedParks,
    },
    verifiedAt: matches[0]?.sourceVerifiedAt ?? null,
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
  }).length;
}
