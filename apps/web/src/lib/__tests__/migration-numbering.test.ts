import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { P } from "../../../../../scripts/paths";

/**
 * המספר הוא סימן האישור.
 *
 * הוצע על ידי קודי, אושר על ידי גיא, 08.09: קובץ שממתין לאישור אינו מקבל
 * מספר מיגרציה כלל, והמספר ניתן לו **ברגע האישור**.
 *
 * 🔴 מה שזה מונע, וקרה כבר: נטע הריצה את מיגרציה 036 לפני האישור הסופי
 * של גיא — **כי היא נראתה מוכנה. היה לה מספר.** אצווה מסודרת הייתה
 * הבטחה שלי; מספר הוא עובדה שהיא רואה בעצמה.
 *
 * ⚠️ והבדיקה כאן היא מה שהופך את זה לכלל ולא לכוונה. כלל שכתוב רק
 * בהערה תלוי בזיכרון של מי שכותב, וזו החולשה שהוא נועד לסלק.
 */
// ⚠️ **שתי תיקיות, שני כללים.** ההיסטוריה (48 המיגרציות שרצו ביד עד 25.09)
// ממוספרת בשלוש ספרות ונעולה. מיגרציות חדשות הולכות ל-dbmate, בחותמת זמן.
const MIGRATIONS = P.MIGRATIONS_HISTORY;
const DBMATE = P.MIGRATIONS;
const PENDING = join(DBMATE, "pending");
const NUMBERED = /^\d{3}_/;

describe("מספור מיגרציות", () => {
  it("כל קובץ SQL מאושר נושא מספר", () => {
    const unnumbered = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => !NUMBERED.test(f));
    expect(unnumbered).toEqual([]);
  });

  /**
   * ⚠️ הכיוון ההפוך, והוא החשוב יותר: קובץ שקיבל מספר ונשאר ב-pending
   * מחזיק את סימן האישור בלי האישור. זה בדיוק המצב שהכלל אוסר.
   */
  it("אין קובץ ממוספר שממתין לאישור", () => {
    if (!existsSync(PENDING)) return;
    const numbered = readdirSync(PENDING)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => NUMBERED.test(f));
    expect(numbered).toEqual([]);
  });

  /**
   * ⚠️ ושני קבצים באותו מספר הם שני דברים שונים שנטע תריץ כאחד. זה כבר
   * קרה בפרויקט הזה — 034 הופיע פעמיים — ומספר כפול הורס את המשמעות של
   * "המספר הוא סימן האישור": אי אפשר לדעת איזה מהם אושר.
   */
  it("אין שני קבצים באותו מספר", () => {
    /**
     * 🔴 חריג אחד, ידוע, ומחכה להכרעת גיא.
     *
     * `034_eight_hebrew_names.sql` ו-`034_sensitivities_vocabulary.sql`
     * נושאות את אותו מספר. **שתיהן כבר רצו בפרודקשן.**
     *
     * ⚠️ לא שיניתי שם בעצמי, ובכוונה: שינוי שם של מיגרציה שכבר הורצה
     * משנה את הרשומה המשותפת שגיא מבקר, והמספר הפנוי הבא (040) היה
     * מזיז אותה **אחרי** 035–039 בסדר ההרצה. אם משהו שם תלוי בה, זה
     * שינוי התנהגות ולא שינוי שם.
     *
     * ⚠️ והחריג רשום כאן במפורש ולא נבלע: הוא מופיע ברשימה, הוא מוגבל
     * לצמד הזה בדיוק, וכל מספר כפול חדש יפיל את הבנייה.
     */
    const knownClash = "034: 034_eight_hebrew_names.sql · 034_sensitivities_vocabulary.sql";

    const seen = new Map<string, string[]>();
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql"))) {
      const n = f.slice(0, 3);
      seen.set(n, [...(seen.get(n) ?? []), f]);
    }
    const clashes = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([n, files]) => `${n}: ${[...files].sort().join(" · ")}`)
      .filter((c) => c !== knownClash);
    expect(clashes).toEqual([]);
  });
});

/**
 * 🔴 **ההיסטוריה נעולה ב-48.** קובץ 047 שנוסף לשם לא היה רץ אף פעם: dbmate
 * קורא רק את apps/server/db/migrations. הוא היה נראה כמו מיגרציה, ממוספר
 * ובסדר, ונשאר בחוץ — בדיוק "שאילתה שמורה אינה הרצה שהצליחה".
 */
describe("ההיסטוריה סגורה, והחדשות של dbmate", () => {
  it("ההיסטוריה היא 48 הקבצים, עד 046", () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    expect(files).toHaveLength(48);
    expect(files.at(-1)).toBe("046_tester_note.sql");
  });

  it("מיגרציה של dbmate נושאת חותמת זמן ובלוק migrate:up", async () => {
    const { readFileSync } = await import("node:fs");
    const bad = readdirSync(DBMATE)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f) || !readFileSync(join(DBMATE, f), "utf8").includes("-- migrate:up"));
    expect(bad).toEqual([]);
  });

  it("ממתין לאישור אינו נושא חותמת זמן", () => {
    if (!existsSync(PENDING)) return;
    const stamped = readdirSync(PENDING).filter((f) => /^\d{14}_/.test(f));
    expect(stamped).toEqual([]);
  });
});

/**
 * ה-baseline נוצר מ-pg_dump, והוא נכנס ל-dbmate כמו שהוא. שלושה דברים
 * ששברו אותו בהרצה הראשונה, או שהיו שוברים:
 */
describe("ה-baseline של dbmate", () => {
  const file = () => readdirSync(DBMATE).find((f) => f.endsWith("_baseline.sql"));

  it("קיים, ואחד", () => {
    expect(readdirSync(DBMATE).filter((f) => f.endsWith("_baseline.sql"))).toHaveLength(1);
  });

  it("אין בו פקודות של psql — dbmate אינו psql", async () => {
    const { readFileSync } = await import("node:fs");
    const meta = readFileSync(join(DBMATE, file()!), "utf8").split("\n").filter((l) => l.startsWith("\\"));
    expect(meta).toEqual([]);
  });

  // ⚠️ המפתח האמיתי של tester_key() יושב בייצור בגוף הפונקציה (O8). ה-baseline
  // נבנה מהמיגרציות, ולכן נושא את הערך המציין — וכך זה חייב להישאר.
  it("tester_key() נושאת את הערך המציין, לא מפתח", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(join(DBMATE, file()!), "utf8");
    const body = sql.slice(sql.indexOf("FUNCTION public.tester_key()"));
    expect(body.slice(0, 400)).toContain("YOUR-TESTER-KEY-HERE");
  });
});
