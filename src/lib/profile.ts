import type { IntensityLevel } from "../data/schema";

/**
 * What Tim knows about this group.
 *
 * Two things are deliberately absent. Ages and heights are never stored (brief
 * §9.4). And intensity is never inferred from who is in the group: a forty-year
 * old can hate roller coasters and a twelve-year old can love them, so the
 * comfortable level is asked directly. Age bears on height eligibility, which is
 * a hard fact about the ride, not a preference.
 */
export interface Profile {
  parks: string[];
  intensityMin: IntensityLevel | null;
  intensityMax: IntensityLevel | null;
  kinds: ("attraction" | "entertainment")[];
  /** Holds a paid queue-skipping product. Asked in context, not up front. */
  hasFastAccess: boolean | null;
  /** Opt-in only — see recommend.ts. */
  onlyIncludedInPass: boolean;
  /** Short list per land rather than everything. */
  condensed: boolean;
  includeUnrated: boolean;
}

export const emptyProfile: Profile = {
  parks: [],
  intensityMin: null,
  intensityMax: null,
  kinds: ["attraction", "entertainment"],
  hasFastAccess: null,
  onlyIncludedInPass: false,
  condensed: false,
  includeUnrated: false,
};

export interface Option {
  id: string;
  patch: Partial<Profile>;
}

export interface Question {
  id: string;
  source?: "parks";
  multi?: boolean;
  options?: Option[];
}

/**
 * Two questions, then an answer.
 *
 * Everything else — queue-skipping, rides versus shows, a shorter list — is
 * asked in context once there is something to apply it to. Five questions before
 * any value is where people leave.
 */
export const questions: Question[] = [
  { id: "parks", source: "parks", multi: true },
  {
    id: "intensity",
    options: [
      { id: "gentle", patch: { intensityMin: null, intensityMax: 1 } },
      { id: "mild", patch: { intensityMin: null, intensityMax: 2 } },
      { id: "medium", patch: { intensityMin: null, intensityMax: 3 } },
      { id: "anything", patch: { intensityMin: null, intensityMax: 4 } },
      { id: "thrillsOnly", patch: { intensityMin: 3, intensityMax: 4 } },
    ],
  },
];

export const applyPatch = (profile: Profile, patch: Partial<Profile>): Profile => ({
  ...profile,
  ...patch,
});
