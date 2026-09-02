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
const MODEL = "gemini-2.0-flash";
const MAX_QUESTION_CHARS = 1000;

/** חלון וגג. הגבלת קצב בשרת היא ההגנה האמיתית על נקודת קצה שעולה כסף —
 *  הרשמה עם מייל אינה הגנה מבוטים. */
const WINDOW_MINUTES = 60;
const MAX_PER_WINDOW = 20;

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
 * `*` נכון כל עוד אין דומיין. ברגע שיהיה — להגדיר את הסוד ALLOWED_ORIGIN
 * לדומיין שלנו, וזה מצטמצם מעצמו בלי שינוי קוד. מקור שאינו תואם לא מקבל
 * כותרת CORS כלל, והדפדפן חוסם אותו.
 */
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

  let question: unknown;
  try {
    question = (await req.json())?.question;
  } catch {
    return json({ error: "bad_json" }, 400);
  }
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
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return json({
      error: "rate_limit_unavailable",
      detail: "SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY חסרים, ולכן אי אפשר לאכוף גג קריאות",
    }, 500);
  }
  {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const bucket = await bucketKey(ip, env.RATE_LIMIT_SALT ?? serviceKey.slice(0, 16));
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const auth = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    let counted: Response;
    try {
      counted = await fetch(
        `${url}/rest/v1/api_call?select=id&bucket=eq.${bucket}&created_at=gt.${since}`,
        { headers: { ...auth, Prefer: "count=exact", Range: "0-0" } },
      );
    } catch {
      return json({ error: "rate_limit_unavailable", detail: "המסד לא נענה" }, 500);
    }
    // PostgREST מחזיר את הסך הכל בכותרת content-range, בצורה "0-0/17".
    // כותרת חסרה פירושה שהספירה לא התקבלה — לא שהיא אפס.
    const header = counted.headers.get("content-range");
    const total = Number(header?.split("/")[1]);
    if (!counted.ok || !Number.isFinite(total)) {
      return json({ error: "rate_limit_unavailable", detail: `ספירה נכשלה (${counted.status})` }, 500);
    }

    if (total >= MAX_PER_WINDOW) {
      return json({ error: "rate_limited", retry_after_minutes: WINDOW_MINUTES }, 429);
    }

    // רישום הקריאה. גם כאן סגור: אם לא נרשמה, הגג אינו ניתן לאכיפה
    // בקריאה הבאה, ולכן אין טעם להמשיך.
    let logged: Response;
    try {
      logged = await fetch(`${url}/rest/v1/api_call`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ bucket }),
      });
    } catch {
      return json({ error: "rate_limit_unavailable", detail: "רישום הקריאה נכשל" }, 500);
    }
    if (!logged.ok) {
      return json({ error: "rate_limit_unavailable", detail: `רישום הקריאה נכשל (${logged.status})` }, 500);
    }

    // ניקוי. הטבלה גדלה לנצח אחרת, ושורות ישנות מהחלון חסרות ערך — הספירה
    // ממילא מסננת אותן. רץ באחוזים כדי לא להוסיף בקשה לכל קריאה; החלופה
    // הנקייה היא pg_cron, והיא דורשת עוד הגדרה בסופאבייס.
    // ⚠️ ובכוונה בלי await ובלי בדיקת תוצאה: ניקוי שנכשל אינו סיבה
    //    לדחות משתמשת, בשונה מספירה שנכשלה.
    if (Math.random() < 0.02) {
      const stale = new Date(Date.now() - 2 * WINDOW_MINUTES * 60_000).toISOString();
      fetch(`${url}/rest/v1/api_call?created_at=lt.${stale}`, {
        method: "DELETE",
        headers: auth,
      }).catch(() => {});
    }
  }

  // ── הקריאה למודל ─────────────────────────────────────────────────────
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    });
  } catch {
    return json({ error: "upstream_unreachable" }, 502);
  }

  if (!res.ok) {
    // גוף התשובה של גוגל עלול לשקף בחזרה חלקים מהבקשה. מוחזר קוד בלבד.
    return json({ error: "upstream_error", status: res.status }, 502);
  }

  const data = await res.json();
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof answer !== "string") return json({ error: "empty_answer" }, 502);

  return json({ answer });
}

Deno.serve((req) => handle(req, Deno.env.toObject()));
