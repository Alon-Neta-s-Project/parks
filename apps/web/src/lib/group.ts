import type { Experience } from "../data/schema";
// The member shape and the age line live with the height rule (packages/shared/src/fit.ts),
// so the screen and Tim read one definition.
import { HEIGHT_ASK_BELOW_AGE, fitFor as fitLimits, type FitResult, type Member } from "../../../../packages/shared/src/fit";
export { HEIGHT_ASK_BELOW_AGE, type Fit, type FitResult, type Member } from "../../../../packages/shared/src/fit";

/**
 * The travelling group: one row per person, matching trip_member.
 *
 * What is deliberately not here: names and dates of birth. Age is a number, and
 * height is asked only for someone under 14 — an adult clears every floor (and, by
 * the same reckoning, no ceiling: decision 1b, 30.09), so asking is both useless and
 * intrusive. Dropping names is what makes this a
 * technical constraint on a rider rather than a profile of a child, and that is
 * the distinction that justifies collecting it at all.
 */
export const needsHeight = (m: Member) => m.age < HEIGHT_ASK_BELOW_AGE && m.heightCm === null;

/** Derived at run time; there is no "has children" field to fall out of sync. */
export const hasMinors = (members: Member[]) =>
  members.some((m) => m.age < HEIGHT_ASK_BELOW_AGE);

/**
 * Who in this group can ride this experience — the shared rule, fed the two limits.
 * Derived every time from trip_member; never stored (see packages/shared/src/fit.ts).
 */
export function fitFor(experience: Experience, members: Member[]): FitResult {
  return fitLimits({ minCm: experience.heightRequirementCm, maxCm: experience.maxHeightRequirementCm }, members);
}
