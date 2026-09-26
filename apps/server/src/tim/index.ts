/**
 * טים — נקודת הקצה של המודל.
 *
 * ⛔ הסיבה שהפונקציה הזו קיימת בכלל: מפתח Gemini לעולם אינו יכול לשבת
 * ב-frontend. משתנה עם קידומת VITE_ נכנס לחבילת הדפדפן **בהגדרה** — כל מי
 * שפותח את כלי המפתחים רואה אותו. המפתח יושב במשתני הסביבה של הפונקציה
 * הזו, בשרת, ולא עוזב אותם. הדפדפן מדבר עם הפונקציה; הפונקציה מדברת עם
 * Gemini.
 *
 * מה שהפונקציה הזו **אינה** עדיין: טים. אין לה שליפה ואין לה כלים, ולכן
 * היא אינה יודעת דבר על הפארקים. זה מכוון — כלל הברזל הראשון הוא שמה
 * שאינו במאגר אינו נענה, ולכן ההוראות למטה אוסרות עליה להמציא עובדה.
 * שליפה היא שלב 3, וטים המלא הוא שלב 4.
 *
 * ⚠️ ובכוונה בלי שום import. הפונקציה מדברת עם המסד דרך PostgREST ב-fetch
 * רגיל, ולא דרך ספריית הלקוח. הסיבה מעשית: קובץ בלי תלויות אפשר לבדוק
 * ולהריץ במלואו מקומית, וזה קובץ שנטע מדביקה ביד לתוך הדפדפן. תלות שאי
 * אפשר לאמת בקובץ כזה היא בדיוק מה שנופל אצלה ולא אצלי.
 */

/**
 * ⚠️ **הקובץ הזה הוא הממשק, לא המימוש.** עד 26.09 כל טים ישב כאן — 1,516
 * שורות. עכשיו כל חלק בקובץ משלו; מי שמייבא מכאן לא צריך לדעת מאיזה.
 *   handler.ts  הזרימה · prompt.ts ההוראות · context.ts מה המודל רואה ·
 *   lookup.ts / understand.ts השליפה · gemini.ts הקריאה · safety.ts הסינון
 */
export { looksLikeGeminiKey, thinkingConfig } from "./config";
export { formatCandidates, formatChunks, formatExperiences } from "./context";
export { handle, type Host } from "./handler";
export { emit, logged } from "./log";
export type { ExperienceRow, KnowledgeChunk, ParkCandidate } from "./lookup";
export { todayLine } from "./prompt";
export { bucketKey } from "./rate-limit";
export { scrubAnswer } from "./safety";
export { extractHeight, extractRideName, wantsRecommendation } from "./understand";
