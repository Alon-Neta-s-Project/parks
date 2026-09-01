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

/** האם המפתח נראה כמו מפתח Gemini, לפני שמנסים לקרוא איתו. */
export function looksLikeGeminiKey(key: string | undefined): boolean {
  return typeof key === "string" && key.startsWith("AIza") && key.length >= 35;
}

/** מזהה יציב לדלי ההגבלה, בלי לאחסן כתובת IP. */
export async function bucketKey(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });

export async function handle(req: Request, env: Record<string, string | undefined>): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const key = env.GEMINI_API_KEY;
  if (!looksLikeGeminiKey(key)) {
    // בכוונה מפורש: זו השגיאה היחידה שנטע תראה אם הסוד לא נשמר נכון, והיא
    // צריכה לדעת בדיוק מה חסר. שום חלק מהמפתח אינו מוחזר.
    return json({ error: "missing_api_key", detail: "GEMINI_API_KEY לא הוגדר בסודות הפונקציה, או שאינו מתחיל ב-AIza" }, 500);
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
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const bucket = await bucketKey(ip, env.RATE_LIMIT_SALT ?? serviceKey.slice(0, 16));
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const auth = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    const counted = await fetch(
      `${url}/rest/v1/api_call?select=id&bucket=eq.${bucket}&created_at=gt.${since}`,
      { headers: { ...auth, Prefer: "count=exact", Range: "0-0" } },
    );
    // PostgREST מחזיר את הסך הכל בכותרת content-range, בצורה "0-0/17".
    const total = Number(counted.headers.get("content-range")?.split("/")[1] ?? "0");

    if (total >= MAX_PER_WINDOW) {
      return json({ error: "rate_limited", retry_after_minutes: WINDOW_MINUTES }, 429);
    }
    await fetch(`${url}/rest/v1/api_call`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ bucket }),
    });
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
