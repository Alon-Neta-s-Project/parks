import type { Experience } from "../data/schema";
import type { RideFacts } from "../../../../packages/shared/src/filters";

/** A web experience, as the shared filter rules read it (packages/shared/src/filters.ts). */
export const rideFacts = (e: Experience): RideFacts => ({
  kind: e.kind,
  state: e.status.state,
  singlePassRequired: e.fastAccess.singlePassRequired,
  intensity: e.intensity.rated ? (e.intensity.value as number) : null,
  sensEnclosedDark: e.sensEnclosedDark,
  sensLoudSudden: e.sensLoudSudden,
  sensStrobe: e.sensStrobe,
  sensHeights: e.sensHeights,
  motionSicknessWarning: e.motionSicknessWarning,
  wheelchair: e.wheelchair,
  minCm: e.heightRequirementCm,
  maxCm: e.maxHeightRequirementCm,
});
