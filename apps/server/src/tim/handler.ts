import { DEFAULT_MODEL, MAX_QUESTION_CHARS, keyProblem } from "./config";
import { composeContext } from "./context";
import { diagnose, listModels } from "./diagnose";
import { askGemini, readAnswer, readUsage } from "./gemini";
import { corsFor, isFail, jsonResponder, type Fail } from "./http";
import { findCandidates, findRides, retrieveKnowledge } from "./lookup";
import { SYSTEM } from "./prompt";
import { checkRateLimit, dbAccess } from "./rate-limit";
import { scrubAnswer } from "./safety";
import { logTurn, wasAnswered } from "./turn-log";
import { extractRideName, readHistory } from "./understand";

/**
 * טים — הזרימה של שאלה אחת, מקצה לקצה.
 *
 *   בדיקות  →  גדר קצב  →  שליפה (במקביל)  →  המודל  →  סינון  →  יומן  →  תשובה
 *
 * ⚠️ **כל צעד כאן הוא קריאה לפונקציה במודול שלו**, וההסברים למה הוא בנוי כך
 * יושבים שם, ליד הקוד. צעד שאינו יכול להמשיך מחזיר `Fail` — בדיוק התשובה
 * שנכתבה פעם כאן — ו-`handle` מחזיר אותה כמות שהיא.
 */
