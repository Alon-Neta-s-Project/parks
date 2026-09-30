import { experiences } from "../data";
import type { Experience } from "../data/schema";
import type { Profile } from "./profile";
import {
  matchesFilters as matchesShared,
  type SearchFilters as SharedFilters,
} from "../../../../packages/shared/src/filters";
import { rideFacts } from "./ride-facts";

/**
 * The recommendation engine, and the only place experiences are selected.
 *
 * It is deterministic on purpose. Every line of a recommendation traces to a
 * column in the workbook, so the product cannot answer from anything it does not
 * hold — the brief's first iron rule, enforced by construction rather than by a
 * prompt. A model layer for free-form questions would sit above this and call
 * searchExperiences as its tool, not replace it.
 */

/**
 * The shared filter rules (packages/shared/src/filters.ts), plus the two lookups the web app
 * matches by its own names: the parks and the land.
 */
export interface SearchFilters extends SharedFilters {
  parks?: string[];
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
  const { parks, land, ...rules } = filters;
  if (parks?.length && !parks.includes(e.park)) return false;
  if (land && e.land !== land) return false;
  // The rules themselves — unrated never answers intensity, unchecked sensitivity is out by
  // default, "na" is an answer — are shared with Tim's query_rides.
  return matchesShared(rideFacts(e), rules);
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
    /**
     * Rides held back only because a sensitivity the group named was never
     * checked on them.
     *
     * ⚠️ This number has to reach the screen. Silently dropping them would let
     * a short list read as "that is all there is", when what happened is that
     * Tim does not know — and "I do not know about 14 more" is a different
     * sentence from "there are no others".
     */
    sensitivityUncheckedExcluded: number;
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
    sensitivityUncheckedExcluded: 0,
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
    avoidSensitivities: profile.sensitivities,
    includeUncheckedSensitivity: profile.includeUncheckedSensitivity,
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

  // Counted by re-running the same filters with the unchecked rows allowed back
  // in, rather than by a second hand-written predicate that could drift from
  // matchesFilters. The difference is exactly what the strictness cost.
  const sensitivityUncheckedExcluded =
    profile.sensitivities.length && !profile.includeUncheckedSensitivity
      ? searchExperiences({
          parks,
          kinds: profile.kinds,
          intensityMin: profile.intensityMin,
          intensityMax: profile.intensityMax,
          includeUnrated: profile.includeUnrated,
          excludeSinglePass: profile.onlyIncludedInPass,
          avoidSensitivities: profile.sensitivities,
          includeUncheckedSensitivity: true,
        }).length - matches.length
      : 0;

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
      sensitivityUncheckedExcluded,
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
    avoidSensitivities: profile.sensitivities,
    includeUncheckedSensitivity: profile.includeUncheckedSensitivity,
  }).length;
}
