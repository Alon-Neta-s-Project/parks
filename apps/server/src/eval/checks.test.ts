import { describe, expect, it } from "vitest";
import { answerFacts, diffFacts, evaluate, extractFacts, type Case } from "./checks";

const c = (expect: Case["expect"]): Case => ({ id: "t", kind: "tool", ask: "?", expect });
const reply = (answer?: string, extra = {}) => ({ answer, ms: 1, rides: 1, chunks: 0, ...extra });

describe("extractFacts", () => {
  it("reads heights in every spelling Tim uses", () => {
    expect(extractFacts('גובה מינימום 112 ס"מ, ובגרסה אחרת 97 ס״מ או 122 סנטימטר').cm).toEqual([112, 122, 97].sort());
  });

  it("reads prices and times", () => {
    const f = extractFacts("חניה עולה $35 ליום, Preferred כ-50 דולר. הפארק נפתח ב-9:00.");
    expect(f.usd).toEqual([35, 50]);
    expect(f.times).toEqual(["9:00"]);
  });

  // ⚠️ A bare number is not a fact: flagging it would report noise as a regression.
  it("ignores numbers without a unit", () => {
    expect(extractFacts("עוצמה 3 מתוך 4, תכננו 3 ימים")).toEqual({ cm: [], usd: [], times: [], percents: [] });
  });
});

describe("diffFacts", () => {
  it("says which facts changed between two answers", () => {
    expect(diffFacts(extractFacts('112 ס"מ'), extractFacts('97 ס"מ'))).toEqual(["cm: [112] → [97]"]);
  });

  it("is empty when two differently worded answers state the same facts", () => {
    expect(diffFacts(extractFacts('הגובה הוא 112 ס"מ.'), extractFacts('צריך לפחות 112 ס״מ כדי לעלות'))).toEqual([]);
  });
});

describe("evaluate", () => {
  it("an answer that never arrived is 'not run', not 'fail'", () => {
    expect(evaluate(c({ must_contain: ["x"] }), { error: "upstream_error", status: 502, ms: 1 }, []).result).toBe("not run");
  });

  it("must_not_match as a single string is one pattern, not one per character", () => {
    expect(evaluate(c({ must_not_match: "\\d{1,2}:\\d{2}" }), reply("מתקיים לפי האפליקציה"), []).result).toBe("pass");
    expect(evaluate(c({ must_not_match: "\\d{1,2}:\\d{2}" }), reply("בשעה 15:00"), []).result).toBe("fail");
  });

  it("judges the table row separately from the answer", () => {
    const v = evaluate(c({ ride: "Space Mountain", height_cm: 112 }), reply("..."), [{ name: "Space Mountain", height_cm: 97, fits: null }]);
    expect(v.why).toEqual(["height 97 ≠ 112"]);
  });

  it("must_contain_any passes on any one alternative, and fails when none appears", () => {
    const e = { must_contain_any: [["Astronomica", "Yoshi"]] };
    expect(evaluate(c(e), reply("אפשר Yoshi's Adventure"), []).result).toBe("pass");
    expect(evaluate(c(e), reply("Stardust Racers"), []).why).toEqual(['missing any of ["Astronomica","Yoshi"]']);
  });
});

// ⚠️ A height the family gave is not a claim the answer makes. Repeating "100 ס"מ" from
// the question flagged a fact difference between two answers that disagreed on nothing.
describe("answerFacts", () => {
  it("leaves out facts that were already in the question", () => {
    const q = "אילו מתקנים מתאימים לילד בגובה 100 ס\"מ?";
    expect(answerFacts('זה מתאים לגובה 100 ס"מ', q).cm).toEqual([]);
    expect(answerFacts('מגבלת הגובה 112 ס"מ, והילד בגובה 100 ס"מ', q).cm).toEqual([112]);
  });

  it("also reads a bare height in the question ('בגובה 100') as given", () => {
    expect(answerFacts('מתאים לגובה 100 ס"מ', "מה מתאים לילד בגובה 100?").cm).toEqual([]);
  });
});

