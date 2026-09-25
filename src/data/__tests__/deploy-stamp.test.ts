import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { P, ROOT } from "../../../scripts/paths";

/**
 * 🔴 **`FIT_STAMP` אמר "זהה" על פונקציה ישנה, וזה נמדד באוויר.**
 *
 * בריצה החיה הראשונה (25.09) החותם שחזר מסופהבייס היה זהה לזה שברפו,
 * ובאותה תשובה `allowed_origins` לא חזר כלל — כלומר תיקון ה-CORS
 * מעולם לא נפרס. שני הדברים נכונים יחד: `FIT_STAMP` מגבב את **טקסט
 * כללי ההתאמה בלבד**, ושינוי קוד שאינו נוגע בניסוח אינו מזיז אותו.
 *
 * ⚠️ **הוא לא שיקר — הוא נשאל שאלה שהוא אינו מודד.** והשאלה הזו היא
 * בדיוק מה שהוא נבנה בשבילו, כך שהפער נקרא כתשובה.
 *
 * `DEPLOY_STAMP` מגבב את הקובץ כולו. הבדיקה הזו היא מה שמונע ממנו
 * להתיישן בשקט — אותה צורה בדיוק כמו `seed-freshness.test.ts`.
 */


describe("החותם של הפריסה מכסה את הקובץ כולו", () => {
  it("והוא מעודכן", () => {
    // ⚠️ **הסקריפט עצמו הוא הבודק** — לא העתק שלו כאן. שכפול הלוגיקה
    // היה מייצר בדיוק את המקור השני שהפרויקט אוסר.
    const run = () =>
      execFileSync("python3", [join(P.SCRIPTS, "build-deploy-stamp.py"), "--check"], {
        cwd: ROOT,
        encoding: "utf8",
      });
    expect(run).not.toThrow();
  });
});
