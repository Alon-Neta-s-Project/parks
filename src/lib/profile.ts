import type { IntensityLevel } from "../data/schema";
import type { Member } from "./group";

/**
 * What Tim learns about this trip.
 *
 * Three onboarding questions, then he answers. The axes that only matter later
 * — how thoroughly to work a park, where to stay — are asked in context, when
 * the subject actually comes up. There is no reason to spend an opening question
 * on a recommendation nobody is asking for yet.
 */
export interface Profile {
  /** What is worth planning in depth. "both" is a real answer, not a fallback. */
  planningFocus: "fit" | "cost" | "both" | null;
  members: Member[];
  /** Been to this park or resort before. Saves explaining the basics to a veteran. */
  visitedBefore: boolean | null;

  parks: string[];
  intensityMin: IntensityLevel | null;
  intensityMax: IntensityLevel | null;
  kinds: ("attraction" | "entertainment")[];
  hasFastAccess: boolean | null;
  onlyIncludedInPass: boolean;
  condensed: boolean;
  includeUnrated: boolean;

  /**
   * Which questions Tim has already asked twice and let go.
   *
   * Iron rule five is satisfied by asking, not by being answered. Someone who
   * skips a question gets one more attempt, then a recommendation built from
   * what is known with the gap stated outright — and Tim never raises it again.
   * There is a segment that does not plan by choice and is happy that way, and
   * pressing them is what drives them off.
   */
  askedAndDropped: string[];
}

export const emptyProfile: Profile = {
  planningFocus: null,
  members: [],
  visitedBefore: null,
  parks: [],
  intensityMin: null,
  intensityMax: null,
  kinds: ["attraction", "entertainment"],
  hasFastAccess: null,
  onlyIncludedInPass: false,
  condensed: false,
  includeUnrated: false,
  askedAndDropped: [],
};

export interface Option {
  id: string;
  patch: Partial<Profile>;
}

export interface Question {
  id: string;
  /** Choices come from the dataset rather than the list below. */
  source?: "parks";
  /** Answered by building rows rather than picking an option. */
  kind?: "members";
  multi?: boolean;
  /** Free text is always available beside the chips. */
  freeText?: boolean;
  options?: Option[];
}

/**
 * The three opening questions, in this order.
 *
 * Planning focus comes first deliberately: it is not personal at all, and it
 * gives Tim a chance to show he understood — "so let's focus on which rides
 * suit you" — before he asks anything about children. The same principle as
 * fact before opinion, here as easy before personal.
 *
 * Marked as a product judgement rather than a research finding: no interview
 * tested question order.
 */
export const questions: Question[] = [
  {
    id: "planningFocus",
    freeText: true,
    options: [
      { id: "fit", patch: { planningFocus: "fit" } },
      { id: "cost", patch: { planningFocus: "cost" } },
      // Shown with exactly the weight of the other two: a common, legitimate
      // answer, not the thing you land on by not choosing.
      { id: "both", patch: { planningFocus: "both" } },
    ],
  },
  { id: "group", kind: "members", freeText: true },
  {
    id: "visitedBefore",
    options: [
      { id: "yes", patch: { visitedBefore: true } },
      { id: "no", patch: { visitedBefore: false } },
    ],
  },
];

export const applyPatch = (profile: Profile, patch: Partial<Profile>): Profile => ({
  ...profile,
  ...patch,
});

/** A question already asked twice and let go is never raised again. */
export const isDropped = (profile: Profile, questionId: string) =>
  profile.askedAndDropped.includes(questionId);
