/**
 * המקורות המותרים, מנורמלים.
 *
 * 🔴 **גיא תפס שתי דרכים שבהן השוואה מדויקת נכשלת על ערך שנראה נכון.**
 *
 * 1. **סלאש בסוף.** כותרת `Origin` שדפדפן שולח לעולם אינה כוללת אותו.
 *    `ALLOWED_ORIGIN=https://x/` היה חוסם **כל** בקשה אמיתית — והתסמין
 *    הוא CORS, כלומר נראה כמו תקלת רשת ולא כמו הגדרה שגויה.
 * 2. **מקור אחד בלבד.** גרסת הבדיקה יושבת על
 *    `tim-test--<אתר>.netlify.app` — מקור **שונה** מהאתר הציבורי. ערך
 *    יחיד פירושו שאחד מהשניים חסום תמיד.
 *
 * ⚠️ **וההרחבה הזו מרחיבה את מה שמותר, ולכן היא מצומצמת בכוונה:**
 * פיצול לפי פסיק והשוואה מדויקת לכל אחד. **אין כאן prefix ואין תת־דומיין
 * בכוכבית** — `https://x` שמתאים ל-`https://x.evil.com` הוא בדיוק הכשל
 * שהצמצום הזה קיים כדי למנוע.
 */
export function allowedOrigins(env: Record<string, string | undefined>): string[] {
  return (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter((o) => o !== "");
}

export function corsFor(req: Request, env: Record<string, string | undefined>) {
  const allowed = allowedOrigins(env);
  const origin = req.headers.get("origin");
  // ⚠️ רשימה ריקה = הסוד לא הוגדר, וזה עדיין `*`. ערך שהוא סלאש בלבד,
  // או פסיקים בלבד, מתנרמל לרשימה ריקה — כלומר **נפתח**, ולא נסגר.
  // לכן `diagnose` אומר כמה מקורות נספרו, ולא רק שהסוד קיים.
  const value = allowed.length === 0 ? "*" : origin && allowed.includes(origin) ? origin : "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // ⚠️ בלי השורה הזו הדפדפן שולח בקשת בדיקה מקדימה **לפני כל שאלה**,
    // ומחכה לתשובה לפני שהוא שולח את השאלה עצמה. זה נראה בלוג: לכל POST
    // יש OPTIONS צמוד. יממה של זיכרון מוחקת את הסבב הזה מכל שאלה שנייה
    // ואילך.
    //
    // ⚠️ ומה שזה **אינו**: הרשאה. הדפדפן זוכר את התשובה, לא מדלג על
    // הבדיקה — שינוי במדיניות ייכנס לתוקף אצל מבקרת קיימת תוך יממה.
    "Access-Control-Max-Age": "86400",
  };
  if (value) h["Access-Control-Allow-Origin"] = value;
  return h;
}

/**
 * צעד שאינו יכול להמשיך — והתשובה שהוא היה נותן. `handle` מחזיר אותה כמות
 * שהיא, ולכן הקודים והגופים זהים לאלה שנכתבו פעם בתוך `handle` עצמו.
 */
export type Fail = { fail: { status: number; body: Record<string, unknown> } };
export const failWith = (status: number, body: Record<string, unknown>): Fail => ({ fail: { status, body } });
export const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && "fail" in x;

export function jsonResponder(cors: Record<string, string>) {
  return (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });
}
