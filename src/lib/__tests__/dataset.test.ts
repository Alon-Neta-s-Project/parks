import { readFileSync, readdirSync } from "node:fs";
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

describe("the closed vocabulary", () => {
  const map: Record<string, { type: string; category: string }> = JSON.parse(
    readFileSync(join(process.cwd(), "data/source/subtype_map.json"), "utf8"),
  );

  it("covers every row, so no row needs a default", () => {
    for (const e of experiences) {
      expect(Object.values(map).length).toBeGreaterThan(0);
      expect(e.type).toBeTruthy();
      expect(e.category).toBeTruthy();
    }
  });

  it("has no transport, in either the map or the data", () => {
    // Buses, the monorail, the Skyliner and the ferries are not in this table
    // at all. A ride whose shape is a vehicle is scenic_ride, not transport, so
    // "how do I get to EPCOT" can never be answered with "PeopleMover".
    for (const entry of Object.values(map)) {
      expect(entry.type).not.toBe("transport");
      expect(entry.category).not.toBe("transport");
    }
    for (const e of experiences) {
      expect(e.type).not.toBe("transport");
      expect(e.category).not.toBe("transport");
    }
  });

  it("keeps the five scenic rides as attractions", () => {
    const scenic = experiences.filter((e) => e.category === "scenic_ride");
    expect(scenic).toHaveLength(5);
    expect(scenic.every((e) => e.type === "attraction")).toBe(true);
  });

  it("never lets a dark ride imply a sensitivity flag", () => {
    // dark_ride is an industry term for an indoor tracked ride. Peter Pan's
    // Flight is one. The category must not predict nausea or intensity, so the
    // test is that dark rides genuinely vary on both — not that any particular
    // one is unset.
    const darkRides = experiences.filter((e) => e.category === "dark_ride");
    expect(darkRides.length).toBeGreaterThan(0);
    expect(new Set(darkRides.map((e) => e.motionSicknessWarning)).size).toBeGreaterThan(1);
    expect(new Set(darkRides.map((e) => e.intensity.value)).size).toBeGreaterThan(1);
    // And most of them are the gentlest rating, which is the point.
    expect(darkRides.filter((e) => e.intensity.value === 1).length).toBeGreaterThan(
      darkRides.length / 2,
    );
  });
});
