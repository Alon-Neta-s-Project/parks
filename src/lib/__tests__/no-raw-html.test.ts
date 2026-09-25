import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../../scripts/paths";

/**
 * 🔴 **תנאי של גיא (22.09), ונאכף במקום להיכתב.**
 *
 * `tester_note.note` הוא טקסט חופשי שנכתב דרך פונקציה המוענקת ל-`anon`.
 * טקסט כזה שמוצג בלי escaping הוא stored XSS — גם במסך פנימי, ואולי
 * דווקא בו, כי שם יושבת מי שיש לה הרשאות.
 *
 * React עושה escaping כברירת מחדל, ולכן אין היום בעיה. **אבל "אין
 * בעיה היום" הוא בדיוק מה שנשבר בשקט** כשמישהו יבנה את הדשבורד ויצטרך
 * להציג שורה עם עיצוב.
 *
 * ⚠️ **גבול הכיסוי, ומי שיבחר רכיב תצוגה צריך לדעת אותו** (גיא, 23.09):
 * הבדיקה סורקת קריאות ישירות ב-`src`. רכיב חיצוני — מרנדר markdown,
 * טבלה, הדגשת תחביר — שעושה rendering לא-escaped **בתוכו** לא ייתפס
 * כאן. זה אינו פגם בבדיקה; זו השאלה שצריך לשאול על הספרייה עצמה
 * כשבוחרים אותה, ולא אחר כך.
 */

/**
 * ⚠️ **מורכבות בזמן ריצה — והבדיקה סימנה את עצמה בלי זה.**
 *
 * היא עברה כשנכתבה, כי הקובץ עוד לא היה במעקב git והסריקה קוראת רק
 * את מה שבמעקב. ברגע שנכנס — הוא הפך לקובץ ב-`src` שמכיל את
 * המחרוזות האסורות.
 *
 * זו בדיוק אותה צורה כמו המפתחות המזויפים בסורק הסודות, וכבר פתרתי
 * אותה שם. **דוגמה שנראית אמיתית היא אמיתית מבחינת הכלי שסורק אותה.**
 */
const BANNED = [
  "dangerously" + "SetInnerHTML",
  "inner" + "HTML",
  "outer" + "HTML",
  "document" + ".write",
];

function tracked(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((f) => /^src\/.*\.(ts|tsx)$/.test(f));
}

/**
 * ⚠️ **ההערות מוסרות לפני החיפוש.**
 *
 * זה כבר קרה ארבע פעמים בסשן אחד: גלאי שקורא את הפרוזה שסביב הדבר
 * במקום את הדבר. `TimOnlyApp.tsx` מכיל הערה שאומרת במפורש שאין שם
 * `dangerouslySetInnerHTML` — ובדיקה תמימה הייתה נופלת עליה, ואוסרת
 * לתעד את הכלל.
 */
function codeOnly(text: string): string {
  // ⚠️ **על כל הטקסט, לא שורה־שורה.** הגרסה הראשונה סיננה לפי תחילת
  // שורה, ונפלה על הערת JSX רב-שורתית ב-`TimOnlyApp.tsx` — שורת המשך
  // אינה מתחילה ב-`//` ולא ב-`*`. זו הייתה הפעם החמישית בסשן אחד
  // שגלאי שכתבתי קורא פרוזה כאילו היא קוד.
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("אין רינדור של טקסט חופשי בלי escaping", () => {
  it("אף קובץ ב-src אינו כותב HTML גולמי", () => {
    const hits: string[] = [];
    for (const file of tracked()) {
      const code = codeOnly(readFileSync(join(ROOT, file), "utf8"));
      for (const bad of BANNED) {
        if (code.includes(bad)) hits.push(`  ${file} → ${bad}`);
      }
    }
    expect(hits, `רינדור גולמי:\n${hits.join("\n")}`).toEqual([]);
  });
});
