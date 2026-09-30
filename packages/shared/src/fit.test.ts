import { describe, expect, it } from "vitest";
import { fitFor, heightFit, type HeightLimits, type Member } from "./fit";

const limits = (minCm: HeightLimits["minCm"], maxCm: HeightLimits["maxCm"] = null): HeightLimits => ({ minCm, maxCm });
const adult: Member = { id: "a", age: 38, heightCm: null };
const child = (age: number, heightCm: number | null): Member => ({ id: `c${age}`, age, heightCm });
const ids = (ms: Member[]) => ms.map((m) => m.id);

describe("the group — the floor (unchanged)", () => {
  it("treats a limit of 0 as suits everyone", () => {
    expect(fitFor(limits(0), [adult, child(4, 100)]).fit).toBe("everyone");
  });

  it("treats an unchecked limit as unknown, never as suits everyone", () => {
    const r = fitFor(limits(null), [adult, child(4, 100)]);
    expect(r.fit).toBe("unknown");
    expect(r.canRide).toHaveLength(0);
  });

  it("splits the group when only some clear the limit", () => {
    const r = fitFor(limits(112), [adult, child(11, 140), child(5, 100)]);
    expect(r.fit).toBe("some");
    expect(ids(r.canRide)).toEqual(["a", "c11"]);
    expect(ids(r.cannotRide)).toEqual(["c5"]);
  });

  it("lets adults clear any floor without being measured", () => {
    expect(fitFor(limits(200), [adult]).fit).toBe("everyone");
  });

  it("is unknown while any child under 14 has no height", () => {
    const r = fitFor(limits(102), [adult, child(7, null)]);
    expect(r.fit).toBe("unknown");
    expect(ids(r.unmeasured)).toEqual(["c7"]);
  });

  it("is unknown before anyone is known", () => {
    expect(fitFor(limits(102), []).fit).toBe("unknown");
  });
});

/** Decision 1 (Alon, 30.09): the screen applies the ceiling, like Tim already does. */
describe("the group — the ceiling", () => {
  it("keeps a child taller than the ceiling off the ride", () => {
    // Ketchakiddee Creek: floor 0 (checked, none), ceiling 122.
    const r = fitFor(limits(0, 122), [child(5, 110), child(11, 140)]);
    expect(r.fit).toBe("some");
    expect(ids(r.canRide)).toEqual(["c5"]);
    expect(ids(r.cannotRide)).toEqual(["c11"]);
  });

  it("lets a child exactly at the ceiling ride", () => {
    expect(fitFor(limits(0, 122), [child(5, 122)]).fit).toBe("everyone");
  });

  // Decision 1b (Alon, 30.09): an adult clears every floor unmeasured — and, for the same
  // reason, no ceiling. Adults' heights are not collected.
  it("counts an adult as unable to ride a ride with a ceiling", () => {
    const r = fitFor(limits(0, 152), [adult, child(6, 115)]);
    expect(r.fit).toBe("some");
    expect(ids(r.canRide)).toEqual(["c6"]);
    expect(ids(r.cannotRide)).toEqual(["a"]);
  });
});

/**
 * Decision 2, option C (Alon, 30.09): a ceiling and no checked floor. Below the ceiling is
 * said, and is **never** "fits" — no one checked there is no floor (CLAUDE.md: NULL is never
 * "suits everyone"). Tike's Peak, Runamukka Reef, Tot Tiki Reef.
 */
describe("the group — a ceiling with an unchecked floor", () => {
  it("is unknown, with the children below the ceiling named apart from those who can ride", () => {
    const r = fitFor(limits(null, 122), [adult, child(4, 100), child(11, 140)]);
    expect(r.fit).toBe("unknown");
    expect(r.canRide).toEqual([]);
    expect(ids(r.underCeiling)).toEqual(["c4"]);
    expect(ids(r.cannotRide)).toEqual(["a", "c11"]);
  });

  it("stays unknown even when every child is below the ceiling", () => {
    const r = fitFor(limits(null, 122), [child(4, 100)]);
    expect(r.fit).toBe("unknown");
    expect(ids(r.underCeiling)).toEqual(["c4"]);
  });

  it("still names a child with no height as unmeasured", () => {
    const r = fitFor(limits(null, 122), [child(4, 100), child(7, null)]);
    expect(r.fit).toBe("unknown");
    expect(ids(r.unmeasured)).toEqual(["c7"]);
  });

  it("has no one below a ceiling that does not exist", () => {
    expect(fitFor(limits(null), [child(4, 100)]).underCeiling).toEqual([]);
  });
});

/** One height, as Tim gets it from a question. Every state has its own word. */
describe("one height", () => {
  it("has no answer without a height", () => {
    expect(heightFit(limits(112), null)).toBe(null);
  });

  it("fits, or is too short, against a checked floor", () => {
    expect(heightFit(limits(112), 120)).toBe("fits");
    expect(heightFit(limits(112), 112)).toBe("fits");
    expect(heightFit(limits(112), 100)).toBe("too_short");
    expect(heightFit(limits(0), 80)).toBe("fits");
  });

  it("is too tall above the ceiling — before the floor is looked at", () => {
    expect(heightFit(limits(0, 122), 130)).toBe("too_tall");
    expect(heightFit(limits(null, 122), 130)).toBe("too_tall");
    expect(heightFit(limits(0, 122), 122)).toBe("fits");
  });

  it("is unknown with an unchecked floor — never fits", () => {
    expect(heightFit(limits(null), 120)).toBe("unknown");
  });

  // Decision 2, C: until 30.09 Tim said `true` ("fits") here.
  it("is below the ceiling, floor unknown — never fits", () => {
    expect(heightFit(limits(null, 122), 100)).toBe("under_ceiling_floor_unknown");
  });
});
