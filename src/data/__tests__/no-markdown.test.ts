import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **הכרעת פולה באישור נטע (25.09), מממצא בדיקה.**
 *
 * טים כתב `**מודגש**`, והמסך מציג טקסט ולא HTML — בכוונה, כי התשובה
 * מגיעה ממודל וזה מה שמונע הזרקה. התוצאה: המשתמשת ראתה כוכביות.
 *
 * שתי דרכים היו פתוחות, ופולה בחרה את הראשונה: **להוציא Markdown
 * מההוראות**, ולא ללמד את המסך לפרש אותו. לכן שני הכיוונים נבדקים —
 * שהכלל קיים, ושאין קוד שמנקה בדיעבד. מנקה כזה היה מקור אמת שני:
 * ההוראה אומרת "אל תכתוב" והקוד אומר "ואם כן, אמחק", ואז אף אחד לא
 * יודע מה באמת קרה.
 */

const ROOT = join(__dirname, "..", "..", "..");
const FN = readFileSync(join(ROOT, "supabase", "functions", "tim", "index.ts"), "utf8");

describe("טים אינו כותב Markdown", () => {
  it("הכלל נמצא בהוראות", () => {
    // ⚠️ הערך, ולא הפרוזה שסביבו: החיפוש הוא בתוך מחרוזת ההוראות.
    const start = FN.indexOf("const SYSTEM = `");
    expect(start, "בלוק ההוראות לא נמצא").toBeGreaterThan(-1);
    const system = FN.slice(start, FN.indexOf("${FIT_RULES}`;"));

    expect(system.includes("אל תשתמש בשום סימון Markdown")).toBe(true);
    expect(system.includes("להדגשה — מילים")).toBe(true);
  });

  it("ואין קוד שמנקה Markdown בדיעבד", () => {
    // ⚠️ ההערות מוסרות — הפסקה שמסבירה את ההחלטה מזכירה כוכביות.
    const code = FN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // מחפש replace עם כוכבית בתבנית — הצורה שמנקה הדגשה.
    expect(/\.replace\(\s*\/[^/\n]*\\\*/.test(code), "נמצא מנקה Markdown").toBe(false);
  });
});
