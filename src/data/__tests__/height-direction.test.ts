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
   * ⚠️ ו-0 אינו תחליף. על חמש השורות רוני אימתה את התקרה בלבד; איש לא
   * אימת שאין רצפה. 0 אצלנו פירושו "נבדק ואין", והוא היה הצהרה שלא נאמרה.
   */
  it("המינימום שלהן 'לא נבדק' ולא 'נבדק ואין'", () => {
    const wrong = experiences
      .filter((e) => e.maxHeightRequirementCm !== null)
      .filter((e) => e.heightRequirementCm === 0)
      .map((e) => e.nameEn);
    expect(wrong).toEqual([]);
  });
});
