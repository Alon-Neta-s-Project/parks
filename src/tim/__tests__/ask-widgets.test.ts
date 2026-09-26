import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **הרכיבים חייבים לייצר טקסט, ולא מבנה.**
 *
 * מה שנשלח לטים הוא משפט עברי רגיל, בדיוק כמו הקלדה — כדי שההיסטוריה
 * תישאר שיחה אחת ולא תערובת של שיחה וטופס. מבנה היה מחייב את טים
 * לדעת על הרכיבים, וזה מקור אמת שני על אותה שאלה.
 *
 * ⚠️ **ושדה ריק נשלח כ"לא יודעת" ולעולם לא כאפס.** זה הכלל שחוזר
 * בפרויקט הזה שמונה פעמים: NULL אינו 0, ו-0 פירושו "נבדק ואין".
 * כאן הוא בממשק, ולכן הוא נבדק כאן.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SRC = readFileSync(join(ROOT, "src", "tim", "AskWidgets.tsx"), "utf8");
/** ההערות מוסרות — הן מסבירות את הכללים ומזכירות את המילים. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("רכיבי המענה בבועה", () => {
  it("שדה גובה ריק נאמר ואינו נשלח כאפס", () => {
    expect(CODE.includes("לא יודעת")).toBe(true);
    // 🔴 ואין נפילה ל-0 בשום מקום בנתיב הגובה.
    expect(/heights[\s\S]*?\|\|\s*0/.test(CODE), "נמצאה נפילה לאפס").toBe(false);
  });

  it("בחירה ריקה בצ'יפים היא תשובה, ולא שתיקה", () => {
    expect(CODE.includes("אין לנו רגישויות מיוחדות")).toBe(true);
  });

  it("אפס ילדים נאמר במילים, ולא כ-0 ילדים", () => {
    expect(CODE.includes("בלי ילדים")).toBe(true);
  });

  it("כל הרכיבים מחזירים מחרוזת ל-onAnswer", () => {
    const calls = [...CODE.matchAll(/onAnswer\(([\s\S]{0,80})/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const c of calls) {
      // ⚠️ מבנה היה נראה כמו `onAnswer({` — וזה מה שנאסר.
      expect(c?.trimStart().startsWith("{"), "רכיב מחזיר מבנה ולא טקסט").toBe(false);
    }
  });
});
