import { describe, expect, it } from "vitest";
import { experiences } from "../index";

/**
 * 🔴 בדיקת הרגרסיה שפולה אישרה, 08.09.
 *
 * חמישה מתקני פעוטות נשאו את **התקרה** שלהם בעמודת הרצפה, ולכן אותו מספר
 * אמר את ההפך ממה שהתכוון: טים אמר שטייקס פיק דורש 122 ס"מ, כשבפועל הוא
 * אינו מקבל אף אחד **מעל** 122.
 *
 * ⚠️ מה שתפס את זה לא היה מקור חיצוני אלא **סתירה בתוך הדאטא שלנו**:
 * הקטגוריה העדינה ביותר החזיקה את המספר הגבוה במאגר, מעל האלק ומעל
 * דוקטור דום. הבדיקות כאן הופכות בדיוק את הסתירה הזו לכלל.
 */
describe("כיוון הגובה", () => {
  const withMin = experiences.filter((e) => typeof e.heightRequirementCm === "number"
    && e.heightRequirementCm > 0);

  /**
   * הכלל הראשון שפולה אישרה: אזור משחקי מים לפעוטות אינו דורש גובה מינימלי.
   * אם שורה כזו נושאת מינימום — כמעט תמיד זו תקרה שנרשמה במקום הלא נכון.
   */
  it("שורת 'Water play area' אינה נושאת גובה מינימלי", () => {
    const offenders = withMin
      .filter((e) => e.subtype === "Water play area")
      .map((e) => `${e.nameEn} — ${e.heightRequirementCm}`);
    expect(offenders).toEqual([]);
  });

  /**
   * הכלל השני: היפוך בין עוצמה 1 לעוצמה 4.
   *
   * ⚠️ זה מה שתפס את Bay Slides, שאינה "Water play area" אלא "Body slide"
   * — כלומר הכלל הראשון לבדו היה מפספס דווקא את השורה עם הטעות הגדולה
   * ביותר. שני הכללים אינם חופפים, ולכן שניהם.
   */
  it("המתקן העדין ביותר אינו דורש יותר מהחזק ביותר", () => {
    const at = (n: number) => withMin
      .filter((e) => e.intensity?.value === n)
      .map((e) => e.heightRequirementCm as number);

    const gentle = at(1);
    const intense = at(4);
    if (gentle.length === 0 || intense.length === 0) return;

    const worst = withMin
      .filter((e) => e.intensity?.value === 1
        && (e.heightRequirementCm as number) > Math.max(...intense))
      .map((e) => `${e.nameEn} — ${e.heightRequirementCm} (עוצמה 1, מעל המקסימום של עוצמה 4)`);

    expect(worst).toEqual([]);
  });

  /**
   * ⚠️ ומה שאסור שיקרה בתיקון עצמו: שדה התקרה קיים בדיוק כדי שלא נמחק את
   * המספר. שורה שיש בה תקרה ואין בה שום מידע — כלומר גם המינימום רוקן וגם
   * התקרה לא נרשמה — היא הנתון שאבד.
   */
  it("שורה שהמינימום שלה רוקן נושאת תקרה במקומו", () => {
    const known = new Set([
      "Bay Slides", "Ketchakiddee Creek", "Tike's Peak",
      "Runamukka Reef", "Tot Tiki Reef",
    ]);
    const lost = experiences
      .filter((e) => known.has(e.nameEn))
      .filter((e) => e.maxHeightRequirementCm === null)
      .map((e) => e.nameEn);
    expect(lost).toEqual([]);
  });

  /**
   * 🔴 **ורק מי שנבדק באמת מקבל 0 — ולא כל החמש יחד.**
   *
   * עד 09.09 אף אחת מהחמש לא נשאה 0, וזה היה נכון: רוני אימתה תקרה בלבד.
   * ב-09.09 היא בדקה גם את הרצפה, וחזרה עם **שלוש רמות ביטחון**:
   * Bay Slides ו-Ketchakiddee Creek ב-high (האתר הרשמי מנוסח כמקסימום
   * בלבד); Runamukka ו-Tot Tiki ב-medium-high (האתר הרשמי לא נטען);
   * Tike's Peak ב-medium, ושם touringplans אף מתייג בטעות "Minimum
   * Height 48 in" על ניסוח שהוא מקסימום.
   *
   * ⚠️ **0 הוא טענה, לא ברירת מחדל.** שלוש מהחמש לא הגיעו לרמה
   * שמצדיקה אותה. אחידות הייתה נוחה ושקרית על שלוש שורות, בשדה
   * שעניינו בטיחות ילד — ולכן הבדיקה אוכפת את ההבחנה, לא את האחידות.
   */
  it("רק שתי השורות שאומתו ב-high נושאות 0", () => {
    const verified = new Set(["Bay Slides", "Ketchakiddee Creek"]);
    const withCeiling = experiences.filter((e) => e.maxHeightRequirementCm !== null);
    expect(withCeiling).toHaveLength(5);

    for (const e of withCeiling) {
      const expected = verified.has(e.nameEn) ? 0 : null;
      expect(e.heightRequirementCm, e.nameEn).toBe(expected);
    }
  });
});
