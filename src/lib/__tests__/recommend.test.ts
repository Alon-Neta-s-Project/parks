import { describe, expect, it } from "vitest";
import { emptyProfile, questions, type Profile } from "../profile";
import { recommend, searchExperiences } from "../recommend";
import { refinementById } from "../refine";

const withProfile = (patch: Partial<Profile>): Profile => ({ ...emptyProfile, ...patch });

describe("searchExperiences", () => {
  it("respects an intensity ceiling", () => {
    const gentle = searchExperiences({ parks: ["Magic Kingdom"], intensityMax: 2 });
    expect(gentle.length).toBeGreaterThan(0);
    for (const e of gentle) expect(e.intensity.value).toBeLessThanOrEqual(2);
    expect(gentle.map((e) => e.nameEn)).not.toContain("Space Mountain");
  });

  it("respects an intensity floor for a thrill-seeking group", () => {
    const thrills = searchExperiences({ parks: ["Magic Kingdom"], intensityMin: 3 });
    expect(thrills.map((e) => e.nameEn).sort()).toEqual([
      "Space Mountain",
      "TRON Lightcycle / Run",
      "Tiana's Bayou Adventure",
    ]);
  });

  it("hides unrated rides by default and includes them on request", () => {
    const filters = { parks: ["Magic Kingdom"] as string[] };
    const hidden = searchExperiences(filters);
    const shown = searchExperiences({ ...filters, includeUnrated: true });
    expect(hidden.every((e) => e.intensity.rated)).toBe(true);
    expect(shown.length).toBeGreaterThan(hidden.length);
  });

  it("drops rides the workbook marks as unavailable", () => {
    const open = searchExperiences({ includeUnrated: true });
    expect(open.some((e) => e.status.state === "closed")).toBe(false);
  });

  it("never filters on fast access, because a paid queue is not park entry", () => {
    const all = searchExperiences({ parks: ["Magic Kingdom"], includeUnrated: true });
    expect(all.some((e) => e.fastAccess.singlePassRequired)).toBe(true);
  });
});

describe("recommend", () => {
  it("groups by land and leads with the most intense ride allowed", () => {
    const result = recommend(withProfile({ parks: ["Magic Kingdom"], intensityMax: 4 }));
    // 29 rated rides, less Carousel of Progress, which the workbook marks
    // temporarily unavailable.
    expect(result.total).toBe(28);
    expect(result.groups.flatMap((g) => g.items).map((e) => e.nameEn)).not.toContain(
      "Walt Disney's Carousel of Progress",
    );
    // Lands are ordered by how much is in them, so the busiest land leads —
    // not whichever land happens to hold the most intense ride.
    const sizes = result.groups.map((g) => g.items.length);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    for (const group of result.groups) {
      const values = group.items.map((e) => e.intensity.value ?? -1);
      expect([...values].sort((a, b) => b - a)).toEqual(values);
    }
    // The one 4/4 ride in the park leads its own land.
    const tomorrowland = result.groups.find((g) => g.land === "Tomorrowland");
    expect(tomorrowland?.items[0]?.nameEn).toBe("TRON Lightcycle / Run");
  });

  it("counts what the intensity filter hid rather than hiding it silently", () => {
    const result = recommend(withProfile({ parks: ["Magic Kingdom"], intensityMax: 2 }));
    expect(result.notes.unratedExcluded).toBe(7);
  });

  it("flags the two Magic Kingdom rides needing a separately paid Single Pass", () => {
    const result = recommend(withProfile({ parks: ["Magic Kingdom"], intensityMax: 4 }));
    expect(result.notes.singlePass.map((e) => e.nameEn).sort()).toEqual([
      "Seven Dwarfs Mine Train",
      "TRON Lightcycle / Run",
    ]);
  });

  it("names parks that carry no intensity ratings at all", () => {
    const result = recommend(
      withProfile({ parks: ["Universal Epic Universe", "Magic Kingdom"], intensityMax: 4 }),
    );
    expect(result.notes.unratedParks).toEqual(["Universal Epic Universe"]);
  });

  it("returns nothing before a park is chosen", () => {
    expect(recommend(emptyProfile).total).toBe(0);
  });
});

