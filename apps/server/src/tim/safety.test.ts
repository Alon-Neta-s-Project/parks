import { test } from "vitest";
import { scrubAnswer } from "./index";
import { assertEquals } from "./test-helpers";


/**
 * 🔴 **What must not go out is blocked in code, not by an instruction.**
 *
 * The instructions ask Tim not to reveal links or keys. An instruction is a
 * request, and a model can ignore it — which is exactly the goal of prompt
 * injection. So the output is checked after the model is done.
 */
test("קישור ומפתח אינם יוצאים בתשובה", () => {
  const a = scrubAnswer("הפרטים באתר https://disneyworld.disney.go.com/tickets/ וכדאי לבדוק");
  assertEquals(a.clean.includes("http"), false);
  assertEquals(a.clean.includes("באתר הרשמי"), true);
  assertEquals(a.hits.includes("url"), true);

  const b = scrubAnswer("המפתח הוא AIzaSyTESTKEY0000000000000000000000000000");
  assertEquals(/AIza/.test(b.clean), false);
  assertEquals(b.hits.includes("key"), true);

  // ⚠️ And a normal answer is left intact. A filter that alters valid text is worse than no filter.
  const c = scrubAnswer("כדאי לוודא באתר הרשמי ביום הביקור.");
  assertEquals(c.clean, "כדאי לוודא באתר הרשמי ביום הביקור.");
  assertEquals(c.hits.length, 0);
});
