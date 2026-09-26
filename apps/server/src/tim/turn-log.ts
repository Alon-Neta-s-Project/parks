import type { TimEvent } from "./log";
/**
 * מה שהמארח נותן כדי להחזיק משימה חיה אחרי שהתשובה יצאה.
 * Netlify: `context.waitUntil` · Supabase: `EdgeRuntime.waitUntil` · Node: אין צורך.
 */
export type WaitUntil = (p: Promise<unknown>) => void;

/** מה שהיומן צריך מהמארח. */
export interface TurnLogHost {
  waitUntil?: WaitUntil;
  /** 🔴 כתיבה שנכשלה אינה משנה את התשובה — אבל היא נראית ביומן היישומי. */
  report?: (e: TimEvent) => void;
}

/**
 * כתיבה ליומן התשובות. **נכשלת בשקט, בכוונה.**
 *
 * ⚠️ **הכתיבה אינה ממתינה** — התשובה למשפחה אינה מחכה ליומן. ולכן מישהו
 * צריך להחזיק אותה חיה: `waitUntil` של המארח כשניתן, ואחרת
 * `EdgeRuntime.waitUntil` של Supabase. ב-Node התהליך ממשיך לרוץ ואין צורך.
 * 🔴 **ב-Netlify בלי waitUntil הכתיבה נעלמת** — הפונקציה מוקפאת אחרי
 * התשובה, ובשקט, כי היומן נכשל בשקט.
 *
 * ⚠️ השנייה (`AbortSignal.timeout`) חוסמת את הכתיבה עצמה, לא את התשובה —
 * איש אינו ממתין לה. היא מה שמונע ממסד תקוע להחזיק את הפונקציה חיה.
 */
export function logTurn(
  url: string,
  key: string,
  t: {
    question: string;
    answered: boolean;
    reason: string | null;
    model: string;
    usage: { input?: number; output?: number } | null;
  },
  host: TurnLogHost = {},
): void {
  const write = fetch(`${url}/rest/v1/rpc/log_turn`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_question: t.question,
      p_answered: t.answered,
      p_refusal_reason: t.reason,
      p_model: t.model,
      p_input_tokens: t.usage?.input ?? null,
      p_output_tokens: t.usage?.output ?? null,
    }),
    signal: AbortSignal.timeout(1000),
  }).then(
    (r) => { if (!r.ok) host.report?.({ event: "turn_log_failed", status: r.status }); },
    // ⚠️ שם השגיאה בלבד: הודעת רשת יכולה לשאת כתובת, וכאן אין ממה להסתיר אותה.
    (e) => host.report?.({ event: "turn_log_failed", error: e instanceof Error ? e.name : "unknown" }),
  ).catch(() => {});

  if (host.waitUntil) return host.waitUntil(write);
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: WaitUntil } }).EdgeRuntime;
  if (typeof rt?.waitUntil === "function") rt.waitUntil(write);
}

// 🔴 **וההערכה כאן משוערת, ואומרת זאת.** `answered` נגזר משילוב של
// איתותים — אפס מקורות, ולשון סירוב שההוראות שלנו עצמן מכתיבות —
// ולא מהצהרה של המודל. זו הערכה טובה מספיק כדי לראות מגמה, **ולא
// מספיק כדי להסיק ממנה על שורה בודדת.** מי שיקרא את היומן צריך לדעת
// את זה, ולכן זה כתוב כאן ולא רק בראש שלי.
export function wasAnswered(p: { rides: unknown[]; chunks: unknown[]; candidates: unknown[]; answer: string }): boolean {
  const noSources = p.rides.length === 0 && p.chunks.length === 0 && p.candidates.length === 0;
  const refusalPhrasing = /(אין לי את הנתון|אין לנו את הנתון|לא ידוע אם קיימת|לא נבדק)/
    .test(p.answer ?? "");
  return !(noSources && refusalPhrasing);
}
