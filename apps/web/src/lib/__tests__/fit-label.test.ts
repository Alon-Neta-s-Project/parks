import { describe, expect, it } from "vitest";
import he from "../../i18n/he.json";
import { experiences } from "../../data";
import { fitFor, type Member } from "../group";
import { fitLabel } from "../fit-label";

const adult: Member = { id: "a", age: 38, heightCm: null };
const child = (age: number, heightCm: number | null): Member => ({ id: `c${age}`, age, heightCm });
const ride = (nameEn: string) => {
  const e = experiences.find((x) => x.nameEn === nameEn);
  if (!e) throw new Error(`${nameEn} is not in the data`);
  return e;
};
const label = (nameEn: string, members: Member[]) => {
  const e = ride(nameEn);
  return fitLabel(fitFor(e, members), members.length, e.maxHeightRequirementCm);
};

describe("the fit chip, on the real rides with a ceiling", () => {
  // Decision 1: Ketchakiddee Creek — floor 0, ceiling 122.
  it("does not tell an 11-year-old of 140 cm that a toddler area fits", () => {
    const l = label("Ketchakiddee Creek", [child(5, 110), child(11, 140)]);
    expect([l.key, l.values]).toEqual(["some", { count: 1, total: 2 }]);
    expect(l.why?.key).toBe("ceilingWhy");
  });

  // Decision 1b: Bay Slides — floor 0, ceiling 152.
  it("counts the adult out on a ride with a ceiling, and says why", () => {
    const l = label("Bay Slides", [adult, child(6, 115)]);
    expect([l.key, l.values, l.why]).toEqual(["some", { count: 1, total: 2 }, { key: "ceilingWhy", values: { max: 152 } }]);
  });

  // Decision 2, C: Tot Tiki Reef — floor not checked, ceiling 122.
  it("says who is not too tall, then that the floor is unknown — and never 'fits'", () => {
    const l = label("Tot Tiki Reef", [adult, child(4, 100)]);
    expect([l.key, l.values, l.tone]).toEqual(["underCeiling", { count: 1, total: 2 }, "missing"]);
    expect(l.why).toEqual({ key: "underCeilingWhy", values: { max: 122 } });
  });

  it("keeps the missing child's height first when there is one", () => {
    expect(label("Tot Tiki Reef", [child(4, 100), child(7, null)]).why?.key).toBe("unmeasuredWhy");
  });
});

describe("the fit chip, on a ride with no ceiling (unchanged)", () => {
  const plain = experiences.find((e) => e.maxHeightRequirementCm === null && typeof e.heightRequirementCm === "number" && e.heightRequirementCm > 0)!;
  it("says everyone, with no ceiling explanation", () => {
    const l = fitLabel(fitFor(plain, [adult]), 1, null);
    expect([l.key, l.why]).toEqual(["everyone", undefined]);
  });
});

it("every key the chip can say exists in he.json", () => {
  for (const k of ["everyone", "some", "unknown", "underCeiling", "unknownWhy", "unmeasuredWhy", "underCeilingWhy", "ceilingWhy"]) {
    expect((he.fit as Record<string, string>)[k], k).toBeTruthy();
  }
});
