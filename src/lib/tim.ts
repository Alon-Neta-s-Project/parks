import { isConfigured } from "./supabase";

/**
 * טים — הקריאה מהדפדפן לפונקציה בשרת.
 *
 * ⚠️ המפתח של ג'מיני אינו כאן ולא יכול להיות כאן. הוא יושב ב-Secrets של
 * הפונקציה, והדפדפן שולח רק את מפתח ה-anon, שהוא ציבורי בהגדרה. זה כל
 * הטעם בקיומה של הפונקציה.
 *
 * ⚠️ ומה שאינו כאן בכוונה: זו **נפילה**, לא המסלול הראשי. עובדה על מתקן
 * מסוים — גובה, האם מרטיב, דילוג בתור — נענית מהנתונים באופן מיידי, בחינם
 * ובלי מודל. טים נשאל רק את מה שהנתונים אינם עונים עליו. מסלול הפוך היה
 * שולח שאלה על גובה למודל, משלם עליה, ומחזיר תשובה פחות אמינה מהטבלה.
 */
export type TimReply =
  | { status: "ok"; answer: string }
  /** ⚠️ לכל כישלון יש טקסט משלו. "משהו השתבש" אינו אומר למשתמש מה לעשות. */
  | { status: "failed"; reason: TimFailure; detail?: string };

export type TimFailure =
  | "not_configured"
  | "rate_limited_user"
  | "rate_limited_global"
  | "unreachable"
  | "upstream";

/**
 * ⚠️ **`quick-worker` ולא `tim`, וזה אינו שיבוש.**
 *
 * הפונקציה בסופהבייס נוצרה בשם `quick-worker`, ושמה בממשק שונה מאוחר יותר
 * ל-Tim. סופהבייס אומרת את זה במפורש במסך ההגדרות — "your slug and endpoint
 * URL will remain the same" — כלומר השם שרואים והשם שבכתובת הם שני דברים,
 * ורק השני קובע.
 *
 * 🔴 וזה עלה לנו סבב שלם בעלייה הראשונה לאוויר: הכתובת החזירה 404, סופהבייס
 * מחזירה 404 בלי כותרות CORS, הדפדפן חוסם את התשובה — והמסך הציג "לא הצלחתי
 * להגיע לשרת", שהוא בדיוק התיאור הלא נכון. השרת נענה. הנתיב לא היה קיים.
 *
 * ⚠️ **וזו התבנית המוכרת בלבוש חדש**: שם שהוצג כאילו הוא השם, בעוד השם האמיתי
 * שוכב במקום אחר. אותה משפחה של "ערך שנקרא כמשהו שהוא אינו".
 *
 * לניקוי: ליצור בסופהבייס פונקציה חדשה שה-slug שלה `tim`, להדביק בה את אותו
 * קוד, ולהחזיר את השורה הזו ל-"tim". ה-Secrets משותפים לכל הפרויקט ואינם
 * צריכים הגדרה מחדש.
 */
const TIM_FUNCTION = "quick-worker";

const timUrl = () => {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return base ? `${base.replace(/\/$/, "")}/functions/v1/${TIM_FUNCTION}` : null;
};

export async function askTim(question: string, signal?: AbortSignal): Promise<TimReply> {
  const url = timUrl();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!isConfigured || !url || !key) return { status: "failed", reason: "not_configured" };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ question }),
    });
  } catch {
    return { status: "failed", reason: "unreachable" };
  }

  const body = (await res.json().catch(() => null)) as
    | {
        answer?: string;
        error?: string;
        scope?: string;
        status?: number;
        /** הסבר שהפונקציה כתבה — למשל "הסוד GEMINI_API_KEY אינו קיים". */
        detail?: string;
        /** הסיבה שגוגל נתנה, אחרי שהפונקציה סיננה ממנה מחרוזות מפתח. */
        upstream_detail?: string;
        /** מה לעשות. הפונקציה כותבת אותו בעברית, למשל איזה סוד להגדיר. */
        hint?: string;
      }
    | null;

  if (res.ok && typeof body?.answer === "string" && body.answer.trim()) {
    return { status: "ok", answer: body.answer };
  }

  // ⚠️ שני הגדרות אינם אותה הודעה. "נסי בעוד שעה" למי שהמכסה היומית
  // נגמרה הוא שקר שהיא תגלה רק בעוד שעה.
  if (body?.error === "rate_limited") {
    return {
      status: "failed",
      reason: body.scope === "global" ? "rate_limited_global" : "rate_limited_user",
    };
  }
  return { status: "failed", reason: "upstream", detail: describe(body, res.status) };
}

/**
 * מה באמת קרה בשרת, במשפט אחד.
 *
 * ⚠️ הפונקציה מחזירה ארבעה שדות שונים, וקודם נקרא מהם רק `error` — כלומר
 * המסך הציג "upstream_error" והשליך את `hint`, שהוא בדיוק ההוראה מה
 * לתקן. שכבה שנייה של אותה נפילה שקטה, שנמצאה בעלייה הראשונה לאוויר.
 *
 * ⚠️ `hint` ראשון ובכוונה: הוא נכתב בעברית ואומר מה לעשות. שם השגיאה
 * ומספר הסטטוס באים אחריו, ולעולם לא במקומו.
 *
 * ⚠️ ומה שלא נכנס לכאן: גוף התשובה של גוגל. הוא עלול לשקף בחזרה חלקים
 * מהבקשה, והפונקציה כבר בחרה מתוכו את המשפט הבטוח בלבד.
 */
function describe(
  body: { error?: string; status?: number; detail?: string; upstream_detail?: string; hint?: string } | null,
  httpStatus: number,
): string {
  const parts = [
    body?.hint,
    body?.detail,
    body?.upstream_detail,
    body?.error && `[${body.error}${body.status ? ` ${body.status}` : ""}]`,
  ].filter((p): p is string => typeof p === "string" && p.trim() !== "");
  return parts.length ? parts.join(" · ") : `HTTP ${httpStatus}`;
}
