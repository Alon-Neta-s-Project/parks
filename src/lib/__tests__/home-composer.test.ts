import { join } from "node:path";
import { describe, expect, it } from "vitest";
import he from "../../i18n/he.json";
import { P } from "../../../scripts/paths";

/**
 * מסך הכניסה, לפי `design/canvas/TimHomeLaylaInspired.dc.html`.
 *
 * ⚠️ מה שנבדק כאן הוא **מה שה-artboard הבטיח למשתמש** — לא איך זה
 * נראה. הטקסטים הם ההבטחה: תיבה שאפשר לכתוב בה, שני קיצורים, ומשפט
 * שאומר שטים לא בטוח כשהוא לא בטוח.
 */
describe("מסך הכניסה", () => {
  const h = he.home as Record<string, string>;

  it("כל מה שה-artboard מבטיח קיים כמחרוזת", () => {
    for (const k of [
      "heroTitle", "heroLead", "composerPlaceholder",
      "chip1", "chip2", "trust", "byParkTitle", "byParkLead", "allParksCta",
    ]) {
      expect(h[k], k).toBeTruthy();
    }
  });

  // ⚠️ הכותרת נשברת לשתי שורות בניסוח, ולא ב-<br> ברכיב. שבירה ברכיב
  // אינה ניתנת לתרגום, ומחרוזת בקוד אסורה ממילא.
  it("הכותרת נושאת את שבירת השורה בעצמה", () => {
    expect(h.heroTitle).toContain("\n");
  });

  // 🔴 המשפט שאומר שטים אינו יודע הכול הוא חלק מהמוצר, לא קישוט.
  it("משפט הזהירות אומר במפורש שטים לא תמיד בטוח", () => {
    expect(h.trust).toMatch(/לא בטוח|אינו בטוח/);
  });

  // ⚠️ אין מחרוזות בקוד (CLAUDE.md). הצ'יפים נקראים מ-he.json, ולכן
  // הם חייבים להיות שם ולא ברכיב.
  it("הקיצורים הם תוכן ולא קוד", () => {
    expect(h.chip1).not.toBe(h.chip2);
    expect((h.chip1 ?? "").length).toBeGreaterThan(3);
  });
});

/**
 * ⚠️ **התמונה מאושרת, והייחוס אסור.**
 *
 * דנה אישרה את תצלום הטירה (07.09) ממאגר חינמי, בלי דרישת קרדיט. הכלל
 * הכללי בפרויקט הוא **אין מקורות בממשק** — והוא חל גם כאן: שורת קרדיט
 * שאיש לא דרש היא ייחוס למקור, ומי שיראה אותה יסיק שיש לנו מדיניות
 * קרדיטים. אין.
 */
describe("תצלום מסך הכניסה", () => {
  it("קיים כקובץ ולא כ-base64 ברכיב", async () => {
    const { statSync } = await import("node:fs");
    const s = statSync(join(P.WEB_PUBLIC, "home-hero.jpg"));
    expect(s.size).toBeGreaterThan(10_000);
  });

  it("הרכיב אינו נושא שורת קרדיט", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(join(P.WEB_SRC, "pages", "HomePage.tsx"), "utf8");
    // ⚠️ בגוף ה-JSX בלבד. ההערה בראש הקובץ כן מסבירה שהאישור ניתן.
    const jsx = src.slice(src.indexOf("return ("));
    for (const word of ["קרדיט", "צילום:", "Photo by", "Unsplash", "Pexels"]) {
      expect(jsx, word).not.toContain(word);
    }
  });
});
