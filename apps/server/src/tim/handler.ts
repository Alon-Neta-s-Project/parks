import { DEFAULT_MODEL, MAX_HISTORY_CHARS, MAX_HISTORY_TURNS, MAX_QUESTION_CHARS, RETRY_AFTER_MINUTES, looksLikeGeminiKey, thinkingConfig } from "./config";
import { formatCandidates, formatChunks, formatExperiences } from "./context";
import { diagnose } from "./diagnose";
import { upstreamReason } from "./gemini";
import { corsFor } from "./http";
import type { ExperienceRow, KnowledgeChunk, ParkCandidate } from "./lookup";
import { SYSTEM, todayLine } from "./prompt";
import { bucketKey } from "./rate-limit";
import { scrubAnswer } from "./safety";
import { logTurn } from "./turn-log";
import { extractHeight, extractRideName, wantsRecommendation } from "./understand";

export async function handle(req: Request, env: Record<string, string | undefined>): Promise<Response> {
  const CORS = corsFor(req, env);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // שתי תקלות שונות לגמרי, ולכן שתי הודעות שונות. "לא הוגדר או לא מתחיל
  // ב-AIza" שלח את נטע לבדוק את שתי האפשרויות בלי לדעת באיזו היא נמצאת.
  // שום חלק מהמפתח אינו מוחזר — רק אורכו, שמספיק כדי לזהות הדבקה חלקית.
  const key = env.GEMINI_API_KEY;
  if (key === undefined || key.trim() === "") {
    return json({
      error: "missing_api_key",
      detail: "הסוד GEMINI_API_KEY אינו קיים. לבדוק את השם המדויק ב-Edge Functions ← Secrets, ואז Deploy מחדש — סוד חדש נכנס לפונקציה רק בפריסה הבאה.",
    }, 500);
  }
  if (!looksLikeGeminiKey(key)) {
    return json({
      error: "malformed_api_key",
      detail: `הסוד קיים, אבל הערך קצר מדי או מכיל רווח. אורך שהתקבל: ${key.trim().length} (מפתח תקין הוא כ-39 תווים). סביר שההדבקה הייתה חלקית.`,
    }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // {"diagnose": true} — לפני כל בדיקה אחרת, כדי שיעבוד גם כשמשהו שבור.
  if (body.diagnose === true) return json(diagnose(env));

  // {"diagnose":"models"} — שואל את גוגל אילו מודלים זמינים למפתח הזה.
  // שמות מודלים אינם סוד, והמפתח אינו חוזר בתשובה.
  if (body.diagnose === "models") {
    const k = env.GEMINI_API_KEY;
    if (!k) return json({ error: "missing_api_key" }, 500);
    let r: Response;
    try {
      r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": k },
      });
    } catch {
      return json({ error: "upstream_unreachable" }, 502);
    }
    if (!r.ok) return json({ error: "upstream_error", status: r.status }, 502);
    const list = await r.json().catch(() => null);
    const usable = (list?.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""));
    return json({ current: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL, usable });
  }

  const question: unknown = body.question;
  if (typeof question !== "string" || question.trim() === "") {
    return json({ error: "empty_question" }, 400);
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return json({ error: "question_too_long", limit: MAX_QUESTION_CHARS }, 413);
  }

  // 🔴 **טים לא זכר דבר, ולכן שאל את אותה שאלה שלוש פעמים ברצף.**
  //
  // נטע ענתה "זוג בני 30 ואין העדפות", והוא שאל שוב "איזה גילים
  // המטיילים?". כל הודעה הגיעה אליו לבדה — `askTim` שלח `{ question }`
  // וזהו — ולכן כל תשובה שלה נראתה לו כשאלה חדשה בלי הקשר.
  //
  // ⚠️ **וזו הפרה של כלל הברזל החמישי**, שאומר שאלה שדולגה נשאלת פעם
  // נוספת אחת ואז ממשיכים עם מה שיש. הכלל היה בהוראות; המנגנון שמאפשר
  // לקיים אותו לא היה קיים. הוראה בלי דרך לקיים אותה אינה כלל.
  //
  // ⚠️ **חסום בהיקף בכוונה.** ההיסטוריה היא טקסט של משתמשת שנוסע לספק
  // חיצוני ונספר לתוך אותה גדר קצב. שמונה תורות אחרונות, וכל אחת
  // חתוכה — יותר מזה אינו משפר תשובה והוא כן מגדיל עלות ודליפה.
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history = rawHistory
    .slice(-MAX_HISTORY_TURNS)
    .flatMap((t): { role: "user" | "model"; text: string }[] => {
      if (typeof t !== "object" || t === null) return [];
      const { role, text } = t as { role?: unknown; text?: unknown };
      if (typeof text !== "string" || text.trim() === "") return [];
      if (role !== "user" && role !== "model") return [];
      return [{ role, text: text.slice(0, MAX_HISTORY_CHARS) }];
    });

  // ── הגבלת קצב ────────────────────────────────────────────────────────
  //
  // ⚠️ נכשלת **סגור**. אם אי אפשר לספור — אין קריאה למודל.
  //
  // הגרסה הראשונה דילגה על ההגבלה כשמשתני הסביבה חסרו, והמשיכה למודל.
  // כלומר: תקלה בהגדרה הייתה הופכת את נקודת הקצה לפתוחה לגמרי, בשקט,
  // בדיוק במצב שבו אימות הטוקן כבוי. עדיף שגיאה שרואים מנקודת קצה פתוחה
  // שאיש לא יודע עליה — זה אותו כלל של "אין נפילה שקטה" ב-CLAUDE.md.
  // ⚠️ מפתח anon ולא service_role, ובכוונה. PostgREST החזיר 403 ולא 401 —
  // כלומר המפתח כן התקבל, והתפקיד שהוא נפתר אליו אינו service_role.
  // check_rate_limit היא security definer ומוענקת ל-anon, ולכן היא עובדת
  // ללא תלות בתפקיד. הטבלה עצמה נשארת סגורה לחלוטין.
  const url = env.SUPABASE_URL;
  const dbKey = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY
    ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !dbKey) {
    return json({
      error: "rate_limit_unavailable",
      detail: "SUPABASE_URL או מפתח גישה למסד חסרים, ולכן אי אפשר לאכוף גג קריאות",
    }, 500);
  }
  {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const bucket = await bucketKey(ip, env.RATE_LIMIT_SALT ?? dbKey.slice(0, 16));
    const auth = {
      apikey: dbKey,
      Authorization: `Bearer ${dbKey}`,
      "Content-Type": "application/json",
    };

    let res: Response;
    try {
      res = await fetch(`${url}/rest/v1/rpc/check_rate_limit`, {
        method: "POST",
        headers: auth,
        // ⚠️ דלי בלבד. כל ערך נוסף כאן הוא גג שהקוראת בוחרת לעצמה.
        body: JSON.stringify({ p_bucket: bucket }),
      });
    } catch {
      return json({ error: "rate_limit_unavailable", detail: "המסד לא נענה" }, 500);
    }

    if (!res.ok) {
      return json({
        error: "rate_limit_unavailable",
        detail: `check_rate_limit החזירה ${res.status}. אם 404 — לא הורצה מיגרציה 026 (החתימה השתנתה לארגומנט אחד).`,
      }, 500);
    }

    // מיגרציה 021 החליפה את הבוליאני בטקסט: 'ok' | 'user' | 'global'.
    // כל דבר אחר פירושו שלא הבנו את התשובה, וזה כישלון — לא היתר.
    // ⚠️ בוליאני נחשב כאן **לא מובן**, ובכוונה: מסד שעדיין על 020 יחזיר
    // true, ו-true שמתפרש כ"מותר" הוא בדיוק גדר שנעלמה בלי שאיש ראה.
    const verdict = await res.json().catch(() => null);
    if (verdict !== "ok" && verdict !== "user" && verdict !== "global") {
      return json({
        error: "rate_limit_unavailable",
        detail: typeof verdict === "boolean"
          ? "check_rate_limit החזירה בוליאני — לא הורצה מיגרציה 021"
          : "תשובה לא צפויה מ-check_rate_limit",
      }, 500);
    }
    // ⚠️ שני הגדרות אינם אותה הודעה. "נסי בעוד שעה" כשהמכסה היומית
    // נגמרה הוא שקר שהמבקרת תגלה רק אחרי שעה של המתנה.
    if (verdict === "user") {
      return json({ error: "rate_limited", scope: "user", retry_after_minutes: RETRY_AFTER_MINUTES }, 429);
    }
    if (verdict === "global") {
      return json({ error: "rate_limited", scope: "global", retry_after_minutes: 60 * 24 }, 429);
    }
  }

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
  const candidatesTask = async (): Promise<ParkCandidate[]> => {
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
  };

  const ridesTask = async (): Promise<ExperienceRow[]> => {
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
  };

  // ── השליפה ───────────────────────────────────────────────────────────
  const retrievalTask = async (): Promise<{
    chunks: KnowledgeChunk[];
    retrieval: "ok" | "empty" | "failed";
  }> => {
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
          headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
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
  };

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
    await Promise.all([ridesTask(), candidatesTask(), retrievalTask()]);

  // ── הקריאה למודל ─────────────────────────────────────────────────────
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

  /**
   * תקציב החשיבה — הידית היקרה ביותר שיש לנו, וזה נמדד ולא הוערך.
   *
   * במדידה אמיתית: קלט 275 · תשובה 154 · **חשיבה 505**. אסימוני חשיבה
   * מחויבים כפלט, כלומר הם היו **72% מעלות ההודעה** — פי שלושה מהתשובה
   * עצמה, בשביל לומר "אין לי עדיין נתונים". לשם השוואה: מעבר ל-3.6
   * חוסך 16%, וקאשינג של כל הקלט חוסך 5%.
   *
   * ⚠️ **opt-in בכוונה.** בלי הסוד נשלח בדיוק מה שנשלח היום, כלומר
   * ההתנהגות שכבר עובדת אינה משתנה מעצם הפריסה. השדה אינו מתועד אחיד
   * בין דורות המודלים, וסיכון של 400 על שדה לא מוכר אינו סיכון שלוקחים
   * בשקט על נתיב שעובד. מגדירים סוד, מודדים, ואם נשבר — מוחקים אותו
   * וחוזרים אחורה בלי לגעת בקוד.
   *
   * ערך לא-מספרי מתעלמים ממנו במקום לשלוח אותו: סוד עם שגיאת הקלדה
   * שמפיל את טים לגמרי הוא מחיר גבוה מדי על ידית אופציונלית.
   */
  const thinking = thinkingConfig(env);
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  /**
   * 503 ו-429 מגוגל הם זמניים בהגדרה — "עמוס", לא "שגוי". ניסיון חוזר
   * אחד עם המתנה קצרה פותר את רובם.
   *
   * ⚠️ אחד בלבד, ובכוונה: אנחנו כבר בתוך נקודת קצה מוגבלת-קצב, וההמתנה
   * היא זמן שהמשתמש מחכה מול מסך. עדיף להחזיר שגיאה מפורשת מלנסות שוב
   * ושוב ולהיראות תקוע.
   */
  const transient = (code: number) => code === 503 || code === 429 || code >= 500;

  let res: Response;
  const call = () =>
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        // ⚠️ הקטעים לפני השאלה. מודל שמקבל קודם שאלה ואז מקור נוטה לענות
        // מתוך מה שהוא כבר "יודע" ולהשתמש במקור כאישור; הסדר ההפוך מייצר
        // תשובה שנשענת על המקור.
        // ⚠️ ההיסטוריה לפני ההקשר והשאלה, וכתורות אמיתיות ולא כטקסט
        // מודבק. מודל שמקבל שיחה כפסקה אחת מתייחס אליה כציטוט; תורות
        // נפרדות הן מה שגורם לו לזכור מה כבר נשאל.
        contents: [
          ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          {
          role: "user",
          parts: [{
            // ⚠️ המתקנים לפני המסמכים. עובדה מהטבלה גוברת על פרוזה, ומודל
            // נוטה לתת משקל למה שהוא רואה קודם.
            text: [
              todayLine(),
              rides.length ? formatExperiences(rides) : null,
              // ⚠️ אחרי המתקנים שנשאלו עליהם ולפני המסמכים: אלה עובדות
              // מהטבלה, והן גוברות על פרוזה.
              candidates.length ? formatCandidates(candidates) : null,
              chunks.length ? formatChunks(chunks) : null,
              `השאלה: ${question}`,
            ].filter(Boolean).join("\n\n---\n\n"),
            }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          // ⚠️ 2048 ולא פחות. אסימוני החשיבה נספרים לתוך התקציב הזה,
          // ובמדידה אמיתית הם היו 505 מול תשובה של 154. הצעתי קודם
          // להוריד ל-1000 — זה היה מקצץ את התשובה באמצע ומחזיר
          // MAX_TOKENS ריק, כלומר שובר במקום לחסוך. הידית הנכונה היא
          // תקציב החשיבה למטה, לא הגג.
          maxOutputTokens: 2048,
          ...thinking,
        },
      }),
    });

  try {
    res = await call();
    if (transient(res.status)) {
      await new Promise((r) => setTimeout(r, 700));
      res = await call();
    }
  } catch {
    return json({ error: "upstream_unreachable" }, 502);
  }

  if (!res.ok) {
    // גוף התשובה של גוגל עלול לשקף בחזרה חלקים מהבקשה, ולכן לא הוחזר
    // כלל — אבל "400" בלי סיבה אינו ניתן לאבחון, וזו הייתה נפילה שקטה
    // בפני עצמה: העברנו סבב שלם בלי לדעת איזה שדה נדחה.
    //
    // מוחזר **רק** error.message מהמבנה של גוגל — משפט על הבקשה, לא
    // תוכן שלה — חתוך ל-300 תווים, ואחרי סינון של כל מה שנראה כמו
    // מפתח. אם המבנה אינו כצפוי, לא מוחזר דבר.
    return json({
      error: "upstream_error",
      status: res.status,
      model,
      upstream_detail: await upstreamReason(res),
      hint: res.status === 404
        ? `גוגל אינה מכירה את המודל "${model}". לשלוח {"diagnose":"models"} כדי לראות מה זמין למפתח הזה, ואז להגדיר סוד GEMINI_MODEL עם שם מהרשימה.`
        : transient(res.status)
        ? `גוגל עמוסה כרגע עבור "${model}" — זו תקלה זמנית ולא שגיאה בהגדרה. כבר ניסינו פעמיים. אם זה חוזר, להגדיר סוד GEMINI_MODEL עם דגם מיושב יותר, למשל gemini-2.5-flash.`
        : undefined,
    }, 502);
  }

  const data = await res.json().catch(() => null);
  const candidate = data?.candidates?.[0];
  // מודלים חדשים מחזירים כמה חלקים, וחלקם אינם טקסט (למשל "מחשבה").
  // לקיחת parts[0] בלבד החזירה ריק על תשובה תקינה לחלוטין.
  const raw = (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part?.text)
    .filter((t: unknown): t is string => typeof t === "string" && t !== "")
    .join("\n")
    .trim();

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
      finish_reason: candidate?.finishReason ?? null,
      had_candidates: Array.isArray(data?.candidates) ? data.candidates.length : 0,
    }, 502);
  }

  // ── מדידה, כדי להפסיק לנחש ────────────────────────────────────────
  //
  // עלות ההודעה, יחס קלט/פלט, וכמה מהקלט הגיע מקאש — כל אלה היו עד כה
  // הערכה שלי מתוך שתי מחרוזות שמדדתי. גוגל מחזירה את המספרים האמיתיים
  // ב-usageMetadata, וההערכה עלתה לנו כבר פעם אחת בפי עשרים.
  //
  // ⚠️ **עודכן 10.09: נשמר במסד, ובאישור גיא.** ההערה כאן אמרה קודם
  // "לא נשמר", והנימוק היה נכון: לוג שימוש לכל שיחה הוא מסלול קצר
  // לדליפת תוכן.
  //
  // מה שהשתנה הוא **המבנה, לא הרצון**. ב-044 נשמרות ספירות בלבד; טקסט
  // השאלה נשמר רק כשטים לא ידע לענות, ואין מזהה שיחה כלל. כלומר אין
  // דרך לקשר ספירה לתוכן או לאדם — וזה מה שהפך את זה למותר.
  //
  // ⚠️ ולעולם לא מוצג למבקרת.
  const u = data?.usageMetadata;
  const usage = u && typeof u === "object"
    ? {
      input: u.promptTokenCount ?? null,
      output: u.candidatesTokenCount ?? null,
      // הפלט מחויב כולל אסימוני חשיבה, ולכן הם נספרים בנפרד ולא נבלעים.
      thinking: u.thoughtsTokenCount ?? 0,
      // 0 או null פירושו שהקאש לא נגע. זה מה שמכריע אם קאשינג הקשר שווה
      // משהו כאן, במקום להסיק את זה מטבלת מחירים.
      cached_input: u.cachedContentTokenCount ?? 0,
    }
    : null;

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
  // 🔴 **וההערכה כאן משוערת, ואומרת זאת.** `answered` נגזר משילוב של
  // איתותים — אפס מקורות, ולשון סירוב שההוראות שלנו עצמן מכתיבות —
  // ולא מהצהרה של המודל. זו הערכה טובה מספיק כדי לראות מגמה, **ולא
  // מספיק כדי להסיק ממנה על שורה בודדת.** מי שיקרא את היומן צריך לדעת
  // את זה, ולכן זה כתוב כאן ולא רק בראש שלי.
  const noSources = rides.length === 0 && chunks.length === 0 && candidates.length === 0;
  const refusalPhrasing = /(אין לי את הנתון|אין לנו את הנתון|לא ידוע אם קיימת|לא נבדק)/
    .test(answer ?? "");
  const answered = !(noSources && refusalPhrasing);
  logTurn(url, dbKey, {
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
