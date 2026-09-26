import { MAX_HISTORY_CHARS, MAX_HISTORY_TURNS } from "./config";
/**
 * The height given in the question, in centimeters.
 *
 * ⚠️ **A number without context isn't a height.** "Expedition Everest" contains
 * digits in other names, and "3 ימים" ("3 days") isn't 3 cm. A word that marks
 * height is required, and the range is limited to 50–200 — the same range the
 * database enforces on the column.
 */
export function extractHeight(q: string): number | null {
  const m = q.match(/(\d{2,3})\s*(?:ס"מ|סמ|ס״מ|cm)/i) ??
    q.match(/(?:גובה|בגובה|גובהה?|גובהו)\s*(?:של\s*)?(\d{2,3})/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 50 && n <= 200 ? n : null;
}

/**
 * The name of the ride the question is about, if it's about a ride.
 *
 * ⚠️ **Generic words — "מתקן" ("ride"), "מופע" ("show"), "פארק" ("park") —
 * must drop out here.** They aren't a name, and they appear in legitimate aliases —
 * "מופע היפה והחיה" ("the Beauty and the Beast show"). Word matching crosses
 * these two facts: the question "איזה **מתקן** הכי מפחיד" ("which **ride** is
 * scariest") would return the ride that someone has the alias "מתקן אווטאר"
 * ("Avatar ride") for, and a fact about a random ride would enter Tim's context
 * as the answer. **Measured, not observed.**
 *
 * ⚠️ **This is stripping question words, not intent detection.** I tried
 * detecting "is the question about a ride" by keywords, and it failed on
 * "כמה עולה אוורסט" ("how much is Everest") — a price question about a specific
 * ride. What remains is the reverse: strip what is certainly not a name, **and
 * let the database decide.**
 *
 * ⚠️ **`\b` doesn't work here, so it isn't used.** In JavaScript `\b` is the
 * boundary between `\w` and what isn't — and `\w` is only `[A-Za-z0-9_]`. A
 * Hebrew letter isn't `\w`, so `\b(מה)\b` **never matches**, and the whole
 * question-word list did nothing: the expression ran, didn't throw, and filtered
 * nothing. That's exactly the silent failure — code that looks like it works.
 * The boundaries here are written explicitly as whitespace or string edge.
 *
 * ⚠️ And it also returns a string for "קורה אם יורד גשם" ("happens if it
 * rains"), and **that's fine**: `ilike '%קורה אם יורד גשם%'` matches no ride,
 * the database returns zero rows, and nothing enters the context. The cost is
 * one unnecessary database call; the alternative — a heuristic that decides on
 * its own — would one day skip a real question, and that's a far more expensive
 * failure. **Better to ask for nothing than to miss.**
 */
export function extractRideName(q: string): string | null {
  const stripped = q
    .replace(/[?!.,:;"'״׳]/g, " ")
    .replace(
      /(?<=^|\s)(מה|מהו|מהי|האם|כמה|איפה|מתי|למה|איך|יש|אין|של|על|את|זה|זו|הוא|היא|אני|אנחנו|לי|לנו|עם|בלי|גובה|גובהה|בגובה|מינימום|המינימום|עוצמה|מרטיב|נגיש|נגישות|בחילה|ילד|ילדה|בן|בת|שנים|ס"מ|סמ|cm|עולה|כלול|צריך|אפשר|מומלץ|טוב|רע|כדאי|באיזה|לאיזה|איזה|כל|הכי|יותר|פחות|וגם|או|גם|שלום|היי|הי|היייי|אהלן|בוקר|ערב|טוב|תודה|אוקיי|אוקי|בבקשה|סליחה|שלומך|נעים|להכיר|מתקן|מתקנים|המתקן|מופע|מופעים|המופע|אטרקציה|אטרקציות|פארק|פארקים|בפארק|אזור|סרט|תור|התור|רכבת)(?=\s|$)/gi,
      " ",
    )
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // ⚠️ Two letters aren't a ride name. They're leftovers of a connecting word
  // that wasn't stripped, and searching on them returns half the table.
  return stripped.length >= 3 ? stripped : null;
}

/**
 * Whether the question asks us to choose for the person asking.
 *
 * ⚠️ **The same vocabulary as `apps/web/src/lib/ask-intent.ts`, on purpose.** Two
 * word lists on two sides would drift apart within a week, and then the same
 * question would be classified differently in the browser and on the server —
 * without anyone noticing.
 *
 * ⚠️ And a fact word wins: "כמה זמן כדאי לתכנן ל-Everest" ("how much time should
 * we plan for Everest") is a question with an answer in the table, and candidate
 * rows on it are noise.
 */
export function wantsRecommendation(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  if (/(גובה|מגבלת|ס"מ|בחילה|מרטיב|כמה זמן|נגיש|ממוזג|תור|דילוג|פאס)/.test(t)) return false;
  if (/(תכנן|תכננו|לתכנן|מסלול|המלצ|תמליץ|תמליצו|מה לעשות)/.test(t)) return true;
  if (/(מה\s+דעת|מה\s+עדיף|איז[הו]\s.{0,40}?\s?(מתאימ|עדיפ))/.test(t)) return true;
  return /(מעדיפ|אוהב|מחפשים|מחפש|בא לנו)/.test(t)
    && /(פארק|פארקים|מתקנים|אטרקציות|רכבות|מופעים|חופשה|טיול)/.test(t);
}

// 🔴 **Tim remembered nothing, so he asked the same question three times in a
// row.**
//
// Neta answered "a couple aged 30, no preferences", and he asked again "what ages
// are the travelers?". Every message reached him alone — `askTim` sent
// `{ question }` and that was it — so each of her answers looked to him like a
// new question with no context.
//
// ⚠️ **And that violates the fifth iron rule**, which says a skipped question is
// asked one more time and then we continue with what we have. The rule was in the
// instructions; the mechanism that makes it possible to keep did not exist. An
// instruction with no way to keep it is not a rule.
//
// ⚠️ **Bounded in scope on purpose.** The history is a user's text that travels to
// an external vendor and counts against the same rate limit. The last eight
// turns, each one truncated — more than that doesn't improve an answer and does
// increase cost and leakage.
export type Turn = { role: "user" | "model"; text: string };
export function readHistory(raw: unknown): Turn[] {
  const rawHistory = Array.isArray(raw) ? raw : [];
  return rawHistory
    .slice(-MAX_HISTORY_TURNS)
    .flatMap((t): Turn[] => {
      if (typeof t !== "object" || t === null) return [];
      const { role, text } = t as { role?: unknown; text?: unknown };
      if (typeof text !== "string" || text.trim() === "") return [];
      if (role !== "user" && role !== "model") return [];
      return [{ role, text: text.slice(0, MAX_HISTORY_CHARS) }];
    });
}
