import type { IntensityLevel } from "../data/schema";

/**
 * What Tim learns from the opening questions.
 *
 * Deliberately does not hold ages or heights (brief §9.4). Group composition is
 * asked at a general level and mapped straight onto an intensity range, which is
 * a property of the ride rather than of the person, so nothing about a child is
 * stored to make the filter work.
 */
export interface Profile {
  /** Whether Tim proposes a plan at all, or only surfaces things worth knowing. */
  plannerType: "plans" | "flows" | null;
  resort: "Disney World" | "Universal Orlando" | "both" | null;
  parks: string[];
  intensityMin: IntensityLevel | null;
  intensityMax: IntensityLevel | null;
  kinds: ("attraction" | "entertainment")[];
  /** Holds a paid Lightning Lane / Express product. */
  hasFastAccess: boolean | null;
  /** Willing to pay separately for a Single Pass ride. */
  paysExtra: boolean | null;
  /** Unrated rides are hidden by default, never silently — the count is shown. */
  includeUnrated: boolean;
}

export const emptyProfile: Profile = {
  plannerType: null,
  resort: null,
  parks: [],
  intensityMin: null,
  intensityMax: null,
  kinds: ["attraction", "entertainment"],
  hasFastAccess: null,
  paysExtra: null,
  includeUnrated: false,
};

/**
 * The opening questions, as data rather than code (brief §3.7), so the set can
 * change without touching the chat.
 *
 * Every question maps onto a column the workbook actually has. Sensitivities and
 * height limits are not asked, because we hold no data to answer them with and a
 * question you cannot act on is worse than an admitted gap — the chat says so
 * outright instead.
 */
export interface Option {
  id: string;
  patch: Partial<Profile>;
}

export interface Question {
  id: string;
  /** Options come from the dataset instead of this list. */
  source?: "parks";
  multi?: boolean;
  options?: Option[];
}

export const questions: Question[] = [
  {
    id: "plannerType",
    options: [
      { id: "plans", patch: { plannerType: "plans" } },
      { id: "flows", patch: { plannerType: "flows" } },
    ],
  },
  {
    id: "resort",
    options: [
      { id: "disney", patch: { resort: "Disney World", parks: [] } },
      { id: "universal", patch: { resort: "Universal Orlando", parks: [] } },
      { id: "both", patch: { resort: "both", parks: [] } },
    ],
  },
  { id: "parks", source: "parks", multi: true },
  {
    id: "group",
    options: [
      // Ranges, not ages. A ceiling of 2 is the gentlest half of the scale.
      { id: "youngKids", patch: { intensityMin: null, intensityMax: 2 } },
      { id: "mixed", patch: { intensityMin: null, intensityMax: 3 } },
      { id: "adults", patch: { intensityMin: null, intensityMax: 4 } },
      { id: "thrill", patch: { intensityMin: 3, intensityMax: 4 } },
    ],
  },
  {
    id: "access",
    options: [
      { id: "payExtra", patch: { hasFastAccess: true, paysExtra: true } },
      { id: "multiOnly", patch: { hasFastAccess: true, paysExtra: false } },
      { id: "standby", patch: { hasFastAccess: false, paysExtra: false } },
    ],
  },
];

export const applyPatch = (profile: Profile, patch: Partial<Profile>): Profile => ({
  ...profile,
  ...patch,
});
