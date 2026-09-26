/** מתקן כפי שהוא חוזר מ-find_experiences. */
export interface ExperienceRow {
  name: string;
  name_he: string | null;
  park: string;
  land: string | null;
  status: string;
  status_note: string | null;
  intensity: number | null;
  height_cm: number | null;
  /**
   * ⚠️ ההפך מ-`height_cm`: עד כמה מותר להיות גבוה.
   *
   * `undefined` ולא רק `null` בכוונה — מסד שעדיין לא קיבל את מיגרציה 038
   * אינו מחזיר את השדה כלל, והפונקציה אמורה להמשיך לעבוד ולא לומר דבר,
   * במקום להדפיס "undefined ס״מ" בתשובה למשפחה.
   */
  max_height_cm?: number | null;
  /**
   * ארבעת דגלי הרגישות. ⚠️ שלושה מצבים כל אחד, ו-`null` הוא "לא נבדק"
   * ולעולם לא "אין רגישות" — זה כל ההבדל בשביל המשפחה ששואלת.
   *
   * אופציונליים, כמו התקרה: מסד בלי מיגרציה 039 אינו מחזיר אותם.
   */
  /**
   * 🔴 **טקסט ולא בוליאני, מאז מיגרציה 040 — וזה היה באג חי.**
   *
   * הטיפוס כאן נכתב כ-`boolean | null` כשהעמודות היו בוליאניות, ו-040
   * העבירה אותן ל-`"true" | "false" | "na" | null`. הקוד שקורא אותן
   * השווה ל-`true` — השוואה שלעולם אינה מתקיימת על מחרוזת — ולכן **אף
   * רגישות מסומנת לא הייתה מגיעה לטים.**
   *
   * ⚠️ ו-TypeScript לא תפס את זה: הטיפוס מתאר מה שאני **מצהיר** שמגיע
   * מהרשת, לא מה שבאמת מגיע. הצהרה שגויה עוברת קומפילציה בשקט.
   */
  sens_dark?: string | null;
  sens_heights?: string | null;
  sens_loud?: string | null;
  sens_strobe?: string | null;
  gets_wet: string | null;
  skip_line: string | null;
  last_verified: string | null;
  fits: boolean | null;
}

/**
 * מתקנים, כפי שהם נכנסים להקשר.
 *
 * ⚠️ **שלושת מצבי הגובה נשמרים עד המסך** (CLAUDE.md): מספר הוא מגבלה,
 * `0` הוא "נבדק ואין מגבלה", ו-NULL הוא "לא נבדק". שלושתם נכתבים במילים
 * שונות, כי מודל שמקבל `0` עלול לכתוב "גובה מינימום 0 ס\"מ" — וזה בדיוק
 * מה שהכלל אוסר.
 */
/** שורת מועמד לפארק. ראה `park_candidates` במיגרציה 043. */
export interface ParkCandidate {
  park: string;
  name: string;
  name_he: string | null;
  land: string | null;
  category: string | null;
  intensity: number | null;
  height_cm: number | null;
  max_height_cm: number | null;
  gets_wet: string | null;
}

/** קטע כפי שהוא חוזר מ-match_knowledge. */
export interface KnowledgeChunk {
  content: string;
  volatility: string | null;
  last_verified: string | null;
  /**
   * ⚠️ **נשלף ולא נזרק.** `match_knowledge` מחזירה אותו מאז 028, והוא
   * נבלע כאן — כלומר שישה ממקרי סט הזהב שדורשים `must_cite_tier: [T1]`
   * לא היו ניתנים לבדיקה כלל: אין במה להסתכל.
   *
   * הוא **אינו** נכנס להקשר של המודל. הוא יוצא בתשובה כדי שבדיקה תוכל
   * לוודא מאיזו דרגת מקור נשענה התשובה — קטע T1 הוא מקור רשמי, ותשובה
   * שנשענת רק על דרגה נמוכה יותר היא ממצא ולא תקלה.
   */
  authority_tier: string | null;
}
