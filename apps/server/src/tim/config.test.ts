import { test } from "vitest";
import { looksLikeGeminiKey } from "./index";
import { assertEquals, KEY } from "./test-helpers";


test("בדיקת השפיות תופסת הדבקה חלקית, ולא מניחה פורמט של ספק", () => {
  assertEquals(looksLikeGeminiKey(undefined), false);
  assertEquals(looksLikeGeminiKey("AIzaSy"), false, "קצר מדי — הדבקה חלקית");
  assertEquals(looksLikeGeminiKey("AIza with a space in it xxxxxxxxxxxxxxx"), false, "רווח");
  assertEquals(looksLikeGeminiKey(KEY), true);
  // ⚠️ העיקר: מפתח באורך תקין שאינו מתחיל ב-AIza **אינו** נחסם. גוגל היא
  //    הסמכות על הפורמט, ולא ניחוש מקומי שחוסם מפתח תקין.
  assertEquals(looksLikeGeminiKey("x".repeat(39)), true);
});
