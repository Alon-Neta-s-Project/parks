import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { P } from "../../../scripts/paths";

/**
 * 🔴 **קובץ נגזר שהתיישן בשקט, וטים ענה מהטקסט הישן.**
 *
 * `apps/server/db/knowledge-seed/knowledge.sql` נוצר מ-`knowledge/*.md`. ב-08.09 נערכה
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
  /**
   * ⚠️ **242 שורות המתקנים, והנתיב הגדול מהשניים.**
   *
   * הבנייה כותבת כמה קבצים ומוחקת קודם את הישנים, ולכן ההשוואה נעשית
   * בבנייה לתיקייה זמנית — ולא בדגל שמנסה לדמות את הכתיבה בלי לכתוב.
   */
  it("apps/server/db/content-seed נבנה מ-experiences.json העדכני", () => {
    const tmp = mkdtempSync(join(tmpdir(), "seed-"));
    try {
      execFileSync("python3", [join(P.SCRIPTS, "build-content-seed.py")], {
        env: { ...process.env, CONTENT_SEED_OUT: tmp },
        stdio: ["ignore", "ignore", "pipe"],
      });
      const listing = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
      const fresh = listing(tmp);
      expect(fresh).toEqual(listing(P.CONTENT_SEED));
      for (const f of fresh) {
        expect(readFileSync(join(tmp, f), "utf-8"), f)
          .toBe(readFileSync(join(P.CONTENT_SEED, f), "utf-8"));
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("knowledge.sql נבנה מ-knowledge/ העדכני", () => {
    const run = () =>
      execFileSync("python3", [join(P.SCRIPTS, "build-knowledge-seed.py"), "--check"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    expect(run).not.toThrow();
  });
});