export async function handle(req: Request, env: Record<string, string | undefined>): Promise<Response> {
  const CORS = corsFor(req, env);
  const json = jsonResponder(CORS);
  const reply = (r: Fail) => json(r.fail.body, r.fail.status);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const key = env.GEMINI_API_KEY;
  const bad = keyProblem(key);
  if (bad) return reply(bad);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // {"diagnose": true} — לפני כל בדיקה אחרת, כדי שיעבוד גם כשמשהו שבור.
  if (body.diagnose === true) return json(diagnose(env));
  if (body.diagnose === "models") {
    const m = await listModels(env);
    return isFail(m) ? reply(m) : json(m);
  }

  const question: unknown = body.question;
  if (typeof question !== "string" || question.trim() === "") {
    return json({ error: "empty_question" }, 400);
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return json({ error: "question_too_long", limit: MAX_QUESTION_CHARS }, 413);
  }
  const history = readHistory(body.history);

  // ── גדר קצב — נכשלת סגור (rate-limit.ts) ─────────────────────────────
  const db = dbAccess(env);
  if (isFail(db)) return reply(db);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = await checkRateLimit(db, ip, env.RATE_LIMIT_SALT);
  if (limited) return reply(limited);

  // ⚠️ **שני המקורות שלמטה נופלים רכה, בכוונה, ובניגוד לגדר הקצב.** גדר
  // שנכשלת חייבת לעצור, כי בלעדיה נקודת הקצה פתוחה. מקור ידע שנכשל אינו
  // פותח דבר — הוא רק מותיר את טים בלי הנתון, וההוראות שלו כבר אוסרות
  // עליו להמציא. לכן כישלון כאן מדווח בתשובה ואינו מונע ממנה לצאת.

  // ── המתקנים ──────────────────────────────────────────────────────────
  //
  // ⚠️ **עובדה על מתקן נשלפת מהטבלה, לא מחיפוש סמנטי** — ההפרדה שהוגדרה
  // ב-003: "ערבוב השניים הוא בדיוק הטעות שהארכיטקטורה נועדה למנוע".
  // "מה גובה המינימום" צריכה את המספר מהשורה, לא את הקטע שנשמע דומה.
  //
  // ⚠️ וזה גם מה שמונע מטים לענות מהאימון שלו. הוא "יודע" גבהים מהרשת,
  // והם עשויים להיות ישנים בשנתיים. כאן הוא מקבל את המספר **שלנו**, עם
  // תאריך בדיקה.
  const asked = extractRideName(question);

  /**
   * ⚠️ **במקביל, ולא בטור.** שורת המתקן נשלפת מהמסד, והשאלה נשלחת לגוגל
   * להפוך לווקטור — שתי פעולות שאינן תלויות זו בזו, ושחיכו זו לזו רק
   * מפני שנכתבו זו אחרי זו. נמדד בלוג: 3–4 שניות לשאלה.
   *
   * ⚠️ ו-`Promise.all` ולא `allSettled`, מפני ששתיהן כבר נופלות רכות
   * בפנים ואינן זורקות. הבחירה הזו נכונה רק כל עוד זה נכון — טיפול
   * שגיאות שיוסר מאחת מהן ישבור את השורה הזו בשקט.
   */
  const [rides, candidates, { chunks, retrieval }] =
    await Promise.all([
      findRides(db, asked, question),
      findCandidates(db, asked, question),
      retrieveKnowledge(db, key!, question),
    ]);

  // ── הקריאה למודל (gemini.ts) ─────────────────────────────────────────
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const gemini = await askGemini({
    key: key!, model, env, system: SYSTEM, history,
    userText: composeContext({ rides, candidates, chunks, question }),
  });
  if (isFail(gemini)) return reply(gemini);
  const { data } = gemini;
  const { raw, finishReason, candidates: hadCandidates } = readAnswer(data);

  // 🔴 **שכבת האכיפה.** ההוראות מבקשות מטים לא לחשוף קישורים ומפתחות;
  // כאן זה נבדק על הפלט בפועל. `scrubbed` אינו ריק רק כשמשהו נתפס, וזה
  // בדיוק האיתות שמעניין — ניסיון שהצליח לייצר משהו שאסור לצאת.
  const { clean: answer, hits: scrubbed } = scrubAnswer(raw);

  if (!answer) {
    // finishReason הוא ההסבר: MAX_TOKENS פירושו שהתקציב נגמר לפני הטקסט,
    // SAFETY פירושו סינון. בלעדיו "ריק" הוא תשובה בלי סיבה.
    return json({
      error: "empty_answer",
      model,
      finish_reason: finishReason,
      had_candidates: hadCandidates,
    }, 502);
  }

  const usage = readUsage(data);

  // ⚠️ retrieval מוחזר תמיד. בלעדיו "טים לא יודע" ו"השליפה נפלה" נראים
  // זהים על המסך — והראשון הוא תשובה, השני הוא תקלה.
  // ⚠️ `tiers` הוא לבדיקות, לא לממשק. הוא אומר על מה התשובה נשענה,
  // ובלעדיו "must_cite_tier" בסט הזהב אינו ניתן לאכיפה.
  const tiers = [...new Set(chunks.map((c) => c.authority_tier).filter(Boolean))];

  // ── יומן התשובות (044) ───────────────────────────────────────────
  //
  // ⚠️ **best-effort, ולעולם לא על חשבון התשובה.** תשובה למשפחה חשובה
  // מרישום, ולכן כישלון כאן נבלע: אין throw, אין await ללא גבול, ואין
  // מצב שבו תקלה במסד מעכבת את מה שמופיע על המסך. שורה שאבדה היא נתון
  // חסר; תשובה שנתקעה היא מוצר שבור.
  //
  const answered = wasAnswered({ rides, chunks, candidates, answer });
  logTurn(db.url, db.dbKey, {
    question,
    answered,
    reason: answered ? null : (retrieval === "failed" ? "unverified" : "no_data"),
    model,
    usage,
  });

  return json({
    answer, model, usage, retrieval,
    chunks: chunks.length, rides: rides.length, tiers,
    // 🔴 **האיתות של ניסיון שהצליח.** ריק כמעט תמיד. לא ריק פירושו
    // שהמודל ייצר משהו שאסור היה לצאת, והמסנן תפס — כלומר מישהו ניסה,
    // ועד כמה זה הצליח.
    //
    // ⚠️ **מוחזר ואינו נשמר עדיין.** שמירה דורשת ערך חדש ב-refusal_reason,
    // ואוצר המילים שם נקבע באישור גיא. בלי אישורו זה נשאר גלוי בתשובה
    // ובבדיקות בלבד — ולא נכתב למסד בשקט.
    scrubbed,
  });
}
