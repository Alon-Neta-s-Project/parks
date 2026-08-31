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
      // Held back by decision, not missing by accident.
      expect(e.editorial).toBeNull();
      expect(e.youtubeId).toBeNull();
      expect(e.videoCreator).toBeNull();
    }
  });

  it("every row carries a check date, and no source of any kind", () => {
    for (const e of experiences) {
      expect(e.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Attribution stays in the master. A leak would show up as a URL anywhere
      // in the row.
      expect(JSON.stringify(e)).not.toMatch(/https?:\/\/|www\./);
    }
  });

  it("keeps four-state fields four-state, never collapsing unknown to false", () => {
    const quad = [
      "bigDrops", "spinning", "airConditioned", "getsWet",
      "isMotionSimulator", "usesLargeScreensOr3d", "officialMotionSicknessWarning",
    ] as const;
    for (const e of experiences) {
      for (const f of quad) {
        expect([null, "true", "false", "na"]).toContain(e[f]);
      }
    }
  });

  it("never defaults a ride to having no height limit", () => {
    // "No limit" has to be an explicit finding. With the export still empty,
    // nothing may claim it.
    for (const e of experiences) {
      if (e.noHeightLimit) expect(e.heightRequirementCm).toBeNull();
    }
    expect(experiences.filter((e) => e.noHeightLimit)).toHaveLength(0);
  });
});
