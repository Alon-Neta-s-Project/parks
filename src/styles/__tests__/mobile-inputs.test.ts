import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **שדה קלט שגודל הגופן בו קטן מ-16px מזיז את המסך ב-iPhone.**
 *
 * ספארי מגדיל את הדף אוטומטית כשנוגעים בשדה כזה, והמשתמשת מאבדת את
 * מקומה — בכל הקלדה, לא פעם אחת. נטע בודקת במובייל ובחו"ל, וזה
 * המקום שבו זה נמדד.
 *
 * ⚠️ **וזה לא ייתפס בבדיקה שקוראת עיצוב.** הערך 14.5px תקין לחלוטין
 * לשולחן עבודה, ונראה נכון בכל קריאה של הקובץ. רק הצמד "שדה קלט"
 * ו"רוחב טלפון" הופך אותו לבאג.
 */

const ROOT = join(__dirname, "..", "..", "..");
const CSS = ["src/styles/global.css", "src/tim/test-feedback.css"]
  .map((f) => readFileSync(join(ROOT, f), "utf8"))
  .join("\n");

/** הסלקטורים של שדות שמקלידים בהם. */
const INPUTS = [".composer__input", ".feedback__text", ".testbar__key"];

describe("שדות קלט במובייל", () => {
  it("כולם מקבלים 16px לפחות ברוחב טלפון", () => {
    // ⚠️ ההערות מוסרות — הן מסבירות את הכלל ומזכירות 16px.
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

    // הבלוקים של max-width קטן או שווה ל-480
    const blocks = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/g)]
      .filter((m) => Number(m[1]) <= 480)
      .map((m) => m[2])
      .join("\n");

    expect(blocks.length, "אין בלוק מובייל כלל").toBeGreaterThan(0);

    for (const sel of INPUTS) {
      expect(blocks.includes(sel), `${sel} אינו מכוסה בבלוק המובייל`).toBe(true);
    }

    // 🔴 והערך עצמו, ולא רק שהסלקטור מוזכר: 16px ומעלה.
    const sizes = [...blocks.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length, "לא נמצא font-size בבלוק המובייל").toBeGreaterThan(0);
    for (const px of sizes) {
      expect(px, `נמצא font-size של ${px}px — ספארי יגדיל את הדף`).toBeGreaterThanOrEqual(16);
    }
  });
});
