import { test } from "vitest";
import { looksLikeGeminiKey } from "./index";
import { assertEquals, KEY } from "./test-helpers";


test("בדיקת השפיות תופסת הדבקה חלקית, ולא מניחה פורמט של ספק", () => {
  assertEquals(looksLikeGeminiKey(undefined), false);
  assertEquals(looksLikeGeminiKey("AIzaSy"), false, "קצר מדי — הדבקה חלקית");
  assertEquals(looksLikeGeminiKey("AIza with a space in it xxxxxxxxxxxxxxx"), false, "רווח");
  assertEquals(looksLikeGeminiKey(KEY), true);
  // ⚠️ The point: a key of valid length that doesn't start with AIza is **not**
  //    blocked. Google is the authority on the format, not a local guess that
  //    blocks a valid key.
  assertEquals(looksLikeGeminiKey("x".repeat(39)), true);
});
