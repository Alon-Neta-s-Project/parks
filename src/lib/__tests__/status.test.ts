import { describe, expect, it } from "vitest";
import { status } from "../../../scripts/import-content";

/**
 * 🔴 הבדיקה שנולדה מכשל אמיתי במסך חי, 08.09.
 *
 * נטע שאלה את טים אם Krakatau Aqua Coaster פתוח, והוא ענה "סגור כעת".
 * המשפט במאסטר פותח במילה **Open**. הכלל בייבוא חיפש את הצירוף
 * "closure begins" ומצא אותו — בתוך תיאור של סגירה **עתידית**.
 *
 * תשע-עשרה שורות, כל Volcano Bay, סומנו סגורות.
 */
describe("סיווג הסטטוס מהמאסטר", () => {
  it("המקרה שנשבר: משפט שפותח ב-Open הוא פתוח, גם כשמוזכרת בו סגירה עתידית", () => {
    const v = "Open as of Aug 24, 2026. Planned park maintenance closure begins Oct 26, 2026.";
    expect(status(v).state).toBe("open");
    // ⚠️ והתאריך אינו נזרק. הוא נשאר בהערה, ששם הוא נכון.
    expect(status(v).note).toBe(v);
  });

  it("סגירה בהווה עדיין נקראת סגירה", () => {
    expect(status("Temporarily unavailable Jan 5–Nov 19, 2026 (official Universal closure schedule).").state)
      .toBe("closed");
    expect(status("Temporarily unavailable on Disney's Aug. 2026 calendar; verify reopening before visit.").state)
      .toBe("closed");
  });

  it("המקרה הרגיל — 217 מתוך 242 השורות", () => {
    expect(status("Open / current")).toEqual({ state: "open", note: null });
  });

  it("מה שאינו הכרעה נשאר לבדיקה, והמשפט נשמר", () => {
    for (const v of [
      "Opens Sep 14, 2026; expected to be available for late-Sep visits, subject to change.",
      "Check current Disney calendar before visit; refurbishment status can change.",
      "Status varies — see fill_notes",
    ]) {
      expect(status(v)).toEqual({ state: "check", note: v });
    }
  });

  /**
   * ⚠️ הבדיקה שתופסת את הכשל הבא ולא את זה שכבר קרה: כל שמונת הערכים
   * שקיימים במאסטר היום, ואף אחד מהם אינו מסווג סגור אלא אם נאמר בו
   * במפורש שהוא אינו זמין **עכשיו**.
   */
  it("אין שורה שנקראת סגורה בלי שכתוב בה שהיא אינה זמינה כרגע", () => {
    const all = [
      "Open / current",
      "Open as of Aug 24, 2026. Planned park maintenance closure begins Oct 26, 2026.",
      "Temporarily unavailable on Disney's Aug. 2026 calendar; verify reopening before visit.",
      "Opens Sep 14, 2026; expected to be available for late-Sep visits, subject to change.",
      "Check current Disney calendar before visit; refurbishment status can change.",
      "Temporarily unavailable May 12, 2026–Winter 2026; reopening date not exact.",
      "Temporarily unavailable Jan 5–Nov 19, 2026 (official Universal closure schedule).",
      "Status varies — see fill_notes",
    ];
    for (const v of all) {
      if (status(v).state === "closed") {
        expect(v.toLowerCase()).toContain("temporarily unavailable");
      }
    }
    expect(all.filter((v) => status(v).state === "closed")).toHaveLength(3);
  });
});
