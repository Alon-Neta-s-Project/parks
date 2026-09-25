import { describe, expect, it } from "vitest";
import he from "../../i18n/he.json";
import { pickWaiting } from "../Thinking";

describe("ניסוחי ההמתנה", () => {
  const options = he.ask.thinking as string[];

  it("שישה ניסוחים, וכולם שונים זה מזה", () => {
    expect(options).toHaveLength(6);
    expect(new Set(options).size).toBe(6);
  });

  /**
   * ⚠️ הכלל שהניסוחים האלה קלים להפר: החום של טים לעולם אינו בביטחון.
   * "מיד אענה לך" הוא הבטחה שנשברת כשהתשובה היא "אין לי את זה", וניסוח
   * שנכתב מאוחר יותר יכול להחליק פנימה בלי שאיש ישים לב.
   */
  it("אף ניסוח אינו מבטיח שתהיה תשובה", () => {
    for (const o of options) {
      expect(o).not.toMatch(/אענה|התשובה|אמצא|יש לי|בטוח/);
    }
  });

  it("הבחירה נופלת תמיד בתוך הרשימה", () => {
    for (let i = 0; i < 200; i++) {
      expect(options).toContain(pickWaiting(options));
    }
  });

  /**
   * ⚠️ בדיקה הסתברותית, ובכוונה: הכשל שהיא תופסת אינו "נבחר ערך לא חוקי"
   * אלא "נבחר תמיד אותו ערך" — למשל אינדקס שננעל על 0. זה עובר כל בדיקה
   * שבודקת ערך יחיד.
   */
  it("לא נבחר תמיד אותו ניסוח", () => {
    const seen = new Set(Array.from({ length: 200 }, () => pickWaiting(options)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("רשימה בת פריט אחד אינה מפילה", () => {
    expect(pickWaiting(["רק זה"])).toBe("רק זה");
  });
});
