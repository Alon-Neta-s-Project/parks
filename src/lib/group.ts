import type { Experience } from "../data/schema";

/**
 * The travelling group: one row per person, matching trip_member.
 *
 * What is deliberately not here: names and dates of birth. Age is a number, and
 * height is asked only for someone under 14 — an adult clears every height limit,
 * so asking is both useless and intrusive. Dropping names is what makes this a
 * technical constraint on a rider rather than a profile of a child, and that is
 * the distinction that justifies collecting it at all.
 */
export const HEIGHT_ASK_BELOW_AGE = 14;

export interface Member {
  /** Local identity for editing and deletion. Not a name. */
  id: string;
  age: number;
  /** Centimetres. Only ever collected when age < HEIGHT_ASK_BELOW_AGE. */
  heightCm: number | null;
}

export const needsHeight = (m: Member) => m.age < HEIGHT_ASK_BELOW_AGE && m.heightCm === null;

/** Derived at run time; there is no "has children" field to fall out of sync. */
export const hasMinors = (members: Member[]) =>
  members.some((m) => m.age < HEIGHT_ASK_BELOW_AGE);

export type Fit = "everyone" | "some" | "unknown";

export interface FitResult {
  fit: Fit;
  /** Members who clear the limit. Empty when unknown. */
  canRide: Member[];
  /** Members below the limit. Empty when unknown. */
  cannotRide: Member[];
  /** Members under 14 whose height we never got, so cannot be placed. */
  unmeasured: Member[];
}

/**
 * Who in this group can ride this experience.
 *
 * Derived every time from trip_member against height_requirement_cm. It is
 * deliberately not a stored field: a second source of truth would break the
 * moment someone corrects a child's height.
 *
 * The three states of height_requirement_cm carry through exactly:
 *   0    — checked, no limit at all
 *   50.. — the limit
 *   null — NOT CHECKED, which is never "suits everyone". It is "unknown".
 */
export function fitFor(experience: Experience, members: Member[]): FitResult {
  const limit = experience.heightRequirementCm;
  const empty = { canRide: [], cannotRide: [], unmeasured: [] };

  // Not checked is not a clean bill of health.
  if (limit === null) return { fit: "unknown", ...empty };
  if (!members.length) return { fit: "unknown", ...empty };

  if (limit === 0) {
    return { fit: "everyone", canRide: members, cannotRide: [], unmeasured: [] };
  }

  const unmeasured = members.filter((m) => m.age < HEIGHT_ASK_BELOW_AGE && m.heightCm === null);
  // An adult clears every limit in the data without being measured.
  const measured = members.filter((m) => !unmeasured.includes(m));
  const canRide = measured.filter((m) => m.age >= HEIGHT_ASK_BELOW_AGE || (m.heightCm ?? 0) >= limit);
  const cannotRide = measured.filter((m) => !canRide.includes(m));

  // A gap in the group's own data is also "unknown" — claiming everyone fits
  // while one child is unmeasured is exactly the false promise to avoid.
  if (unmeasured.length) return { fit: "unknown", canRide, cannotRide, unmeasured };

  return { fit: cannotRide.length ? "some" : "everyone", canRide, cannotRide, unmeasured: [] };
}
