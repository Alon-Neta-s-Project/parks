import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { P } from "../../../../../scripts/paths";

/**
 * 🔴 **הבדיקה הזו נכתבה אחרי שהעדרה כמעט מחק שלוש שורות אמיתיות.**
 *
 * הערה בקוד של טים אמרה ש-`temporarily_closed` ו-`coming_soon` אינם
 * נוצרים לעולם. היא הייתה שגויה: `npm run import` באמת פולט שלושה
 * ערכים, אבל `build-content-seed.py` מכריע מעל שלוש שורות שסומנו
 * `check`, כל אחת אחרי אימות מול אתר המפעיל. על בסיס ההערה השגויה
 * הוצעה הסרה של שני הערכים מהמפה — והיא הייתה מפילה את שלוש השורות
 * לברירת המחדל, כלומר `⚠️ סטטוס: temporarily_closed` בממשק עברי.
 *
 * ⚠️ **וזה בדיוק מה שכבר קרה ל-`check`.** ההערה נכתבה כשהיא הייתה
 * נכונה, ונשארה אחרי שהתמונה השתנתה.
 *
 * זו האזהרה של מיגרציה 037 — **שינוי אוצר מילים מחייב שינוי בשני
 * הצדדים** — כשהיא נאכפת ולא רק כתובה.
 */


/** ⚠️ ההערות מוסרות. שני הקבצים מזכירים את הערכים בפרוזה. */
const noPyComments = (s: string) => s.replace(/^\s*#.*$/gm, "");
const noTsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** אוצר המילים שבונה הזרע יכול לייצר. */
function producible(): Set<string> {
  const py = noPyComments(readFileSync(join(P.SCRIPTS, "build-content-seed.py"), "utf8"));

  const plain = py.match(/^STATUS\s*=\s*\{([^}]*)\}/m);
  const decided = py.match(/^STATUS_DECIDED\s*=\s*\{([\s\S]*?)^\}/m);
  expect(plain, "STATUS לא נמצא — הבדיקה קוראת קובץ שהשתנה").not.toBe(null);
  expect(decided, "STATUS_DECIDED לא נמצא — הבדיקה קוראת קובץ שהשתנה").not.toBe(null);

  const out = new Set<string>();
  // ⚠️ הערך, לא המפתח: `{"open": "open"}` ו-`(…, "check"): "temporarily_closed"`
  // שניהם ממפים **אל** מה שנכתב למסד.
  for (const m of plain![1]!.matchAll(/:\s*"([a-z_]+)"/g)) out.add(m[1]!);
  for (const m of decided![1]!.matchAll(/:\s*"([a-z_]+)"/g)) out.add(m[1]!);
  return out;
}

/** אוצר המילים שטים יודע לנסח בעברית. */
function rendered(): Set<string> {
  const ts = noTsComments(readFileSync(join(P.TIM_DIR, "context.ts"), "utf8"));
  const block = ts.match(/const say: Record<string, string> = \{([\s\S]*?)\n\s*\};/);
  expect(block, "מפת הניסוחים לא נמצאה — הבדיקה קוראת קובץ שהשתנה").not.toBe(null);
  return new Set([...block![1]!.matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]!));
}

describe("אוצר המילים של הסטטוס זהה בשני הצדדים", () => {
  it("כל ערך שהזרע מייצר מקבל ניסוח עברי", () => {
    const say = rendered();
    for (const status of producible()) {
      // ⚠️ `open` לעולם אינו מגיע למפה — הענף רץ רק על מה שאינו פתוח.
      if (status === "open") continue;
      expect(
        say.has(status),
        `"${status}" נכתב למסד ואין לו ניסוח — יגיע למסך כמילה באנגלית`,
      ).toBe(true);
    }
  });

  /**
   * ⚠️ **הכיוון ההפוך אינו נבדק כאן, בכוונה.**
   *
   * `check` מנוסח במפה, ובונה הזרע אינו כותב אותו למסד — הוא מכריע
   * עליו או מדלג. כלומר ייתכן שזה ניסוח לערך שאינו מגיע. **ייתכן**,
   * ולא ודאי: `db-conformance.ts` טוען שורות בנתיב אחר, ולא ביררתי
   * אותו עד הסוף.
   *
   * 🔴 **ובדיוק זה היה הכשל שהוליד את הקובץ הזה** — טענה על "מה נוצר"
   * שנשענה על מודל חלקי של הכותבים. אז הפריט נרשם כשאלה פתוחה
   * ב-Issue #29 ולא כבדיקה שמאמתת מודל שלא ביססתי.
   */
});
