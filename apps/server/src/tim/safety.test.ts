import { test } from "vitest";
import { scrubAnswer } from "./index";
import { assertEquals } from "./test-helpers";


/**
 * 🔴 **מה שאסור לצאת נחסם בקוד, ולא בהוראה.**
 *
 * ההוראות מבקשות מטים לא לחשוף קישורים ומפתחות. הוראה היא בקשה, ומודל
 * יכול לא לציית לה — וזו בדיוק המטרה של prompt injection. לכן הפלט
 * נבדק אחרי שהמודל סיים.
 */
test("קישור ומפתח אינם יוצאים בתשובה", () => {
  const a = scrubAnswer("הפרטים באתר https://disneyworld.disney.go.com/tickets/ וכדאי לבדוק");
  assertEquals(a.clean.includes("http"), false);
  assertEquals(a.clean.includes("באתר הרשמי"), true);
  assertEquals(a.hits.includes("url"), true);

  const b = scrubAnswer("המפתח הוא AIzaSyTESTKEY0000000000000000000000000000");
  assertEquals(/AIza/.test(b.clean), false);
  assertEquals(b.hits.includes("key"), true);

  // ⚠️ ותשובה רגילה אינה נפגעת. מסנן שמשנה טקסט תקין גרוע מאין מסנן.
  const c = scrubAnswer("כדאי לוודא באתר הרשמי ביום הביקור.");
  assertEquals(c.clean, "כדאי לוודא באתר הרשמי ביום הביקור.");
  assertEquals(c.hits.length, 0);
});
