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
 * שם המודל. ניתן לשינוי בסוד GEMINI_MODEL בלי לגעת בקוד — רשימת המודלים
 * של גוגל משתנה, ושם שהיה תקף נעלם בלי הודעה. 404 מגוגל על נתיב תקין
 * פירושו כמעט תמיד שהשם כאן כבר לא קיים.
 *
 * ⚠️ אין כאן ברירת מחדל "בטוחה". השם הזה הוא ניחוש מושכל בלבד; מה שקובע
 * הוא מה ש-{"diagnose":"models"} מחזיר עבור המפתח בפועל.
 */
const DEFAULT_MODEL = "gemini-3.5-flash";
//
// ירדנו מ-3.7 ל-3.5 אחרי 503 חוזר. 503 אינו "המודל לא קיים" — הוא
// "המודל עמוס כרגע", והמודל החדש ביותר הוא גם העמוס ביותר. 3.5 מיושב
// יותר. אם גם הוא יחזיר 503 — GEMINI_MODEL מאפשר לרדת ל-gemini-2.5-flash
// בלי נגיעה בקוד.
//
// ⛔ ובמפורש **לא** `gemini-flash-latest`, אף שהוא נוח יותר.
//
// כינוי מתגלגל משנה את המודל תחת הרגליים בלי שינוי קוד, בלי הודעה, ובלי
// שנדע מתי. לפרויקט הזה יש סט זהב לבדיקות רגרסיה (שלב 4), וכל ערכו בכך
// שכשתשובה משתנה — אנחנו יודעים למה. עם כינוי מתגלגל, סט הזהב נשבר יום
// אחד ואיש לא ידע אם הסיבה היא שינוי שלנו או שדרוג של גוגל.
//
// זו אותה משפחה של "נפילה שקטה" שכל הפרויקט בנוי נגדה: שינוי אמיתי
// שנראה כמו כלום. שם מוצמד נשבר **בקול** — 404 — וזה בדיוק מה שקרה כאן
// ומה שהוביל אותנו לרשימה האמיתית.
const MAX_QUESTION_CHARS = 1000;

/**
 * ⚠️ **הגגות אינם נשלחים למסד יותר.** הם יושבים במסד, ומספר אחד כאן
 * משמש **רק** להודעה למשתמשת ("נסי בעוד שעה").
 *
 * 🔴 קודם הם נשלחו כארגומנטים ל-check_rate_limit, והפונקציה מוענקת
 * ל-anon — מפתח ציבורי בהגדרה, שנשלח לכל דפדפן. כלומר כל מי שפותחת את
 * כלי המפתחים יכלה לקרוא ישירות ל-RPC עם p_max: 999999 ולעבור את שני
 * הגגות, בלי לגעת בפונקציה הזו בכלל (נמצא על ידי גיא, מיגרציה 026).
 *
 * הלקח הכללי: ערך שנשלח מהקוראת אינו הגבלה על הקוראת.
 */
const RETRY_AFTER_MINUTES = 60;

const SYSTEM = `אתה טים, עוזר לתכנון יום בפארקים באורלנדו. אתה עונה בעברית.

כללי הזהירות שלך, ושלושתם מחייבים:
1. אינך משלים פרט חסר מהיגיון או מהקשר. אם המידע לא ניתן לך — אתה אומר שאין לך אותו.
2. אינך מבטיח זמינות, החזר כספי, או חיסכון בזמן.
3. כשפרט עשוי להשתנות — אתה אומר זאת ומפנה לאימות במקור הרשמי.

⛔ וכרגע, במיוחד: עדיין לא חוברת למאגר המידע של הפארקים. אין לך שום נתון על
מתקנים, מגבלות גובה, שעות פתיחה או מחירים. על כל שאלה עובדתית כזו ענה
במפורש שאתה עדיין לא מחובר למאגר ולכן אינך יכול לענות — ואל תנחש, גם לא
"בערך". שיחה כללית וברכות מותרות.`;

/**
 * בדיקת שפיות בלבד, לפני שמנסים לקרוא עם הערך.
 *
 * ⚠️ בכוונה **בלי** דרישה לתחילית "AIza". מפתחות גוגל נראים כך היום, אבל
 * זו הנחה על פורמט של ספק חיצוני שאני לא יכול לאמת — והיא הפכה כאן לחסם:
 * מפתח תקין בפורמט אחר היה נדחה על ידי הקוד שלי לפני שגוגל בכלל נשאלה.
 * גוגל היא הסמכות על מה מפתח תקין, לא אני. ערך שגוי יחזור ממנה כשגיאה
 * מפורשת, וזה עדיף על ניחוש מקומי שחוסם.
 *
 * מה שנשאר: רווחים (הדבקה שגררה תו לבן) ואורך שאינו סביר (הדבקה חלקית).
 * שתי אלה אינן תלויות בפורמט של אף ספק.
 */
export function looksLikeGeminiKey(key: string | undefined): boolean {
  if (typeof key !== "string") return false;
  return key.trim().length >= 30 && !/\s/.test(key.trim());
}

/** מזהה יציב לדלי ההגבלה, בלי לאחסן כתובת IP. */
export async function bucketKey(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}


/**
 * אבחון. מחזיר אילו משתני סביבה קיימים — **שמות, נוכחות ואורך בלבד,
 * לעולם לא ערכים.**
 *
 * למה זה קבוע ולא זמני: אני חסום ברשת מסופאבייס ואיני יכול לראות אילו
 * משתנים היא מזריקה לפונקציה. בלי זה, כל תקלת הרשאה הופכת לסבב ניחושים
 * שבו נטע מדביקה קוד ומדווחת, שוב ושוב. שם ואורך אינם סוד — הערך הוא.
 */
