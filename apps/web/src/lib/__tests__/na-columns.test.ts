import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { experiences } from "../../data";
import { P } from "../../../../../scripts/paths";

/**
 * 🔴 חוק הבנייה שפולה אישרה דרך פיליפ, 08.09.
 *
 *   כל עמודה שהמאסטר יכול לכתוב בה `N/A` חייבת להיות ארבע־מצבית
 *   בכל שכבה — סכימה, ייבוא, מסד.
 *
 * ⚠️ **וזה הפריט היחיד שנכתב כדי לתפוס את הפעם הבאה ולא את הפעם הזו.**
 * אותו באג הופיע שלוש פעמים בעמודות שונות — `purchase_type`, ואז
 * גובה/`gets_wet` (66 שורות), ואז `sens_heights` (77 שורות). בכל פעם
 * תוקנה העמודה, והתבנית שרדה. הבדיקה הזו נכשלת ביום שעמודה **חדשה**
 * מקבלת N/A ולא מוכנה לו — ולא בעוד חודשיים כשמשפחה תקבל תשובה שגויה
 * ואיש לא יידע למה.
 */

/**
 * קבוצה א׳ — דגלים ארבע־מצביים. `N/A` חייב לשרוד כ-"na".
 */
const FLAG_COLUMNS: Record<string, keyof (typeof experiences)[number]> = {
  big_drops: "bigDrops",
  spinning: "spinning",
  air_conditioned: "airConditioned",
  is_motion_simulator: "isMotionSimulator",
  uses_large_screens_or_3d: "usesLargeScreensOr3d",
  gets_wet: "getsWet",
  sens_enclosed_dark: "sensEnclosedDark",
  sens_heights: "sensHeights",
  sens_loud_sudden: "sensLoudSudden",
  sens_strobe: "sensStrobe",
};

/**
 * קבוצה ב׳ — עמודות מספריות. ידועות, ולא נסגרו עדיין.
 *
 * פולה אישרה שהעיקרון חל גם עליהן — למופע אין מהירות מרבית, וזה "לא חל"
 * ולא "לא נמדד" — אבל מנגנון המימוש למספר שונה מזה של דגל, והוא סבב
 * נפרד. הן רשומות כאן כדי ש**היעדר** הטיפול יהיה גלוי ולא ייבלע.
 */
const NUMERIC_PENDING = new Set([
  "opened_year", "duration_minutes", "max_speed_kmh", "inversions",
]);

/**
 * קבוצה ג׳ — עמודות טקסט שבהן `N/A` נשמר כערך גולמי ולא מכווץ.
 *
 * ⚠️ אלה **אינן** פטורות מהכלל; הן מקיימות אותו במנגנון אחר. `fastAccess`
 * שומר את `lightningLaneType` הגולמי בדיוק כדי שההבחנה בין "אין מוצר
 * כזה כאן" (N/A ביוניברסל) לבין "לא נבדק" לא תאבד — 134 שורות.
 *
 * 🔴 ו-`Area / Land` שומר את המחרוזת `"N/A"` כפי שהיא על 8 שורות של
 * אמנים נודדים. הנתון לא אבד — אבל הוא **מוצג** כך: משפחה דוברת עברית
 * רואה "N/A" במקום שם אזור. זו אנגלית בממשק עברי, אותה משפחה של תקלות
 * כמו "⚠️ סטטוס: check" שתוקנה היום. מדווח לפולה — ההכרעה מה ייאמר שם
 * היא שלה.
 */
const RAW_PRESERVED = new Set([
  "Lightning Lane Type",
  "Premier Pass Included?",
  "Included in Multi Pass?",
  "Separate Single Pass Purchase Required?",
  "Extra Cost Beyond Multi Pass?",
  "Optional Fast Access / Pass",
  "Area / Land",
]);

/**
 * ⚠️ מפרסר אמיתי ולא `split(",")`.
 *
 * 🔴 הגרסה הראשונה של הבדיקה הזו פיצלה בפסיקים, ועמודת הסטטוס מכילה
 * משפטים עם פסיקים בתוך מרכאות. כל האינדקסים אחריה זזו, והבדיקה "מצאה"
 * N/A ב-`spinning` על שורות שאין בהן. **בדיקה שגויה גרועה מחוסר בדיקה:**
 * היא שולחת לתקן דאטא תקין.
 */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\ufeff/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  const headers = (out.shift() ?? []).map((h) => h.trim());
  return { headers, rows: out.filter((r) => r.some((v) => v.trim())) };
}

const CSV = parseCsv(
  readFileSync(join(P.SOURCE, "product_export.csv"), "utf8"),
);

const isNa = (v: string) => /^n\/?a$/i.test(v.trim());

const naColumns = (() => {
  const found = new Set<string>();
  for (const row of CSV.rows) {
    row.forEach((cell, i) => {
      if (isNa(cell)) found.add(CSV.headers[i] ?? `#${i}`);
    });
  }
  return found;
})();

describe("כל עמודה שיכולה לשאת N/A", () => {
  it("המאסטר אכן מכיל N/A — אחרת הבדיקה אינה בודקת דבר", () => {
    expect(naColumns.size).toBeGreaterThan(0);
  });

  /**
   * ⚠️ הבדיקה הראשונה היא על **המיפוי**, לא על הערכים: עמודה חדשה שתקבל
   * N/A ואינה מוכרת כאן תיעצר, ומי שיוסיף אותה ייאלץ להחליט מה לעשות
   * איתה במקום שהיא תיבלע.
   */
  it("כל עמודה כזו מוכרת, ואף אחת אינה מפתיעה", () => {
    const unknown = [...naColumns].filter(
      (c) => !(c in FLAG_COLUMNS) && !NUMERIC_PENDING.has(c) && !RAW_PRESERVED.has(c),
    );
    expect(unknown).toEqual([]);
  });

  /**
   * 🔴 הכלל עצמו: אם המאסטר כותב N/A בעמודה, הדאטהסט חייב להחזיק "na"
   * באיזושהי שורה. אם הוא לא — משמע הערך כווץ ל-null בדרך, וזה בדיוק
   * הבאג שחזר שלוש פעמים.
   */
  it("הערך שורד את הייבוא ואינו מכווץ ל'לא נבדק'", () => {
    const lost: string[] = [];
    for (const column of naColumns) {
      const field = FLAG_COLUMNS[column];
      if (!field) continue; // קבוצה ב׳ או ג׳ — מטופלות אחרת, ומוצהרות למעלה
      if (!experiences.some((e) => e[field] === "na")) lost.push(column);
    }
    expect(lost).toEqual([]);
  });

  /**
   * ⚠️ והכיוון ההפוך, שהוא החמור מבין השניים: `false` פירושו "נבדק ואין",
   * וזו אמירה שמשפחה מסתמכת עליה. שורה שהמאסטר כתב עליה N/A ושהגיעה
   * כ-false היא הצהרת בטיחות שאיש לא עשה.
   */
  it("ואינו הופך ל-false", () => {
    const keyAt = CSV.headers.indexOf("Key");
    const wrong: string[] = [];
    for (const cells of CSV.rows) {
      const key = (cells[keyAt] ?? "").trim();
      const row = experiences.find((e) => e.key === key);
      if (!row) continue;
      cells.forEach((cell, i) => {
        const column = CSV.headers[i] ?? "";
        if (!isNa(cell)) return;
        const field = FLAG_COLUMNS[column];
        if (field && row[field] === "false") wrong.push(`${key} · ${column}`);
      });
    }
    expect(wrong).toEqual([]);
  });
});
