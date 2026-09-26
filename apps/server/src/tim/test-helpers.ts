// Shared by the tests of Tim's modules — split out of index.test.ts (26.09).
import type { KnowledgeChunk } from "./index";
// No dependencies, for the same reason the function itself has none: everything is tested locally.
export function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ?? "לא זהה"}\n  התקבל : ${a}\n  ציפינו: ${b}`);
}

export const KEY = "AIza" + "x".repeat(35);
export const ask = (body: unknown, method = "POST") =>
  // GET can't carry a body — Request throws. The 405 test sends an empty GET.
  new Request("http://x/tim", method === "GET" ? { method } : { method, body: JSON.stringify(body) });

/** Replaces the global fetch, and returns what was sent so it can be checked. */
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

/** A newer model returns several parts, and the first isn't necessarily the text. */
export const geminiMultiPart = () =>
  new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ thought: true }, { text: "חלק" }, { text: "שני" }] },
      finishReason: "STOP",
    }],
  }), { status: 200 });

export const FULL = { GEMINI_API_KEY: KEY, SUPABASE_URL: "http://db", SUPABASE_ANON_KEY: "anon-key-value" };
/** A database that lets the request through: a low count, and a write that succeeds. */
/** check_rate_limit returns 'ok' | 'user' | 'global' — which limit was hit, not just whether. */
export const dbSays = (verdict: "ok" | "user" | "global") => (url: string) =>
  url.includes("/rpc/check_rate_limit")
    ? new Response(JSON.stringify(verdict), { status: 200 })
    : geminiOk();

// ── Thinking budget ──────────────────────────────────────────────────
// Measured: 505 thinking vs. 154 answer — 72% of the message's cost. The most
// expensive knob. It's opt-in so a deploy doesn't change behavior that already works.

/** The body sent to Google, as an object. */
export const sentToGemini = (calls: { url: string; init?: RequestInit }[]) =>
  // deno-lint-ignore no-explicit-any
  JSON.parse(calls.find((c) => c.url.includes("generateContent"))!.init!.body as any);

/** A database that returns chunks, and Google returning both an embedding and an answer. */
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

/** A database that returns rides, chunks, and an answer. */
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

// ── Context tiers ─────────────────────────────────────────────────────
// 🔴 **The rule "T1/T2 are never contradicted by T3-T5" couldn't be kept.**
// It was written in the instructions, but the information needed to apply it
// never reached the model: all chunks went in as one pile, and a Reddit chunk
// looked identical to an official restriction.
//
// ⚠️ **And the two requirements don't conflict, which is what made the fix
// possible:** what must not leak is the **tier name** (`T1`), and what must
// get through is the **order**. The labels are Hebrew words, so the tier-leak
// test keeps passing.

export const chunk = (tier: string | null, content: string): KnowledgeChunk => ({
  content,
  volatility: "static",
  last_verified: null,
  authority_tier: tier,
});
