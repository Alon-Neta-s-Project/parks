import type { IntensityLevel } from "../data/schema";
import type { Member } from "./group";

/**
 * What Tim learns about this trip.
 *
 * Six onboarding questions, then he answers. The axes that only matter later —
 * which park to work today, where to stay — are asked in context, when the
 * subject actually comes up. There is no reason to spend an opening question on
 * a recommendation nobody is asking for yet.
 *
 * ⚠️ Six, not three. The earlier three were a product decision that has been
 * superseded (Paula, 03.09): who is travelling, what kind of rides, which
 * worlds, how many park days, visit style, dates. Planning focus and "been
 * here before" are gone — not deferred.
 */
export interface Profile {
  members: Member[];

  /**
   * What kind of rides this family is drawn to. Multi-select, and the three are
   * not a scale: a family can want the big coasters *and* the calm rides and
   * mean both.
   *
   * ⚠️ Kept as the answer, not as an intensity range. Collapsing "thrill and
   * gentle, nothing in between" into min/max would silently widen it to include
   * everything between them, which is the opposite of what was said.
   */
  attractionTypes: ("thrill" | "family" | "gentle")[];

  /** Worlds and characters the family loves. Chips plus whatever they type. */
  worlds: string[];

  /** ⚠️ "unsure" is an answer. Plenty of people book parks before dates. */
  parkDays: number | "unsure" | null;

  /** How they like to experience a park. Not a speed setting — a temperament. */
  visitStyle: "max" | "highlights" | "chill" | null;

  /** ⚠️ Trip dates only. No birth dates, ever (CLAUDE.md). */
  dates: "set" | "flexible" | null;

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
  members: [],
  attractionTypes: [],
  worlds: [],
  parkDays: null,
  visitStyle: null,
  dates: null,
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
 * The six opening questions, in this order (Paula, 03.09).
 *
 * ⚠️ The order is fixed and is not mine to rearrange. "Who is travelling" comes
 * first, and a child's height is asked **in the same breath as their age** —
 * not as a later, separate question. Height is the field that decides what is
 * open to a child at all, and splitting it off makes it feel like screening.
 *
 * ⚠️ Copy marked as draft. Dana may publish final wording, which overrides the
 * phrasing — never the order, the fields, or the number of questions.
 */
export const questions: Question[] = [
  { id: "group", kind: "members", freeText: true },
  {
    id: "attractionTypes",
    multi: true,
    options: [
      { id: "thrill", patch: { attractionTypes: ["thrill"] } },
      { id: "family", patch: { attractionTypes: ["family"] } },
      { id: "gentle", patch: { attractionTypes: ["gentle"] } },
    ],
  },
  {
    // ⚠️ Free text alongside the chips, and it is not decoration: the list of
    // worlds is open, and a family that says "Encanto" must not have to pick
    // the nearest chip instead.
    id: "worlds",
    multi: true,
    freeText: true,
    options: [
      { id: "disneyClassic", patch: { worlds: ["disneyClassic"] } },
      { id: "marvel", patch: { worlds: ["marvel"] } },
      { id: "starWars", patch: { worlds: ["starWars"] } },
      { id: "harryPotter", patch: { worlds: ["harryPotter"] } },
      { id: "animals", patch: { worlds: ["animals"] } },
      { id: "pixar", patch: { worlds: ["pixar"] } },
    ],
  },
  {
    id: "parkDays",
    freeText: true,
    options: [
      { id: "d1", patch: { parkDays: 1 } },
      { id: "d2", patch: { parkDays: 2 } },
      { id: "d3", patch: { parkDays: 3 } },
      { id: "d4", patch: { parkDays: 4 } },
      { id: "d5plus", patch: { parkDays: 5 } },
      // ⚠️ An answer, not a skip. Booking parks before dates is normal, and
      // treating it as "no answer" would make Tim ask again.
      { id: "unsure", patch: { parkDays: "unsure" } },
    ],
  },
  {
    // ⚠️ All three carry equal weight in the copy. "See the highlights without
    // running" is the most common real answer, not the compromise you land on.
    id: "visitStyle",
    options: [
      { id: "max", patch: { visitStyle: "max", condensed: true } },
      { id: "highlights", patch: { visitStyle: "highlights" } },
      { id: "chill", patch: { visitStyle: "chill", condensed: false } },
    ],
  },
  {
    id: "dates",
    options: [
      { id: "set", patch: { dates: "set" } },
      { id: "flexible", patch: { dates: "flexible" } },
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
