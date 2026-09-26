import type { Db } from "./rate-limit";
import { extractHeight, wantsRecommendation } from "./understand";
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

/**
 * 🔴 **על שאלת המלצה טים לא קיבל ולו מתקן אחד.**
 *
 * `ridesTask` רצה רק כששולפים שם מתקן מהשאלה, ו"מעדיפים פארקים עם
 * תפאורה יפה" אינה מכילה שם. לכן חזרו אפס שורות, וכל מה שהיה לו
 * לענות ממנו היה מדריכי האופי — פרוזה. הוא ענה בפסקאות אווירה בלי
 * ולו מתקן אחד בשם, וזה מה שפולה תפסה.
 *
 * ⚠️ **ורק כששאלו אותנו לבחור.** שליפה כזו על כל שאלה הייתה מזריקה
 * עשרים שורות מתקנים להקשר של "מה קורה אם יורד גשם", ויש בדיקה
 * שאוסרת בדיוק את זה.
 */
export async function findCandidates({ url, dbKey }: Db, asked: string | null, question: string): Promise<ParkCandidate[]> {
  if (asked || !wantsRecommendation(question)) return [];
  try {
    const res = await fetch(`${url}/rest/v1/rpc/park_candidates`, {
      method: "POST",
      headers: {
        apikey: dbKey,
        Authorization: `Bearer ${dbKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_per_park: 3 }),
    });
    const rows = res.ok ? await res.json() : null;
    return Array.isArray(rows) ? rows : [];
  } catch { /* נפילה רכה, כמו השאר */ }
  return [];
}

export async function findRides({ url, dbKey }: Db, asked: string | null, question: string): Promise<ExperienceRow[]> {
  if (!asked) return [];
  try {
    const res = await fetch(`${url}/rest/v1/rpc/find_experiences`, {
      method: "POST",
      headers: {
        apikey: dbKey,
        Authorization: `Bearer ${dbKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_name: asked,
        p_height_cm: extractHeight(question),
        p_limit: 6,
      }),
    });
    const rows = res.ok ? await res.json() : null;
    return Array.isArray(rows) ? rows : [];
  } catch { /* נפילה רכה, כמו השליפה */ }
  return [];
}

// ── השליפה ───────────────────────────────────────────────────────────
export async function retrieveKnowledge({ url, dbKey }: Db, key: string, question: string): Promise<{
  chunks: KnowledgeChunk[];
  retrieval: "ok" | "empty" | "failed";
}> {
  let chunks: KnowledgeChunk[] = [];
  let retrieval: "ok" | "empty" | "failed" = "empty";
  try {
    // ⚠️ השאלה מקודדת כ-RETRIEVAL_QUERY ולא כ-RETRIEVAL_DOCUMENT. שני
    // התפקידים אינם סימטריים, וקידוד בתפקיד הלא נכון **עובד** ומחזיר
    // תוצאות גרועות יותר בלי שום שגיאה — אותה מלכודת כמו בצד הטעינה.
    const emb = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: question }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: 1536,
        }),
      },
    );
    const vector = emb.ok ? (await emb.json())?.embedding?.values : null;
    if (Array.isArray(vector) && vector.length === 1536) {
      const res = await fetch(`${url}/rest/v1/rpc/match_knowledge`, {
        method: "POST",
        headers: {
          apikey: dbKey,
          Authorization: `Bearer ${dbKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_embedding: JSON.stringify(vector), p_limit: 5 }),
      });
      const rows = res.ok ? await res.json() : null;
      chunks = Array.isArray(rows) ? rows : [];
      retrieval = res.ok ? (chunks.length > 0 ? "ok" : "empty") : "failed";
    } else {
      retrieval = "failed";
    }
  } catch {
    retrieval = "failed";
  }
  return { chunks, retrieval };
}
