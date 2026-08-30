import { describe, expect, it } from "vitest";
import { experiences, parks } from "../../data";
import { experienceSchema, parkSchema } from "../../data/schema";

describe("dataset", () => {
  it("every row validates against the schema", () => {
    for (const e of experiences) {
      const parsed = experienceSchema.safeParse(e);
      if (!parsed.success) throw new Error(`${e.id}: ${parsed.error.issues[0]?.message}`);
    }
    for (const p of parks) expect(parkSchema.safeParse(p).success).toBe(true);
  });

  it("holds only attractions and entertainment", () => {
    expect(experiences).toHaveLength(232);
    expect(new Set(experiences.map((e) => e.kind))).toEqual(
      new Set(["attraction", "entertainment"]),
    );
  });

  it("ids are unique, so the slug rule survives repeat imports", () => {
    expect(new Set(experiences.map((e) => e.id)).size).toBe(experiences.length);
  });

  it("unrated intensity is null, never zero", () => {
    for (const e of experiences) {
      if (e.intensity.rated) expect(e.intensity.value).toBeGreaterThan(0);
      else expect(e.intensity.value).toBeNull();
    }
    expect(experiences.filter((e) => e.intensity.rated)).toHaveLength(107);
  });

  it("carries no invented content", () => {
    for (const e of experiences) {
      expect(e.heightMinCm).toBeNull();
      expect(e.sensitivities).toBeNull();
      expect(e.editorial).toBeNull();
      expect(e.youtubeId).toBeNull();
      expect(e.nameHe).toBeNull();
    }
  });

  it("every row cites at least one source and a verification date", () => {
    for (const e of experiences) {
      expect(e.sources.length).toBeGreaterThan(0);
      expect(e.sourceVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("intensity ratings only ever cite the aggregator tier", () => {
    for (const e of experiences) {
      const intensitySource = e.sources.find((s) => s.role === "intensity");
      expect(intensitySource?.tier).toBe(4);
    }
  });
});
