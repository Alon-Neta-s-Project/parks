import type { IntensityLevel } from "../data/schema";
import type { Profile } from "./profile";

/**
 * What the conversation can do after the first recommendation.
 *
 * This is also where the questions that used to come before the answer now
 * live: queue-skipping and list length are only meaningful once there is a list
 * to apply them to, so they are asked here, in context.
 *
 * Each refinement is a named, reversible change to the profile — the same shape
 * as an answer to an opening question, so the whole conversation stays one
 * mechanism. Like the questions, these are config rather than code, and each one
 * is offered only when it would actually change something.
 */
export interface Refinement {
  id: string;
  /** Hide options that would be a no-op or would empty the list. */
  offered: (profile: Profile) => boolean;
  apply: (profile: Profile) => Profile;
}

const clamp = (level: number): IntensityLevel =>
  Math.min(4, Math.max(1, level)) as IntensityLevel;

export const refinements: Refinement[] = [
  {
    id: "onlyAttractions",
    offered: (p) => p.kinds.length > 1,
    apply: (p) => ({ ...p, kinds: ["attraction"] }),
  },
  {
    id: "onlyShows",
    offered: (p) => p.kinds.length > 1,
    apply: (p) => ({ ...p, kinds: ["entertainment"] }),
  },
  {
    id: "bothKinds",
    offered: (p) => p.kinds.length === 1,
    apply: (p) => ({ ...p, kinds: ["attraction", "entertainment"] }),
  },
  {
    id: "calmer",
    // Never below 1: an empty list is not a gentler answer.
    offered: (p) => (p.intensityMax ?? 4) > 1,
    apply: (p) => ({ ...p, intensityMax: clamp((p.intensityMax ?? 4) - 1), intensityMin: null }),
  },
  {
    id: "bolder",
    offered: (p) => (p.intensityMax ?? 4) < 4,
    apply: (p) => ({ ...p, intensityMax: clamp((p.intensityMax ?? 1) + 1) }),
  },
  {
    id: "hasFastAccess",
    offered: (p) => p.hasFastAccess === null,
    apply: (p) => ({ ...p, hasFastAccess: true }),
  },
  {
    id: "condensed",
    offered: (p) => !p.condensed,
    apply: (p) => ({ ...p, condensed: true }),
  },
  {
    id: "full",
    offered: (p) => p.condensed,
    apply: (p) => ({ ...p, condensed: false }),
  },
  {
    id: "onlyIncluded",
    // Only worth offering once we know they hold a pass at all.
    offered: (p) => !p.onlyIncludedInPass && p.hasFastAccess === true,
    apply: (p) => ({ ...p, onlyIncludedInPass: true }),
  },
  {
    id: "allAccess",
    offered: (p) => p.onlyIncludedInPass,
    apply: (p) => ({ ...p, onlyIncludedInPass: false }),
  },
];

export const refinementById = (id: string): Refinement | undefined =>
  refinements.find((r) => r.id === id);
