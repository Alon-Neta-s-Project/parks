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

const timUrl = () => {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return base ? `${base.replace(/\/$/, "")}/functions/v1/tim` : null;
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
    | { answer?: string; error?: string; scope?: string }
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
  return { status: "failed", reason: "upstream", detail: body?.error ?? String(res.status) };
}
