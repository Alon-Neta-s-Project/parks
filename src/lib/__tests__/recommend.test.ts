import { describe, expect, it } from "vitest";
import { emptyProfile, isDropped, questions, type Profile } from "../profile";
import { experiences } from "../../data";
import { matchesFilters, recommend, searchExperiences } from "../recommend";
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
    // Equal while every ride is rated; the difference is exactly the unrated ones.
    const unrated = shown.filter((e) => !e.intensity.rated).length;
    expect(shown.length - hidden.length).toBe(unrated);
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
    // Every rated, open ride in the park. The figure moves as ratings arrive,
    // so it is derived rather than pinned.
    const expected = experiences.filter(
      (e) => e.park === "Magic Kingdom" && e.intensity.rated && e.status.state !== "closed",
    ).length;
    expect(result.total).toBe(expected);
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
    // Whatever the current coverage, the count reported must equal the number
    // actually held back — zero once everything is rated.
    const unratedOpen = experiences.filter(
      (e) => e.park === "Magic Kingdom" && !e.intensity.rated && e.status.state !== "closed",
    ).length;
    expect(result.notes.unratedExcluded).toBe(unratedOpen);
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
    // Names any park in the profile that carries no ratings at all. Empty now
    // that every park has them, which is the point of reporting it rather than
    // hard-coding it.
    const expected = ["Universal Epic Universe", "Magic Kingdom"].filter(
      (p) => !experiences.some((e) => e.park === p && e.intensity.rated),
    );
    expect(result.notes.unratedParks).toEqual(expected);
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
  // ⚠️ שש ולא שלוש. הסדר נקבע במוצר (פולה, 03.09) ואינו נתון לשינוי כאן —
  // הבדיקה נועלת אותו, כדי ששינוי סדר יהיה החלטה ולא תופעת לוואי של refactor.
  it("asks six, in the order product fixed", () => {
    expect(questions.map((q) => q.id)).toEqual([
      "group",
      "attractionTypes",
      "worlds",
      "parkDays",
      "visitStyle",
      "dates",
    ]);
  });

  // ⚠️ שלושת סוגי האטרקציות אינם סולם. משפחה יכולה לרצות גם רכבות מהירות וגם
  // מתקנים קלילים ולהתכוון לשניהם, ולכן הם בחירה מרובה ולא טווח.
  it("lets a family want thrill and gentle at once", () => {
    const q = questions.find((q) => q.id === "attractionTypes");
    expect(q?.multi).toBe(true);
    expect(q?.options?.map((o) => o.id)).toEqual(["thrill", "family", "gentle"]);
  });

  // ⚠️ "עוד לא סגור" הוא תשובה ולא דילוג. אם הוא היה נחשב כחוסר מענה, טים
  // היה שואל שוב על משהו שכבר נענה.
  it("treats \"not settled yet\" as an answer, not a skip", () => {
    const q = questions.find((q) => q.id === "parkDays");
    const unsure = q?.options?.find((o) => o.id === "unsure");
    expect(unsure?.patch).toEqual({ parkDays: "unsure" });
  });

  // ⚠️ רשימת העולמות פתוחה. משפחה שאומרת "Encanto" לא צריכה לבחור את הצ'יפ
  // הקרוב ביותר.
  it("keeps worlds open-ended beside the chips", () => {
    const q = questions.find((q) => q.id === "worlds");
    expect(q?.multi && q?.freeText).toBe(true);
  });

  it("asks a child's height in the same question as their age", () => {
    // ⚠️ הגובה הוא מה שקובע מה בכלל פתוח לילד/ה, והפרדתו לשאלה נפרדת גורמת
    // לו להיקרא כסינון. פולה קבעה: באותה נשימה.
    const group = questions.find((q) => q.id === "group");
    expect(group?.kind).toBe("members");
    expect(questions.some((q) => q.id.toLowerCase().includes("height"))).toBe(false);
  });

  it("keeps a free-text way out beside the chips", () => {
    // Flagged in the handover as a low-confidence product guess, so it must stay
    // cheap to change.
    expect(questions.filter((q) => q.freeText).length).toBeGreaterThan(0);
  });

  it("never derives intensity from who is in the group", () => {
    expect(JSON.stringify(emptyProfile)).not.toMatch(/intensityFromGroup|ageBand/i);
    for (const q of questions) {
      for (const option of q.options ?? []) {
        expect(Object.keys(option.patch)).not.toContain("intensityMax");
      }
    }
  });

  it("starts with nothing dropped, and drops are recorded per question", () => {
    expect(emptyProfile.askedAndDropped).toEqual([]);
    expect(isDropped({ ...emptyProfile, askedAndDropped: ["group"] }, "group")).toBe(true);
    expect(isDropped(emptyProfile, "group")).toBe(false);
  });
});

describe("condensed list", () => {
  const mk = withProfile({ parks: ["Magic Kingdom"], intensityMax: 4 });

  it("keeps every land but at most three each, and says how many it held back", () => {
    const full = recommend(mk);
    const short = recommend({ ...mk, condensed: true });

    expect(full.total).toBeGreaterThan(0);
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

describe("an unrated ride never answers a question about intensity", () => {
  // Built rather than taken from the data: every live row is rated today, and
  // the rule must still hold when the next unrated ride arrives.
  const unrated = {
    ...experiences[0]!,
    id: "test-unrated",
    park: "Magic Kingdom",
    kind: "attraction" as const,
    status: { state: "open" as const, note: null },
    intensity: { value: null, rated: false },
  };
  const rated = { ...unrated, id: "test-rated", intensity: { value: 2 as const, rated: true } };

  it("is excluded by a ceiling even when unrated rides are requested", () => {
    expect(matchesFilters(unrated, { intensityMax: 2, includeUnrated: true })).toBe(false);
    expect(matchesFilters(rated, { intensityMax: 2, includeUnrated: true })).toBe(true);
  });

  it("is excluded by a floor too", () => {
    expect(matchesFilters(unrated, { intensityMin: 1, includeUnrated: true })).toBe(false);
  });

  it("is listed only when no bound is set, and only on request", () => {
    expect(matchesFilters(unrated, { includeUnrated: true })).toBe(true);
    expect(matchesFilters(unrated, { includeUnrated: false })).toBe(false);
  });

  it("is never coerced to a middle value", () => {
    for (const e of experiences) {
      if (!e.intensity.rated) expect(e.intensity.value).toBeNull();
    }
  });
});
