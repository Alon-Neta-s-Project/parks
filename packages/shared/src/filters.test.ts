import { describe, expect, it } from "vitest";
import { classify, matchesFilters, sensitivityState, type RideFacts } from "./filters";

/**
 * The rules are tested on constructed rows, not the data: they must keep holding when the live
 * data happens to contain no unrated ride, no unchecked flag — a new ride arrives without them.
 */
const ride = (over: Partial<RideFacts> = {}): RideFacts => ({
  kind: "attraction", state: "open", singlePassRequired: false, intensity: 2,
  sensEnclosedDark: "false", sensLoudSudden: "false", sensStrobe: "false", sensHeights: "false",
  motionSicknessWarning: "false", wheelchair: "remain_in_wheelchair", minCm: 0, maxCm: null,
  ...over,
});

describe("intensity", () => {
  it("never answers an intensity question with an unrated ride — even with includeUnrated", () => {
    expect(classify(ride({ intensity: null }), { intensityMax: 2 })).toBe("unrated");
    expect(classify(ride({ intensity: null }), { intensityMax: 2, includeUnrated: true })).toBe("unrated");
  });

  it("lists an unrated ride only when asked to, and only with no bound", () => {
    expect(matchesFilters(ride({ intensity: null }), {})).toBe(false);
    expect(matchesFilters(ride({ intensity: null }), { includeUnrated: true })).toBe(true);
  });

  it("keeps a rated ride inside the bounds", () => {
    expect(classify(ride({ intensity: 3 }), { intensityMax: 2 })).toBe("no");
    expect(classify(ride({ intensity: 2 }), { intensityMin: 1, intensityMax: 2 })).toBe("match");
  });
});

describe("sensitivities", () => {
  it("drops a flagged ride", () => {
    expect(classify(ride({ sensEnclosedDark: "true" }), { avoidSensitivities: ["dark"] })).toBe("no");
  });

  it("holds back an unchecked ride by default — and says it was the unknown", () => {
    expect(classify(ride({ sensLoudSudden: null }), { avoidSensitivities: ["loudSudden"] })).toBe("sensitivityUnchecked");
    expect(matchesFilters(ride({ sensLoudSudden: null }), { avoidSensitivities: ["loudSudden"], includeUncheckedSensitivity: true })).toBe(true);
  });

  it("reads 'na' as an answer — a show is not unchecked", () => {
    expect(sensitivityState(ride({ sensHeights: "na" }), "heights")).toBe("notApplicable");
    expect(matchesFilters(ride({ kind: "entertainment", sensHeights: "na" }), { avoidSensitivities: ["heights"] })).toBe(true);
  });

  it("keeps a 'depends' ride in: a transfer is about the person", () => {
    expect(sensitivityState(ride({ wheelchair: "transfer_to_ride_vehicle" }), "accessibility")).toBe("depends");
    expect(matchesFilters(ride({ wheelchair: "transfer_to_ride_vehicle" }), { avoidSensitivities: ["accessibility"] })).toBe(true);
  });

  it("a known 'no' wins over an unknown", () => {
    expect(classify(ride({ sensLoudSudden: null, sensEnclosedDark: "true" }), { avoidSensitivities: ["loudSudden", "dark"] })).toBe("no");
  });
});

describe("motion sickness", () => {
  it("never sweeps an unknown into either answer", () => {
    expect(matchesFilters(ride({ motionSicknessWarning: null }), { hasMotionSicknessWarning: false })).toBe(false);
    expect(matchesFilters(ride({ motionSicknessWarning: "na" }), { hasMotionSicknessWarning: true })).toBe(false);
    expect(matchesFilters(ride({ motionSicknessWarning: "false" }), { hasMotionSicknessWarning: false })).toBe(true);
  });
});

describe("closed, kind, Single Pass", () => {
  it("drops closed but keeps 'check'", () => {
    expect(matchesFilters(ride({ state: "closed" }), {})).toBe(false);
    expect(matchesFilters(ride({ state: "check" }), {})).toBe(true);
    expect(matchesFilters(ride({ state: "closed" }), { includeClosed: true })).toBe(true);
  });

  it("filters by kind and Single Pass on request", () => {
    expect(matchesFilters(ride({ kind: "entertainment" }), { kinds: ["attraction"] })).toBe(false);
    expect(matchesFilters(ride({ singlePassRequired: true }), { excludeSinglePass: true })).toBe(false);
  });
});

/** New with query_rides (30.09): the height, by the shared rule (fit.ts). */
describe("height", () => {
  it("keeps a ride this height can ride", () => {
    expect(classify(ride({ minCm: 102 }), { heightCm: 110 })).toBe("match");
    expect(classify(ride({ minCm: 0 }), { heightCm: 90 })).toBe("match");
  });

  it("drops a ride that is known not to fit — too short or too tall", () => {
    expect(classify(ride({ minCm: 122 }), { heightCm: 110 })).toBe("no");
    expect(classify(ride({ minCm: 0, maxCm: 122 }), { heightCm: 130 })).toBe("no");
  });

  it("never turns an unchecked floor into a match — it is counted as unknown", () => {
    expect(classify(ride({ minCm: null }), { heightCm: 110 })).toBe("heightUnknown");
    // Decision 2, C: a ceiling with an unchecked floor is not a match either.
    expect(classify(ride({ minCm: null, maxCm: 122 }), { heightCm: 100 })).toBe("heightUnknown");
  });
});
