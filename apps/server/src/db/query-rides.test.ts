import { describe, expect, it } from "vitest";
import type { Sql } from "./client";
import { queryRides } from "./query-rides";

/** A database that returns these rows for any query — the SQL itself is checked by the parity script. */
const db = (rows: Record<string, unknown>[]) => (() => Promise.resolve(rows)) as unknown as Sql;

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: id, name_he: null, park: "P", land: null, category: "coaster", kind: "attraction",
  status: "open", status_note: null, intensity: 2, height_cm: 0, max_height_cm: null,
  gets_wet: "none", wheelchair: "remain_in_wheelchair", motion_sickness: "false",
  sens_dark: "false", sens_heights: "false", sens_loud: "false", sens_strobe: "false",
  skip_line: "none", single_pass: false, last_verified: "2026-09-01",
  ...over,
});

describe("query_rides", () => {
  it("caps the rows for the model at 20 by default and 40 at most — and says how many matched", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(`r${i}`));
    const d = await queryRides(db(rows), {});
    expect([d.rides.length, d.matched]).toEqual([20, 60]);
    expect((await queryRides(db(rows), { limit: 500 })).rides.length).toBe(40);
  });

  it("caps per park before the overall cap", async () => {
    const rows = [...["a1", "a2", "a3"].map((id) => row(id, { park: "A" })), ...["b1", "b2"].map((id) => row(id, { park: "B" }))];
    const d = await queryRides(db(rows), { perPark: 1 });
    expect(d.rides.map((r) => r.name)).toEqual(["a1", "b1"]);
    expect(d.matched).toBe(5);
  });

  // 🔴 The unknowns are counted, never dropped in silence.
  it("counts what it held back because nobody knows", async () => {
    const rows = [
      row("ok"),
      row("unrated", { intensity: null }),
      row("noise-unchecked", { sens_loud: null }),
      row("floor-unchecked", { height_cm: null }),
      row("too-intense", { intensity: 4 }),
    ];
    const d = await queryRides(db(rows), { intensityMax: 3, avoidSensitivities: ["loudSudden"], heightCm: 110 });
    expect(d.rides.map((r) => r.name)).toEqual(["ok"]);
    expect(d.heldBack).toEqual({ unrated: 1, sensitivityUnchecked: 1, heightUnknown: 1 });
  });

  it("says the fit for the height asked, by the shared rule", async () => {
    const d = await queryRides(db([row("fits", { height_cm: 102 })]), { heightCm: 110 });
    expect([d.rides[0]!.fit, d.rides[0]!.fits]).toEqual(["fits", true]);
  });

  it("reads coming soon and temporarily closed as 'check' — kept, unlike closed", async () => {
    const rows = [row("soon", { status: "coming_soon" }), row("temp", { status: "temporarily_closed" }), row("gone", { status: "closed" })];
    expect((await queryRides(db(rows), {})).rides.map((r) => r.name)).toEqual(["soon", "temp"]);
  });
});
