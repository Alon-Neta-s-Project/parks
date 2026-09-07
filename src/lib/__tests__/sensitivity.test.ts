import { describe, expect, it } from "vitest";
import { experiences } from "../../data";
import type { Experience } from "../../data/schema";
import { matchesFilters, recommend } from "../recommend";
import { emptyProfile, numberedQuestions, questions, type Profile } from "../profile";
import {
  dependsFor,
  flagsFor,
  rideSensitivities,
  sensitivities,
  sensitivityStateFor,
  uncheckedFor,
} from "../sensitivity";

/**
 * Every row here is constructed, and that is the point.
 *
 * The four sens_* columns are close to complete in today's export, so a test
 * that read the live data would pass by accident and go on passing after the
 * rule was deleted. The next ride to arrive will have them empty — that is what
 * nullable means — and these are the assertions that will still be true then.
 */
const base = (patch: Partial<Experience>): Experience => ({
  ...experiences[0]!,
  id: "test",
  park: "Magic Kingdom",
  kind: "attraction",
  status: { state: "open", note: null },
  intensity: { value: 2, rated: true },
  sensEnclosedDark: null,
  sensHeights: null,
  sensLoudSudden: null,
  sensStrobe: null,
  motionSicknessWarning: null,
  wheelchair: null,
  ...patch,
});

describe("an unchecked sensitivity is not a clean bill", () => {
  it("reads as unchecked, never as clear", () => {
    const row = base({ sensLoudSudden: null });
    expect(sensitivityStateFor(row, "loudSudden")).toBe("unchecked");
    expect(sensitivityStateFor(row, "loudSudden")).not.toBe("clear");
  });

  it("is excluded by default when the group asked to avoid it", () => {
    const unchecked = base({ sensLoudSudden: null });
    const clear = base({ sensLoudSudden: false });
    const flagged = base({ sensLoudSudden: true });
    const filters = { avoidSensitivities: ["loudSudden" as const] };

    expect(matchesFilters(flagged, filters)).toBe(false);
    expect(matchesFilters(unchecked, filters)).toBe(false);
    expect(matchesFilters(clear, filters)).toBe(true);
  });

  it("comes back only on an explicit opt-in, and the flagged one never does", () => {
    const filters = {
      avoidSensitivities: ["loudSudden" as const],
      includeUncheckedSensitivity: true,
    };
    expect(matchesFilters(base({ sensLoudSudden: null }), filters)).toBe(true);
    expect(matchesFilters(base({ sensLoudSudden: true }), filters)).toBe(false);
  });

  it("is reported as a number rather than silently dropped", () => {
    const profile: Profile = {
      ...emptyProfile,
      parks: ["Magic Kingdom"],
      sensitivities: ["loudSudden"],
    };
    const strict = recommend(profile);
    const loose = recommend({ ...profile, includeUncheckedSensitivity: true });
    expect(strict.notes.sensitivityUncheckedExcluded).toBe(loose.total - strict.total);
    expect(strict.notes.sensitivityUncheckedExcluded).toBeGreaterThanOrEqual(0);
  });

  it("reports zero when nothing is being avoided", () => {
    const result = recommend({ ...emptyProfile, parks: ["Magic Kingdom"] });
    expect(result.notes.sensitivityUncheckedExcluded).toBe(0);
  });
});

describe("dark is read from the column and never from the category", () => {
  it("does not infer darkness from a dark_ride subtype", () => {
    // dark_ride is an industry term for a tracked indoor ride. It says nothing
    // about whether the ride is dark, and CLAUDE.md forbids the inference.
    const darkRide = base({ subtype: "dark_ride", sensEnclosedDark: null });
    expect(sensitivityStateFor(darkRide, "dark")).toBe("unchecked");
    expect(matchesFilters(darkRide, { avoidSensitivities: ["dark"] })).toBe(false);
  });

  it("keeps a dark_ride that was checked and found not enclosed", () => {
    const checked = base({ subtype: "dark_ride", sensEnclosedDark: false });
    expect(matchesFilters(checked, { avoidSensitivities: ["dark"] })).toBe(true);
  });
});

describe("dark and noise are separate answers", () => {
  it("a ride flagged only for noise is not withheld from someone avoiding the dark", () => {
    const loudButLit = base({ sensLoudSudden: true, sensEnclosedDark: false });
    expect(matchesFilters(loudButLit, { avoidSensitivities: ["dark"] })).toBe(true);
    expect(matchesFilters(loudButLit, { avoidSensitivities: ["loudSudden"] })).toBe(false);
  });
});