describe("refinements", () => {
  const mk = withProfile({ parks: ["Magic Kingdom"], intensityMax: 4 });

  it("calmer narrows the list and never empties it", () => {
    let profile = mk;
    for (let step = 0; step < 5; step += 1) {
      const option = refinementById("calmer");
      if (!option?.offered(profile)) break;
      profile = option.apply(profile);
      expect(recommend(profile).total).toBeGreaterThan(0);
    }
    expect(profile.intensityMax).toBe(1);
    expect(refinementById("calmer")?.offered(profile)).toBe(false);
  });

  it("only-included drops the separately paid rides, and reverses cleanly", () => {
    const included = refinementById("onlyIncluded")!.apply(mk);
    const result = recommend(included);
    expect(result.notes.singlePass).toHaveLength(0);
    expect(result.total).toBe(recommend(mk).total - 2);
    expect(recommend(refinementById("allAccess")!.apply(included)).total).toBe(
      recommend(mk).total,
    );
  });

  it("splitting by kind partitions the same set", () => {
    const rides = recommend(refinementById("onlyAttractions")!.apply(mk)).total;
    const shows = recommend(refinementById("onlyShows")!.apply(mk)).total;
    expect(rides + shows).toBe(recommend(mk).total);
  });

  it("offers nothing that would be a no-op", () => {
    const narrowed = refinementById("onlyAttractions")!.apply(mk);
    expect(refinementById("onlyAttractions")?.offered(narrowed)).toBe(false);
    expect(refinementById("bothKinds")?.offered(narrowed)).toBe(true);
  });
});

describe("more than one park", () => {
  const two = withProfile({ parks: ["Magic Kingdom", "EPCOT"], intensityMax: 4 });

  it("labels every group with its park", () => {
    const result = recommend(two);
    expect(result.groups.length).toBeGreaterThan(1);
    for (const group of result.groups) {
      expect(["Magic Kingdom", "EPCOT"]).toContain(group.park);
      expect(group.items.every((e) => e.park === group.park && e.land === group.land)).toBe(true);
    }
  });

  it("keeps each park's lands together, in the order they were chosen", () => {
    const parksInOrder = recommend(two).groups.map((g) => g.park);
    const firstEpcot = parksInOrder.indexOf("EPCOT");
    expect(parksInOrder.slice(0, firstEpcot).every((p) => p === "Magic Kingdom")).toBe(true);
    expect(parksInOrder.slice(firstEpcot).every((p) => p === "EPCOT")).toBe(true);
  });

  it("loses nothing when a second park is added", () => {
    const one = recommend(withProfile({ parks: ["Magic Kingdom"], intensityMax: 4 }));
    const both = recommend(two);
    expect(both.total).toBeGreaterThan(one.total);
    expect(both.groups.flatMap((g) => g.items)).toHaveLength(both.total);
  });
});

describe("opening questions", () => {
  it("asks two questions before answering, not five", () => {
    expect(questions.map((q) => q.id)).toEqual(["parks", "intensity"]);
  });

  it("asks for the comfortable intensity directly, never deriving it", () => {
    const intensityQ = questions.find((q) => q.id === "intensity");
    // Every option sets an intensity bound and nothing about who is in the group.
    for (const option of intensityQ?.options ?? []) {
      expect(Object.keys(option.patch).sort()).toEqual(["intensityMax", "intensityMin"]);
    }
    expect(JSON.stringify(emptyProfile)).not.toMatch(/group|age|height|planner/i);
  });
});

describe("condensed list", () => {
  const mk = withProfile({ parks: ["Magic Kingdom"], intensityMax: 4 });

  it("keeps every land but at most three each, and says how many it held back", () => {
    const full = recommend(mk);
    const short = recommend({ ...mk, condensed: true });

    expect(short.groups).toHaveLength(full.groups.length);
    for (const g of short.groups) expect(g.items.length).toBeLessThanOrEqual(3);

    const shown = short.groups.reduce((n, g) => n + g.items.length, 0);
    expect(short.notes.condensedAway).toBe(full.total - shown);
    expect(short.notes.condensedAway).toBeGreaterThan(0);
  });
});

describe("contextual refinements", () => {
  const mk = withProfile({ parks: ["Magic Kingdom"], intensityMax: 4 });

  it("only offers the pass-coverage filter once a pass is known to exist", () => {
    expect(refinementById("onlyIncluded")?.offered(mk)).toBe(false);
    const withPass = refinementById("hasFastAccess")!.apply(mk);
    expect(refinementById("onlyIncluded")?.offered(withPass)).toBe(true);
  });
});
