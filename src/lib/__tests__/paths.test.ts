import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { P, REL } from "../../../scripts/paths";

/**
 * כל נתיב ב-`scripts/paths.json` קיים.
 *
 * ⚠️ **הקובץ הזה הוא המקום היחיד שהזזת תיקייה נוגעת בו** — ולכן גם
 * המקום היחיד שבו היא יכולה להישכח. בלי הבדיקה, מפתח שלא עודכן היה
 * מתגלה רק בסקריפט הראשון שקורא אותו, ורק אם מישהו מריץ אותו.
 *
 * `dist*` נוצרים בבנייה, ולכן אינם חייבים להתקיים לפניה.
 */
const BUILT = new Set(["DIST", "DIST_TIM", "DIST_TIM_TEST"]);

describe("scripts/paths.json מצביע על מה שקיים", () => {
  it("כל מפתח שאינו תוצר בנייה קיים ברפו", () => {
    const missing = Object.entries(P)
      .filter(([k, abs]) => !BUILT.has(k) && !existsSync(abs))
      .map(([k]) => `${k} → ${REL[k as keyof typeof REL]}`);
    expect(missing).toEqual([]);
  });
});
