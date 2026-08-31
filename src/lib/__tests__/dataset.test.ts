import { readdirSync } from "node:fs";
import { join } from "node:path";
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
    // The count moves with every export; what must hold is that rated and
    // valued always agree.
    const rated = experiences.filter((e) => e.intensity.rated);
    expect(rated.length).toBeGreaterThan(0);
    expect(rated.every((e) => e.intensity.value !== null)).toBe(true);
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
      "bigDrops", "spinning", "airConditioned",
      "isMotionSimulator", "usesLargeScreensOr3d", "motionSicknessWarning",
    ] as const;
    for (const e of experiences) {
      for (const f of quad) {
        expect([null, "true", "false", "na"]).toContain(e[f]);
      }
      // gets_wet is a three-value enum, not four-state, and null means unchecked
      // rather than "does not get you wet".
      expect([null, "none", "may_get_wet", "may_get_soaked"]).toContain(e.getsWet);
    }
  });

  it("keeps height to the three states migration 012 defines", () => {
    // 0 = checked, no limit. 50-200 = the limit. null = not checked.
    // Nothing in between, and never a number below 50 that is not zero.
    for (const e of experiences) {
      const h = e.heightRequirementCm;
      if (h === null) continue;
      expect(h === 0 || (h >= 50 && h <= 200)).toBe(true);
    }
    expect(experiences.some((e) => e.heightRequirementCm === 0)).toBe(true);
  });
});

describe("the master never reaches the repo", () => {
  it("keeps data/source to the export and what describes it", () => {
    const allowed = new Set([
      "product_export.csv",
      "product_export_manifest.json",
      "subtype_map.json",
      "subtype_vocab_review.csv",
    ]);
    for (const file of readdirSync(join(process.cwd(), "data/source"))) {
      expect(allowed).toContain(file);
    }
  });

  it("has no field that could name a source", () => {
    const forbidden = /source|basis|tier|url|confidence|calibration|conflict|retrieved/i;
    for (const e of experiences) {
      for (const key of Object.keys(e)) {
        // lastVerified is a date, and a date does not give away where it came from.
        if (key === "lastVerified") continue;
        expect(key).not.toMatch(forbidden);
      }
    }
  });
});
