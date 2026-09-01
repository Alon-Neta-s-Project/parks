import { describe, expect, it } from "vitest";
import { classify, findExperience, whichFact } from "../intent";

describe("what the user is asking for", () => {
  it("treats a pointed factual question as factual", () => {
    expect(classify("מה מגבלת הגובה ל-Space Mountain?")).toBe("factual");
    expect(classify("כמה זמן ספייס מאונטיין?")).toBe("factual");
  });

  it("treats a request to plan as planning, not as a cue to recommend", () => {
    // The whole point: this must open the three questions, never hand back a
    // generic plan.
    expect(classify("תכננו לי יום")).toBe("planning");
    expect(classify("עזרו לי לתכנן טיול")).toBe("planning");
    expect(classify("plan me a day")).toBe("planning");
  });

  it("answers the fact when a question contains both", () => {
    // "What's the height limit, we're planning a day" still has an answer.
    expect(classify("אנחנו מתכננים יום, מה מגבלת הגובה ב-TRON?")).toBe("factual");
  });

  it("says unclear rather than guessing", () => {
    expect(classify("היי")).toBe("unclear");
    expect(classify("")).toBe("unclear");
  });
});

describe("finding the ride", () => {
  it("matches the English name", () => {
    expect(findExperience("what about Space Mountain?")?.nameEn).toBe("Space Mountain");
  });

  it("matches the Hebrew name and the alias", () => {
    expect(findExperience("ספייס מאונטיין")?.nameEn).toBe("Space Mountain");
    expect(findExperience("כמה זמן ספייס?")?.nameEn).toBe("Space Mountain");
  });

  it("prefers the longest match", () => {
    const hit = findExperience("Space Mountain");
    expect(hit?.nameEn).toBe("Space Mountain");
  });

  it("finds nothing rather than guessing", () => {
    expect(findExperience("מה שלומך")).toBeNull();
    expect(findExperience("ab")).toBeNull();
  });
});

describe("which fact was asked", () => {
  it("picks the one actually asked about", () => {
    expect(whichFact("מה מגבלת הגובה")).toBe("height");
    expect(whichFact("זה מבחיל?")).toBe("nausea");
    expect(whichFact("זה מרטיב?")).toBe("wet");
    expect(whichFact("נגיש לכיסא גלגלים?")).toBe("wheelchair");
    expect(whichFact("כמה זמן")).toBe("duration");
  });

  it("returns null when no fact is named", () => {
    expect(whichFact("Space Mountain")).toBeNull();
  });
});