describe("accessibility carries five values, not two", () => {
  it("excludes only the one that is a barrier for every wheelchair user", () => {
    const filters = { avoidSensitivities: ["accessibility" as const] };
    expect(matchesFilters(base({ wheelchair: "must_be_ambulatory" }), filters)).toBe(false);
    expect(matchesFilters(base({ wheelchair: "remain_in_wheelchair" }), filters)).toBe(true);
  });

  it("keeps a transfer ride and marks it, rather than deciding for the rider", () => {
    const transfer = base({ wheelchair: "transfer_to_ride_vehicle" });
    expect(sensitivityStateFor(transfer, "accessibility")).toBe("depends");
    expect(matchesFilters(transfer, { avoidSensitivities: ["accessibility"] })).toBe(true);
    expect(dependsFor(transfer, ["accessibility"])).toEqual(["accessibility"]);
  });

  it("treats a row nobody checked as unchecked, not as step-free", () => {
    const unchecked = base({ wheelchair: null });
    expect(sensitivityStateFor(unchecked, "accessibility")).toBe("unchecked");
    expect(matchesFilters(unchecked, { avoidSensitivities: ["accessibility"] })).toBe(false);
  });
});

describe("motion sickness keeps its four states", () => {
  it("does not read 'na' as no warning", () => {
    // "na" answers the question, not the ride. A show with no motion at all is
    // not a ride that was checked for nausea and cleared.
    const na = base({ motionSicknessWarning: "na" });
    expect(sensitivityStateFor(na, "motionSickness")).toBe("unchecked");
    expect(matchesFilters(na, { avoidSensitivities: ["motionSickness"] })).toBe(false);
  });

  it("separates an explicit false from an unanswered one only by opting in", () => {
    const filters = { avoidSensitivities: ["motionSickness" as const] };
    expect(matchesFilters(base({ motionSicknessWarning: "false" }), filters)).toBe(true);
    expect(matchesFilters(base({ motionSicknessWarning: "true" }), filters)).toBe(false);
  });
});

describe("long queues steer the plan and never tag a ride", () => {
  it("is one of the answers offered", () => {
    expect(sensitivities).toContain("longQueues");
  });

  it("is not one of the answers a column can give", () => {
    expect(rideSensitivities).not.toContain("longQueues");
  });

  it("does not withhold a single ride, and does not print under one either", () => {
    const row = base({});
    expect(matchesFilters(row, { avoidSensitivities: ["longQueues"] })).toBe(true);
    expect(uncheckedFor(row, ["longQueues"])).toEqual([]);
    expect(flagsFor(row, ["longQueues"])).toEqual([]);
  });
});

describe("the sensitivity question rides along with the group question", () => {
  it("is asked, and is not one of the six", () => {
    const ids = questions.map((q) => q.id);
    expect(ids).toContain("sensitivities");
    expect(numberedQuestions).toHaveLength(6);
    expect(numberedQuestions.map((q) => q.id)).not.toContain("sensitivities");
  });

  it("follows the group question rather than opening its own step", () => {
    const q = questions.find((x) => x.id === "sensitivities")!;
    expect(q.followUpTo).toBe("group");
    expect(questions.indexOf(q)).toBe(questions.findIndex((x) => x.id === "group") + 1);
  });

  it("offers every sensitivity, so none is collectable but unaskable", () => {
    const q = questions.find((x) => x.id === "sensitivities")!;
    const offered = q.options?.map((o) => o.id) ?? [];
    for (const s of sensitivities) expect(offered).toContain(s);
  });

  // ⚠️ "אין רגישויות" הוא תשובה, ודילוג אינו. בלי האפשרות הזו משפחה בלי
  // רגישויות הייתה חייבת לדלג, וטים היה רושם שהשאלה נשאלה ולא נענתה —
  // שני מצבים שכלל הברזל החמישי מבחין ביניהם.
  it("offers 'no sensitivities' as an answer, and only it is exclusive", () => {
    const q = questions.find((x) => x.id === "sensitivities")!;
    const none = q.options?.find((o) => o.id === "none");
    expect(none).toBeDefined();
    expect(none!.exclusive).toBe(true);
    expect(none!.patch.sensitivities).toEqual([]);
    // Every real sensitivity combines freely; only "none" cannot.
    const exclusives = q.options?.filter((o) => o.exclusive).map((o) => o.id);
    expect(exclusives).toEqual(["none"]);
  });

  // ⚠️ "none" אינו רגישות. אילו היה נכנס לרשימה, כל מסנן היה מקבל ערך
  // שאין לו עמודה — ו-uncheckedFor היה מדפיס "לא נבדק" על כל 242 השורות.
  it("keeps 'none' out of the sensitivity vocabulary itself", () => {
    expect(sensitivities as string[]).not.toContain("none");
    expect(rideSensitivities as string[]).not.toContain("none");
  });

  it("starts empty, and empty is not an answer", () => {
    expect(emptyProfile.sensitivities).toEqual([]);
    // Nothing avoided means nothing withheld — including the unchecked rows,
    // which are only strict once someone has actually named a sensitivity.
    expect(matchesFilters(base({}), { avoidSensitivities: [] })).toBe(true);
  });
});
