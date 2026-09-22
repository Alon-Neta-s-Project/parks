import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **הדרישה של נטע: גרסת הבדיקה לא תתערבב עם הקיים.**
 *
 * ⚠️ **וזה כמעט נכשל בשקט.** בגרסה הראשונה `TimOnlyApp` ייבא את
 * `FeedbackNote` ישירות ובדק את ה-prop לפני הרינדור — והקוד נכנס
 * לחבילה הציבורית בכל זאת. ייבוא סטטי נכלל גם כשהענף לא נבחר,
 * ו-tree-shaking אינו יכול להסיר רכיב שמופיע ב-JSX.
 *
 * הקריאה בקוד נראתה נכונה לגמרי. **רק ספירה בחבילה שנבנתה הראתה את
 * זה**, וזו בדיוק הסיבה שהבדיקה הזו סופרת ולא רק קוראת.
 */

const ROOT = join(__dirname, "..", "..", "..");
const PUBLIC_DIR = join(ROOT, "dist-tim", "assets");

/** סימנים שקיימים רק בגרסת הבדיקה. */
const TEST_ONLY = [
  "feedback__flag",
  "tim-test-notes-v1",
  "מה לא בסדר בתשובה",
  // ⚠️ נוספו כשההערות עברו למסד — נתיב כתיבה שאסור שיגיע לציבורית.
  "save_tester_note",
  "tim-test-key-v1",
];

function bundleText(dir: string): string | null {
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

describe("גרסת הבדיקה אינה נכנסת לחבילה הציבורית", () => {
  const text = bundleText(PUBLIC_DIR);

  it.skipIf(text === null)("אין בה סימן מקוד הפידבק", () => {
    for (const marker of TEST_ONLY) {
      expect(text?.includes(marker), `"${marker}" נמצא בחבילה הציבורית`).toBe(false);
    }
  });

  /**
   * ⚠️ **הבדיקה למעלה מדלגת כשאין חבילה בנויה** — וזה נכון, כי היא
   * בודקת תוצר בנייה. אבל דילוג שקט הוא בדיוק "בדיקה שלא רצה", ולכן
   * אלה שמתחתיה רצות תמיד וקוראות את המקור.
   */
  it("TimOnlyApp אינו מייבא את רכיב הפידבק", () => {
    const src = readFileSync(join(ROOT, "src", "tim", "TimOnlyApp.tsx"), "utf8");
    // ⚠️ **ייבוא או שימוש ב-JSX — לא אזכור.** הגרסה הראשונה של הבדיקה
    // חיפשה את השם בכל מקום, ונפלה על ההערה שמסבירה למה הוא לא שם.
    // בדיקה שאוסרת לתעד את הבאג היא בדיקה שתוסר.
    expect(/^\s*import\b.*FeedbackNote/m.test(src), "ייבוא סטטי מחזיר את הדליפה").toBe(false);
    expect(/<FeedbackNote\b/.test(src), "שימוש ב-JSX מחזיר את הדליפה").toBe(false);
  });

  it("רק נקודת הכניסה של הבדיקה מייבאת אותו", () => {
    const testMain = readFileSync(join(ROOT, "src", "tim", "test-main.tsx"), "utf8");
    expect(testMain.includes("FeedbackNote")).toBe(true);

    const publicMain = readFileSync(join(ROOT, "src", "tim", "main.tsx"), "utf8");
    expect(publicMain.includes("FeedbackNote")).toBe(false);
    expect(publicMain.includes("test-feedback.css")).toBe(false);
    expect(publicMain.includes("save-note")).toBe(false);

    // ⚠️ וגם מסך הצ'אט המשותף אינו יודע על נתיב הכתיבה.
    const app = readFileSync(join(ROOT, "src", "tim", "TimOnlyApp.tsx"), "utf8");
    expect(/^\s*import\b.*save-note/m.test(app)).toBe(false);
  });

  /**
   * 🔴 **מיזוג הענף אינו יכול לשנות את מה שנבנה בפרודקשן.**
   *
   * הבנייה לבדיקה יושבת ב-`[context."tim-test"]`, שחל רק כששם הענף
   * הנבנה הוא `tim-test`. אילו היא הייתה יושבת ב-`[build]` — מיזוג
   * היה מעלה את גרסת הבדיקה לאוויר, והיא נראית כמעט זהה.
   */
  it("הקשר הבנייה הציבורי אינו יודע על גרסת הבדיקה", () => {
    /**
     * ⚠️ **ההערות מוסרות לפני הבדיקה — והן הפילו אותה פעמיים קודם.**
     *
     * הפסקה שמסבירה למה ההקשר הזה קיים מזכירה `tim-test` שוב ושוב,
     * והבדיקה קראה אותה כאילו היא קונפיגורציה. זו הפעם השלישית
     * בסשן הזה שגלאי שכתבתי קורא פרוזה כאילו היא הדבר עצמו — אחרי
     * המפתחות המזויפים בסורק הסודות והדוגמאות בבודק הנתיבים.
     *
     * **הכלל שיוצא מזה: לבדוק את הערך, לא את הטקסט שסביבו.**
     */
    const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    const publicBlock = toml.slice(
      toml.indexOf("[build]"),
      toml.indexOf('[context."tim-test"]'),
    );
    expect(publicBlock.includes("tim-test")).toBe(false);
    expect(publicBlock.includes('publish = "dist-tim"')).toBe(true);

    // ובהקשר הבדיקה — גם ניתוב משלו, אחרת כל כתובת שם מגישה את טים
    // הציבורי מתוך תיקיית הבדיקה.
    const testBlock = toml.slice(toml.indexOf('[context."tim-test"]'));
    expect(testBlock.includes('publish = "dist-tim-test"')).toBe(true);
    expect(testBlock.includes("/tim-test.html")).toBe(true);
    expect(testBlock.includes("noindex")).toBe(true);
  });

  it("שתי הבניות נפרדות לחלוטין", () => {
    const pub = readFileSync(join(ROOT, "vite.tim.config.ts"), "utf8");
    const test = readFileSync(join(ROOT, "vite.tim-test.config.ts"), "utf8");
    expect(pub.includes("dist-tim-test")).toBe(false);
    expect(test.includes("dist-tim-test")).toBe(true);
    expect(pub.includes("tim-test.html")).toBe(false);
    expect(test.includes("tim-test.html")).toBe(true);
  });
});
