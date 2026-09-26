// Shared by the tests of Tim's modules — split out of index.test.ts (26.09).
import type { KnowledgeChunk } from "./index";
// בלי תלויות, מאותה סיבה שהפונקציה עצמה בלי תלויות: הכול נבדק מקומית.
export function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ?? "לא זהה"}\n  התקבל : ${a}\n  ציפינו: ${b}`);
}

export const KEY = "AIza" + "x".repeat(35);
export const ask = (body: unknown, method = "POST") =>
  // GET אינו יכול לשאת גוף — Request זורק. הבדיקה על 405 שולחת GET ריק.
  new Request("http://x/tim", method === "GET" ? { method } : { method, body: JSON.stringify(body) });

/** מחליף את fetch הגלובלי, ומחזיר את מה שנשלח כדי שאפשר יהיה לבדוק אותו. */
export function stub(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((u: string | URL | Request, i?: RequestInit) => {
    const url = String(u);
    calls.push({ url, init: i });
    return Promise.resolve(handler(url, i));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

export const geminiOk = () =>
  new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: "שלום, אני מחובר." }] } }],
  }), { status: 200 });

/** מודל חדש מחזיר כמה חלקים, והראשון אינו בהכרח הטקסט. */
export const geminiMultiPart = () =>
  new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ thought: true }, { text: "חלק" }, { text: "שני" }] },
      finishReason: "STOP",
    }],
  }), { status: 200 });

export const FULL = { GEMINI_API_KEY: KEY, SUPABASE_URL: "http://db", SUPABASE_ANON_KEY: "anon-key-value" };
/** מסד שמאפשר לעבור: ספירה נמוכה, ורישום שמצליח. */
/** check_rate_limit מחזירה 'ok' | 'user' | 'global' — הגדר שנגע, לא רק אם. */
export const dbSays = (verdict: "ok" | "user" | "global") => (url: string) =>
  url.includes("/rpc/check_rate_limit")
    ? new Response(JSON.stringify(verdict), { status: 200 })
    : geminiOk();

// ── תקציב החשיבה ─────────────────────────────────────────────────────
// נמדד: חשיבה 505 מול תשובה 154 — 72% מעלות ההודעה. הידית היקרה ביותר.
// היא opt-in כדי שפריסה לא תשנה התנהגות שכבר עובדת.

/** הגוף שנשלח לגוגל, כאובייקט. */
export const sentToGemini = (calls: { url: string; init?: RequestInit }[]) =>
  // deno-lint-ignore no-explicit-any
  JSON.parse(calls.find((c) => c.url.includes("generateContent"))!.init!.body as any);

/** מסד שמחזיר קטעים, וגוגל שמחזירה גם embedding וגם תשובה. */
export const withChunks = (rows: unknown[]) => (url: string) => {
  if (url.includes(":embedContent")) {
    return new Response(
      JSON.stringify({ embedding: { values: Array.from({ length: 1536 }, () => 0.01) } }),
      { status: 200 },
    );
  }
  if (url.includes("/rpc/match_knowledge")) {
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  if (url.includes("/rpc/check_rate_limit")) return new Response('"ok"', { status: 200 });
  return geminiOk();
};

/** מסד שמחזיר מתקנים, קטעים, ותשובה. */
export const withRides = (rows: unknown[]) => (url: string) => {
  if (url.includes(":embedContent")) {
    return new Response(
      JSON.stringify({ embedding: { values: Array.from({ length: 1536 }, () => 0.01) } }),
      { status: 200 },
    );
  }
  if (url.includes("/rpc/find_experiences")) {
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  if (url.includes("/rpc/match_knowledge")) return new Response("[]", { status: 200 });
  if (url.includes("/rpc/check_rate_limit")) return new Response('"ok"', { status: 200 });
  return geminiOk();
};

// ── שכבות ההקשר ───────────────────────────────────────────────────────
// 🔴 **הכלל "T1/T2 לעולם לא נסתרים על ידי T3-T5" לא היה ניתן לקיום.**
// הוא היה כתוב בהוראות, והמידע להפעיל אותו עליו לא הגיע למודל: כל
// הקטעים נכנסו כערימה אחת, וקטע מרדיט נראה זהה למגבלה רשמית.
//
// ⚠️ **ושתי הדרישות אינן סותרות, וזה מה שאיפשר את התיקון:** מה שאסור
// לדלוף הוא **שם הדרגה** (`T1`), ומה שחייב להגיע הוא **הסדר**. התוויות
// הן מילים בעברית, ולכן הבדיקה על דליפת הדרגה ממשיכה לעבור.

export const chunk = (tier: string | null, content: string): KnowledgeChunk => ({
  content,
  volatility: "static",
  last_verified: null,
  authority_tier: tier,
});
