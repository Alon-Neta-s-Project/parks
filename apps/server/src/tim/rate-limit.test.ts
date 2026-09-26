import { test } from "vitest";
import { bucketKey } from "./index";
import { assertEquals } from "./test-helpers";


test("הדלי הוא גיבוב — כתובת ה-IP עצמה אינה נשמרת", async () => {
  const a = await bucketKey("203.0.113.9", "salt");
  const b = await bucketKey("203.0.113.9", "salt");
  const c = await bucketKey("203.0.113.10", "salt");
  assertEquals(a, b);                        // יציב
  assertEquals(a === c, false);              // מפריד בין כתובות
  assertEquals(a.includes("203.0.113"), false);  // ולא ניתן לקרוא ממנו את הכתובת
});