/**
 * הגדרות החשיבה, במקום אחד.
 *
 * ⚠️ נגזר פעם אחת ומשמש גם את הקריאה למודל וגם את האבחון. כשהיו שני
 * חישובים, האבחון היה יכול לדווח על מה שאיננו נשלח — כלומר לוח בקרה
 * שמראה מתג במצב שאינו המצב בפועל.
 *
 * שני שמות, כי דורות המודלים אינם מסכימים ביניהם:
 *   GEMINI_THINKING_BUDGET — מספר אסימונים (2.5)
 *   GEMINI_THINKING_LEVEL  — "low" / "high" (3.x)
 * 3.5 קיבל budget=128 **בלי שגיאה ובלי השפעה** — 505 אסימוני חשיבה
 * לפני, 507 אחרי. שדה שמתעלמים ממנו בשקט הוא בדיוק סוג הכשל שאנחנו
 * נמנעים ממנו, ולכן האבחון מראה מה נשלח בפועל.
 */
export function thinkingConfig(env: Record<string, string | undefined>) {
  const raw = env.GEMINI_THINKING_BUDGET?.trim();
  const budget = Number(raw);
  const level = env.GEMINI_THINKING_LEVEL?.trim();
  const cfg: Record<string, unknown> = {};
  if (raw && Number.isFinite(budget)) cfg.thinkingBudget = budget;
  if (level) cfg.thinkingLevel = level;
  return Object.keys(cfg).length ? { thinkingConfig: cfg } : {};
}

function diagnose(env: Record<string, string | undefined>) {
  const watched = [
    "GEMINI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_DB_URL",
    "ALLOWED_ORIGIN",
    "GEMINI_MODEL",
    "GEMINI_THINKING_BUDGET",
    "GEMINI_THINKING_LEVEL",
  ];
  const known: Record<string, string> = {};
  for (const name of watched) {
    const v = env[name];
    known[name] = typeof v === "string" && v !== ""
      ? `קיים · ${v.trim().length} תווים`
      : "חסר";
  }
  // גם כל שם אחר שהוזרק ושאיני מכיר — שמות בלבד.
  const others = Object.keys(env).filter((k) => !watched.includes(k)).sort();
  // ⚠️ מה שבאמת נשלח, ולא מה שהוגדר. אלה שתי שאלות שונות: סוד שלא הגיע
  // לפונקציה וסוד שהגיע והמודל התעלם ממנו נראים זהים מבחוץ, ורק זה
  // מפריד ביניהם.
  return { known, other_names: others, sent_to_model: thinkingConfig(env) };
}

/**
 * `*` נכון כל עוד אין דומיין. ברגע שיהיה — להגדיר את הסוד ALLOWED_ORIGIN
 * לדומיין שלנו, וזה מצטמצם מעצמו בלי שינוי קוד. מקור שאינו תואם לא מקבל
 * כותרת CORS כלל, והדפדפן חוסם אותו.
 */
/**
 * הסיבה שגוגל נתנה, בלי מה ששלחנו אליה.
 *
 * ⚠️ מחרוזות ארוכות שנראות כמו מפתח נמחקות לפני ההחזרה. הן אינן אמורות
 * להופיע בהודעת שגיאה, אבל "אמור" אינו אכיפה, וזו הודעה שנוסעת לדפדפן.
 */
async function upstreamReason(res: Response): Promise<string | null> {
  const body = await res.text().catch(() => "");
  let message: unknown = null;
  try {
    message = JSON.parse(body)?.error?.message;
  } catch { /* גוף שאינו JSON — אין ממה לגזור סיבה */ }
  if (typeof message !== "string" || !message) return null;
  return message
    .replace(/AIza[\w-]{10,}/g, "‹מפתח›")
    .replace(/[A-Za-z0-9_-]{40,}/g, "‹מוסתר›")
    .slice(0, 300);
}

function corsFor(req: Request, env: Record<string, string | undefined>) {
  const allowed = env.ALLOWED_ORIGIN;
  const origin = req.headers.get("origin");
  const value = !allowed ? "*" : origin === allowed ? origin : "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (value) h["Access-Control-Allow-Origin"] = value;
  return h;
}

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
   * היא זמן שהמשתמשת מחכה מול מסך. עדיף להחזיר שגיאה מפורשת מלנסות שוב
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
        contents: [{ role: "user", parts: [{ text: question }] }],
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
  const answer = (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part?.text)
    .filter((t: unknown): t is string => typeof t === "string" && t !== "")
    .join("\n")
    .trim();

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
  // ⚠️ לא נשמר במסד ולא מוצג למבקרת — רק מוחזר, כדי שאפשר יהיה לקרוא
  // אותו בבדיקה ידנית. לוג של שימוש לכל שיחה הוא מסלול קצר לדליפת תוכן.
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

  return json({ answer, model, usage });
}

/**
 * ⚠️ העטיפה הזו היא מה שהיה חסר.
 *
 * בניתי טיפול שגיאות בכל שכבה פנימית, והשארתי את החיצונית פתוחה: חריגה
 * לא-מטופלת ברחה ל-runtime, סופאבייס החזירה 500 גולמי בלי גוף, ולוח
 * הבדיקה נפל בניסיון לפרסר אותו — "Cannot read properties of undefined".
 * שגיאה בלי גוף אינה ניתנת לאבחון, וזו בדיוק הנפילה השקטה בגרסתה הרועשת.
 *
 * ההודעה שמוחזרת היא של הקוד שלנו. מפתחות אינם מופיעים בהודעות חריגה של
 * JavaScript, ולכן זה בטוח — ומה שנחסך הוא סבב ניחושים נוסף.
 */
Deno.serve(async (req) => {
  try {
    return await handle(req, Deno.env.toObject());
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "unhandled",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
});
