import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { P } from "../../../scripts/paths";

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

const PUBLIC_DIR = join(P.DIST_TIM, "assets");

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
    const src = readFileSync(join(P.WEB_SRC, "tim", "TimOnlyApp.tsx"), "utf8");
    // ⚠️ **ייבוא או שימוש ב-JSX — לא אזכור.** הגרסה הראשונה של הבדיקה
    // חיפשה את השם בכל מקום, ונפלה על ההערה שמסבירה למה הוא לא שם.
    // בדיקה שאוסרת לתעד את הבאג היא בדיקה שתוסר.
    expect(/^\s*import\b.*FeedbackNote/m.test(src), "ייבוא סטטי מחזיר את הדליפה").toBe(false);
    expect(/<FeedbackNote\b/.test(src), "שימוש ב-JSX מחזיר את הדליפה").toBe(false);
  });

  it("רק נקודת הכניסה של הבדיקה מייבאת אותו", () => {
    const testMain = readFileSync(join(P.WEB_SRC, "tim", "test-main.tsx"), "utf8");
    expect(testMain.includes("FeedbackNote")).toBe(true);

    const publicMain = readFileSync(join(P.WEB_SRC, "tim", "main.tsx"), "utf8");
    expect(publicMain.includes("FeedbackNote")).toBe(false);
    expect(publicMain.includes("test-feedback.css")).toBe(false);
    expect(publicMain.includes("save-note")).toBe(false);

    // ⚠️ וגם מסך הצ'אט המשותף אינו יודע על נתיב הכתיבה.
    const app = readFileSync(join(P.WEB_SRC, "tim", "TimOnlyApp.tsx"), "utf8");
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
    const toml = readFileSync(P.NETLIFY_TOML, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    const publicBlock = toml.slice(
      toml.indexOf("[build]"),
      toml.indexOf('[context."tim-test"]'),
    );
    expect(publicBlock.includes("tim-test")).toBe(false);
    expect(publicBlock.includes('publish = "dist-tim"')).toBe(true);

    const testBlock = toml.slice(toml.indexOf('[context."tim-test"]'));
    expect(testBlock.includes('publish = "dist-tim-test"')).toBe(true);
  });

  /**
   * 🔴 **Netlify מכבד `command` ו-`publish` לפי הקשר־ענף — אבל לא
   * `redirects` ולא `headers`.** הבנייה הראשונה של הענף הוכיחה את זה
   * באוויר: הענף נבנה והוגש מ-`dist-tim-test`, וההפניה שחלה בפועל
   * הייתה הגלובלית — ל-`/tim.html`, שלא היה שם. 404 על כל כתובת,
   * כולל השורש.
   *
   * ⚠️ **ולכן הבלוק הזה אסור שיחזור.** קונפיגורציה שנקראת כאילו היא
   * פועלת ואינה פועלת היא בדיוק הכשל שהתברר כאן.
   */
  it("אין ניתוב או כותרות לפי הקשר — Netlify מתעלם מהם", () => {
    const toml = readFileSync(P.NETLIFY_TOML, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(toml.includes('[[context."tim-test".redirects]]')).toBe(false);
    expect(toml.includes('[[context."tim-test".headers]]')).toBe(false);
  });

  /**
   * ⚠️ **התחליף לניתוב הוא קבצים שקיימים.** `index.html` נמצא לפני
   * שההפניה נשקלת בכלל, ו-`tim.html` הוא היעד של הכלל הגלובלי שחל
   * גם כאן. שניהם עותקים של אותו דף — אין כאן מסך שני שיתפצל.
   */
  it("תצורת הבנייה מוציאה את שני דפי הנפילה", () => {
    const cfg = readFileSync(P.VITE_TIM_TEST_CONFIG, "utf8");
    // ⚠️ ההערות מוסרות — הן מזכירות את שמות הקבצים שוב ושוב, וזו הפעם
    // הרביעית בסשן הזה שגלאי שכתבתי היה קורא פרוזה כאילו היא הדבר עצמו.
    const code = cfg.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code.includes('"index.html"')).toBe(true);
    expect(code.includes('"tim.html"')).toBe(true);
  });

  const DIST_TEST = P.DIST_TIM_TEST;
  it.skipIf(!existsSync(join(DIST_TEST, "tim-test.html")))(
    "והיא אכן הוציאה אותם, עם noindex",
    () => {
      for (const name of ["index.html", "tim.html"]) {
        const file = join(DIST_TEST, name);
        expect(existsSync(file), `${name} חסר — השורש יחזיר 404`).toBe(true);
        expect(readFileSync(file, "utf8").includes("noindex")).toBe(true);
      }
    },
  );

  it("שתי הבניות נפרדות לחלוטין", () => {
    const pub = readFileSync(P.VITE_TIM_CONFIG, "utf8");
    const test = readFileSync(P.VITE_TIM_TEST_CONFIG, "utf8");
    expect(pub.includes("dist-tim-test")).toBe(false);
    expect(test.includes("dist-tim-test")).toBe(true);
    expect(pub.includes("tim-test.html")).toBe(false);
    expect(test.includes("tim-test.html")).toBe(true);
  });
});
