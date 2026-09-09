import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **קובץ נגזר שהתיישן בשקט, וטים ענה מהטקסט הישן.**
 *
 * `db/knowledge-seed/knowledge.sql` נוצר מ-`knowledge/*.md`. ב-08.09 נערכה
 * פסקת Premier Pass לפי ניסוח שפולה אישרה — **והזרע לא נבנה מחדש.** המקור
 * היה נכון, הנגזר היה ישן, והמסד קיבל את הישן. איש לא ראה את זה במשך יום,
 * כי שום דבר לא השווה בין השניים.
 *
 * ⚠️ זו אותה משפחה של "שדה נגזר אינו מאוחסן": עמודה נגזרת נשברת בקול
 * כשהמציאות משתנה, וקובץ נגזר **שותק**. הבדיקה הזו היא מה שנותן לו קול.
 *
 * ⚠️ **והיא חייבת להיכשל כשעורכים `.md` בלי לבנות.** אם היא עוברת תמיד,
 * היא לא בודקת דבר — בדיוק הכשל של 915 שורות הבדיקות שלא רצו.
 */
describe("קובצי הזרע מעודכנים מול המקור שלהם", () => {
  it("knowledge.sql נבנה מ-knowledge/ העדכני", () => {
    const run = () =>
      execFileSync("python3", ["scripts/build-knowledge-seed.py", "--check"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    expect(run).not.toThrow();
  });
});
