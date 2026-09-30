/**
 * Who can ride — **the one place the height rule lives**, for the screen (`FitTag`) and for Tim.
 *
 * 🔴 **Until 30.09 the rule was written twice, and the two disagreed.** The web app's `fitFor`
 * ignored the ceiling (a 140 cm child "fit" a toddler area of 122); the SQL `CASE` in
 * `find_experiences` said "fits" on a ceiling with an unchecked floor. Alon's decisions (30.09):
 *   1. the ceiling applies everywhere;
 *   1b. an adult — whose height is never collected — clears every floor, and no ceiling;
 *   2 (option C). a ceiling with an unchecked floor is **never "fits"**: below the ceiling is
 *      said in words, and the floor stays "unknown whether it exists".
 *
 * Derived every time, never stored: a stored tag goes stale the moment a child's height is
 * corrected. The floor's three states carry through exactly (CLAUDE.md):
 *   0     — checked, no limit
 *   50..  — the limit
 *   null  — NOT CHECKED, which is never "suits everyone"
 */

/** Height is collected only below this age (CLAUDE.md: height only under 14). */
export const HEIGHT_ASK_BELOW_AGE = 14;

export interface Member {
  /** Local identity for editing and deletion. Not a name. */
  id: string;
  age: number;
  /** Centimetres. Only ever collected when age < HEIGHT_ASK_BELOW_AGE. */
  heightCm: number | null;
}

/** A ride's two height limits. `maxCm` null is "no ceiling" — a ceiling is only ever recorded when verified. */
export interface HeightLimits {
  minCm: number | null;
  maxCm: number | null;
}

export type Fit = "everyone" | "some" | "unknown";

export interface FitResult {
  fit: Fit;
  /** Members who clear every limit. */
  canRide: Member[];
  /** Members below the floor or above the ceiling. */
  cannotRide: Member[];
  /** Members under 14 whose height we never got, so cannot be placed. */
  unmeasured: Member[];
  /**
   * Decision 2 (C): below the ceiling, while the floor was never checked. **Never counted in
   * `canRide`** — said apart, so the screen can say what is known before what is missing.
   */
  underCeiling: Member[];
}

const isAdult = (m: Member) => m.age >= HEIGHT_ASK_BELOW_AGE;

/** Who in this group can ride. */
export function fitFor({ minCm, maxCm }: HeightLimits, members: Member[]): FitResult {
  const none = { canRide: [], cannotRide: [], unmeasured: [], underCeiling: [] };
  if (!members.length) return { fit: "unknown", ...none };
  // Not checked, and no ceiling to say anything with: a clean bill of health it is not.
  if (minCm === null && maxCm === null) return { fit: "unknown", ...none };

  const unmeasured = members.filter((m) => !isAdult(m) && m.heightCm === null);
  const measured = members.filter((m) => !unmeasured.includes(m));

  const aboveCeiling = (m: Member) => maxCm !== null && (isAdult(m) || m.heightCm! > maxCm);
  const clearsFloor = (m: Member) => isAdult(m) || minCm === 0 || m.heightCm! >= minCm!;

  if (minCm === null) {
    // Decision 2 (C): what is known — too tall, or not — and never "fits".
    const cannotRide = measured.filter(aboveCeiling);
    const underCeiling = measured.filter((m) => !aboveCeiling(m));
    return { fit: "unknown", canRide: [], cannotRide, unmeasured, underCeiling };
  }

  const canRide = measured.filter((m) => !aboveCeiling(m) && clearsFloor(m));
  const cannotRide = measured.filter((m) => !canRide.includes(m));
  // A gap in the group's own data is also "unknown" — claiming everyone fits while one child
  // is unmeasured is exactly the false promise to avoid.
  if (unmeasured.length) return { fit: "unknown", canRide, cannotRide, unmeasured, underCeiling: [] };
  return { fit: cannotRide.length ? "some" : "everyone", canRide, cannotRide, unmeasured: [], underCeiling: [] };
}

/**
 * One height against a ride — what Tim has when the question gives a height.
 *
 * `null`: no height was given. Every other state has its own word, so no state reaches the
 * family as silence (CLAUDE.md: silence about a value reads as its absence).
 */
export type HeightFit = "fits" | "too_short" | "too_tall" | "unknown" | "under_ceiling_floor_unknown";

export function heightFit({ minCm, maxCm }: HeightLimits, heightCm: number | null): HeightFit | null {
  if (heightCm === null) return null;
  // Ruling out before fitting: above the ceiling is "no", however far above the floor.
  if (maxCm !== null && heightCm > maxCm) return "too_tall";
  if (minCm === null) return maxCm !== null ? "under_ceiling_floor_unknown" : "unknown";
  return minCm === 0 || heightCm >= minCm ? "fits" : "too_short";
}

/** The yes/no a check needs: only a checked answer is `true` or `false`. */
export const heightFitsAsBoolean = (f: HeightFit | null): boolean | null =>
  f === "fits" ? true : f === "too_short" || f === "too_tall" ? false : null;
