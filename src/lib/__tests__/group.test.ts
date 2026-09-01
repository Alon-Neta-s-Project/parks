import { describe, expect, it } from "vitest";
import { experiences } from "../../data";
import type { Experience } from "../../data/schema";
import { fitFor, hasMinors, needsHeight, type Member } from "../group";

const ride = (heightRequirementCm: Experience["heightRequirementCm"]): Experience =>
  ({ ...experiences[0]!, heightRequirementCm }) as Experience;

const adult: Member = { id: "a", age: 38, heightCm: null };
const child = (age: number, heightCm: number | null): Member => ({ id: `c${age}`, age, heightCm });

describe("who can ride", () => {
  it("treats a limit of 0 as suits everyone", () => {
    expect(fitFor(ride(0), [adult, child(4, 100)]).fit).toBe("everyone");
  });

  it("treats an unchecked limit as unknown, never as suits everyone", () => {
    // The whole point of migration 012's three states.
    const result = fitFor(ride(null), [adult, child(4, 100)]);
    expect(result.fit).toBe("unknown");
    expect(result.canRide).toHaveLength(0);
  });

  it("splits the group when only some clear the limit", () => {
    const result = fitFor(ride(112), [adult, child(11, 140), child(5, 100)]);
    expect(result.fit).toBe("some");
    expect(result.canRide.map((m) => m.id)).toEqual(["a", "c11"]);
    expect(result.cannotRide.map((m) => m.id)).toEqual(["c5"]);
  });

  it("lets adults clear any limit without being measured", () => {
    expect(fitFor(ride(200), [adult]).fit).toBe("everyone");
  });

  it("is unknown while any child under 14 has no height", () => {
    const result = fitFor(ride(102), [adult, child(7, null)]);
    expect(result.fit).toBe("unknown");
    expect(result.unmeasured.map((m) => m.id)).toEqual(["c7"]);
  });

  it("is unknown before anyone is known", () => {
    expect(fitFor(ride(102), []).fit).toBe("unknown");
  });
});

describe("what we ask, and of whom", () => {
  it("asks height only below 14", () => {
    expect(needsHeight(child(13, null))).toBe(true);
    expect(needsHeight(child(14, null))).toBe(false);
    expect(needsHeight(adult)).toBe(false);
    expect(needsHeight(child(7, 120))).toBe(false);
  });

  it("derives whether there are minors instead of storing it", () => {
    expect(hasMinors([adult])).toBe(false);
    expect(hasMinors([adult, child(9, 130)])).toBe(true);
  });

  it("holds no name and no date of birth", () => {
    expect(Object.keys(child(7, 120)).sort()).toEqual(["age", "heightCm", "id"]);
  });
});

describe("what the memory screen must allow", () => {
  it("keeps members individually addressable, so one row can be fixed alone", () => {
    // The group arrives as one sentence — "me, my husband and three kids aged
    // 4, 7 and 11" — and becomes five rows. When that extraction gets one wrong,
    // only that row should need correcting.
    const group: Member[] = [
      { id: "m0", age: 38, heightCm: null },
      { id: "m1", age: 4, heightCm: 95 },
      { id: "m2", age: 7, heightCm: 118 },
    ];
    expect(new Set(group.map((m) => m.id)).size).toBe(group.length);

    const corrected = group.map((m) => (m.id === "m1" ? { ...m, heightCm: 102 } : m));
    expect(corrected.find((m) => m.id === "m1")?.heightCm).toBe(102);
    expect(corrected.find((m) => m.id === "m2")?.heightCm).toBe(118);

    const removed = group.filter((m) => m.id !== "m1");
    expect(removed.map((m) => m.id)).toEqual(["m0", "m2"]);
  });

  it("changes who can ride the moment a height is corrected", () => {
    // Which is exactly why the fit tag is derived and never stored.
    const before: Member[] = [{ id: "c", age: 6, heightCm: 100 }];
    const after: Member[] = [{ id: "c", age: 6, heightCm: 120 }];
    expect(fitFor(ride(112), before).fit).toBe("some");
    expect(fitFor(ride(112), after).fit).toBe("everyone");
  });
});
