import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { P } from "../../../../../scripts/paths";

/**
 * 🔴 **אנחנו מייצרים קבצים ושולחים אותם, וזה עוקף כל הגנה של git.**
 *
 * קובץ `.txt` שנוצר כאן ונשלח בצ'אט אינו עובר review ואינו עובר commit.
 * אם ייכנס בו מפתח — הוא כבר בחוץ. ⚠️ וזה הערוץ שהכי קל לשכוח, כי הוא
 * אינו מרגיש כמו "פרסום".
 *
 * ⚠️ **ומה שהבדיקה הזו אינה:** אישור שאין דליפה. היא תופסת תבניות
 * מוכרות של חומר מפתח. סוד בפורמט אחר יעבור אותה — וזה כתוב גם בפלט
 * שלה, כדי שהצלחה לא תיקרא כערובה.
 */
describe("אין סודות ברפו ובקבצים שנשלחים", () => {
  it("לא נמצאה תבנית של מפתח", () => {
    const run = () =>
      execFileSync("python3", [join(P.SCRIPTS, "check-secrets.py")], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    expect(run).not.toThrow();
  });
});
