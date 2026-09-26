import { test } from "vitest";
import { extractHeight, extractRideName } from "./index";
import { assertEquals } from "./test-helpers";


// ── Rides ─────────────────────────────────────────────────────────────
// ⚠️ A fact about a ride is retrieved from the table, not from semantic search.
// "מה גובה המינימום" ("what's the minimum height") needs the number from the
// row, not the passage that sounds similar.

test("גובה נשלף מהשאלה רק כשהוא באמת גובה", () => {
  assertEquals(extractHeight("הילדה בגובה 105"), 105);
  assertEquals(extractHeight('היא 112 ס"מ'), 112);
  // ⚠️ A number without context isn't a height.
  assertEquals(extractHeight("אנחנו 3 ימים בפארק"), null);
  assertEquals(extractHeight("בן 7"), null);
  // ⚠️ Outside the range the database enforces on the column.
  assertEquals(extractHeight('היא 300 ס"מ'), null);
  assertEquals(extractHeight('הוא 20 ס"מ'), null);
});

// ⚠️ Greeting and small-talk words aren't a ride name. "היי" ("hi") used to get
// through and hit the table on every greeting — a wasted call in every
// conversation.
test("ברכה אינה שם מתקן", () => {
  assertEquals(extractRideName("היי"), null);
  assertEquals(extractRideName("שלום, מה שלומך?"), null);
  assertEquals(extractRideName("מה זה"), null);
});

// 🔴 **The test that was missing, and the bug it would have caught.**
//
// The tests here verified that extractRideName returns a string containing
// "אוורסט" ("Everest"), and that was true. **No test asked what the database
// does with that string.** 029 matched `name ilike '%' || p_name || '%'` — i.e.
// the whole phrase as one contiguous string — and a real question from Neta
// returned zero rows in the field.
//
// The conclusion is kept here as a test, not a comment: the function returns a
// **phrase of words**, so the database side **must** match by word. Migration 030
// does that.
test("מה שנשלף הוא צירוף מילים, ולכן ההתאמה במסד חייבת להיות לפי מילה", () => {
  const asked = extractRideName("הבת שלי בגובה 112 סנטימטר, היא יכולה לעלות על אקספדישן אוורסט?");
  assertEquals(asked !== null, true);
  // ⚠️ More than one word — and that's exactly what phrase matching can't find.
  assertEquals(asked!.split(" ").length > 1, true, "אילו הייתה מילה אחת, הבאג לא היה מתגלה");
  // ⚠️ And the ride name is **one** of the words, not the whole phrase.
  assertEquals(asked!.split(" ").includes("אוורסט"), true);
  assertEquals(asked === "אוורסט", false, "אין לצפות ששם נקי ייצא מכאן");
});

// 🔴 **Measured in the field, after the model produced "מתקן אווטאר" ("Avatar
// ride") as an alias candidate.** With that alias in the database, the question
// "איזה מתקן הכי מפחיד" ("which ride is scariest") returned Avatar Flight of
// Passage — a fact about a random ride entered Tim's context as the answer to a
// question that wasn't about it at all.
//
// ⚠️ And the fix is here, not in candidate filtering, because a generic word also
// appears in a legitimate alias ("מופע היפה והחיה", "the Beauty and the Beast
// show"). What must drop out is the **question** side, and then no approved alias
// can produce this failure.
test("מילה גנרית אינה מגיעה למסד כמילת חיפוש", () => {
  // ⚠️ The rule isn't "returns null" — a word that remains and matches no ride
  // costs one unnecessary call, and that's an acceptable price (see the comment
  // in the function). The rule is that **the generic word itself** isn't sent,
  // because it's the one that matches a random ride's alias.
  for (const [q, generic] of [
    ["איזה מתקן הכי מפחיד", "מתקן"],
    ["יש מופע בערב", "מופע"],
    ["כמה זמן התור", "תור"],
    ["באיזה פארק זה", "פארק"],
  ] as const) {
    const out = extractRideName(q) ?? "";
    assertEquals(out.split(" ").includes(generic), false, `"${generic}" נשלח למסד מתוך "${q}"`);
  }
  // ⚠️ And a real name next to a generic word survives.
  assertEquals(extractRideName("איזה מתקן זה אוורסט")?.includes("אוורסט"), true);
});

test("שם המתקן נשלף גם כשהוא עטוף במילות שאלה", () => {
  assertEquals(extractRideName("מה גובה המינימום באקספדישן אוורסט?")?.includes("אוורסט"), true);
  // ⚠️ A price question about a specific ride — which is why detection isn't by a
  // keyword list.
  assertEquals(extractRideName("כמה עולה אוורסט")?.includes("אוורסט"), true);
});
