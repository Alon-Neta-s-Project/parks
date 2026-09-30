import { afterEach, test } from "vitest";
import { handle } from "./index";
import type { DirectQueries, ExperienceRow } from "./lookup";
import { assertEquals, ask, stub, sentToGemini, withRides, FULL } from "./test-helpers";

/**
 * 🔴 **Tim's fit comes from the one rule (packages/shared/src/fit.ts), not from the database.**
 *
 * Until 30.09 Tim said what the SQL `CASE` in find_experiences said, and on a ceiling with an
 * unchecked floor it said `true` — "מתאים לגובה שנמסר" ("fits the height given") for a floor
 * no one checked. Decision 2, C (Alon, 30.09): below the ceiling is said, the floor stays
 * unknown, and "fits" is never said. The RPC below still sends the old `true`; it must not
 * reach the model — on either path.
 */
const TOT_TIKI = {
  name: "Tot Tiki Reef", name_he: null, park: "Universal Volcano Bay", land: null, status: "open",
  status_note: null, intensity: 1, height_cm: null, max_height_cm: 122, gets_wet: "may_get_soaked",
  skip_line: null, last_verified: "2026-09-01",
  fits: true, // what the database function says today
} as ExperienceRow;

const QUESTION = "הבן שלי בגובה 100, הוא יכול לעלות על Tot Tiki Reef?";
const prompt = (calls: { url: string; init?: RequestInit }[]) => JSON.stringify(sentToGemini(calls));

let restore = () => {};
afterEach(() => restore());

test("תקרה ורצפה שלא נבדקה, דרך ה-RPC — לא 'מתאים', ו'לא גבוה מדי' נאמר", async () => {
  const s = stub(withRides([TOT_TIKI]));
  restore = s.restore;
  await handle(ask({ question: QUESTION }), FULL);
  const p = prompt(s.calls);
  assertEquals(p.includes("מתאים לגובה שנמסר"), false);
  assertEquals(p.includes("לא גבוה מדי לגובה שנמסר"), true);
});

test("תקרה ורצפה שלא נבדקה, בחיבור ישיר — אותו כלל", async () => {
  const s = stub(withRides([]));
  restore = s.restore;
  const direct: DirectQueries = {
    findExperiences: async () => [{ ...TOT_TIKI, fits: null }],
    matchKnowledge: async () => [],
    parkCandidates: async () => [],
  };
  await handle(ask({ question: QUESTION }), FULL, { direct });
  const p = prompt(s.calls);
  assertEquals(p.includes("מתאים לגובה שנמסר"), false);
  assertEquals(p.includes("לא גבוה מדי לגובה שנמסר"), true);
});

test("מעל התקרה — 'לא מתאים', גם כשהמסד אומר אחרת", async () => {
  const s = stub(withRides([TOT_TIKI]));
  restore = s.restore;
  await handle(ask({ question: "הבת שלי בגובה 130, היא יכולה לעלות על Tot Tiki Reef?" }), FULL);
  assertEquals(prompt(s.calls).includes("לא מתאים לגובה שנמסר"), true);
});

test("רצפה שנבדקה — 'מתאים' כמו קודם", async () => {
  const s = stub(withRides([{ ...TOT_TIKI, name: "Space Mountain", height_cm: 112, max_height_cm: null, fits: null } as ExperienceRow]));
  restore = s.restore;
  await handle(ask({ question: "הבת שלי בגובה 120, היא יכולה לעלות על Space Mountain?" }), FULL);
  const p = prompt(s.calls);
  assertEquals(p.includes("מתאים לגובה שנמסר"), true);
  assertEquals(p.includes("לא מתאים לגובה שנמסר"), false);
});
