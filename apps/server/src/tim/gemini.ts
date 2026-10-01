import { thinkingConfig } from "./config";
import { isTimeout, noteTimeout, signalFor, type Limit } from "./deadline";
import { failWith, type Fail } from "./http";
import type { Trace } from "./log";
import type { Turn } from "./understand";
/**
 * `*` is right as long as there is no domain. Once there is — set the
 * ALLOWED_ORIGIN secret to our domain, and this narrows by itself with no code
 * change. An origin that doesn't match gets no CORS header at all, and the
 * browser blocks it.
 */
/**
 * The reason Google gave, without what we sent it.
 *
 * ⚠️ Long strings that look like a key are scrubbed before returning. They aren't
 * supposed to appear in an error message, but "supposed to" is not enforcement,
 * and this message travels to the browser.
 */
export async function upstreamReason(res: Response): Promise<string | null> {
  const body = await res.text().catch(() => "");
  let message: unknown = null;
  try {
    message = JSON.parse(body)?.error?.message;
  } catch { /* Body isn't JSON — nothing to derive a reason from */ }
  if (typeof message !== "string" || !message) return null;
  return message
    .replace(/AIza[\w-]{10,}/g, "‹מפתח›")
    .replace(/[A-Za-z0-9_-]{40,}/g, "‹מוסתר›")
    .slice(0, 300);
}

/**
 * The thinking budget — the most expensive knob we have, and that was measured,
 * not estimated.
 *
 * In a real measurement: input 275 · answer 154 · **thinking 505**. Thinking
 * tokens are billed as output, so they were **72% of the message's cost** — three
 * times the answer itself, to say "I don't have data yet". For comparison: moving
 * to 3.6 saves 16%, and caching the whole input saves 5%.
 *
 * ⚠️ **Opt-in on purpose.** Without the secret, exactly what is sent today is
 * sent, so behavior that already works doesn't change just by deploying. The
 * field isn't documented consistently across model generations, and risking a 400
 * on an unknown field is not a risk taken quietly on a path that works. Set the
 * secret, measure, and if it breaks — delete it and roll back without touching
 * code.
 *
 * A non-numeric value is ignored rather than sent: a secret with a typo that takes
 * Tim down entirely is too high a price for an optional knob.
 */
/**
 * 503 and 429 from Google are transient by definition — "busy", not "wrong". One
 * retry after a short wait solves most of them.
 *
 * ⚠️ Only one, on purpose: we're already inside a rate-limited endpoint, and the
 * wait is time the user spends staring at a screen. Better to return an explicit
 * error than to retry again and again and look stuck.
 */
const transient = (code: number) => code === 503 || code === 429 || code >= 500;

/** One turn as Gemini takes it — text, or a tool call and its result (agent.ts). */
export interface Content {
  role: "user" | "model";
  // deno-lint-ignore no-explicit-any
  parts: any[];
}

/** A tool as Gemini is told about it (tools.ts). */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The classic call: the history, then one user turn with the context and the question. */
export function askGemini(p: {
  key: string; model: string; env: Record<string, string | undefined>; system: string; history: Turn[]; userText: string;
  trace?: Trace;
  /** The request's deadline (deadline.ts). Without it, uncapped as before 01.10. */
  limit?: Limit;
}): Promise<Fail | { data: any }> {
  return generate({
    ...p,
    contents: [
      ...p.history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      { role: "user", parts: [{ text: p.userText }] },
    ],
  });
}

/**
 * One call to Gemini — with tools when the agent passes them.
 *
 * ⚠️ `toolMode: "NONE"` with the tools still declared, not the tools left out: once the turns
 * hold a tool call, the request has to keep declaring the tools it refers to. NONE is how the
 * agent says "answer with what you have" (agent.ts).
 */
export async function generate(p: {
  key: string; model: string; env: Record<string, string | undefined>; system: string; contents: Content[];
  tools?: FunctionDeclaration[];
  toolMode?: "AUTO" | "NONE";
  trace?: Trace;
  limit?: Limit;
}): Promise<Fail | { data: any }> {
  const thinking = thinkingConfig(p.env);
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`;
  let res: Response;
  const call = () =>
    fetch(endpoint, {
      method: "POST",
      // A fresh signal per attempt: the second one gets only what the first left.
      signal: signalFor(p.limit, "geminiMs"),
      headers: { "Content-Type": "application/json", "x-goog-api-key": p.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: p.system }] },
        // ⚠️ The passages before the question. A model that gets the question
        // first and then a source tends to answer from what it already "knows"
        // and use the source as confirmation; the reverse order produces an
        // answer that leans on the source.
        // ⚠️ The history before the context and the question, and as real turns,
        // not pasted text. A model that gets a conversation as one paragraph
        // treats it as a quote; separate turns are what make it remember what
        // was already asked.
        contents: p.contents,
        ...(p.tools?.length
          ? {
            tools: [{ functionDeclarations: p.tools }],
            toolConfig: { functionCallingConfig: { mode: p.toolMode ?? "AUTO" } },
          }
          : {}),
        generationConfig: {
          temperature: 0.3,
          // ⚠️ 2048 and no less. Thinking tokens count toward this budget,
          // and in a real measurement they were 505 against a 154-token
          // answer. I earlier proposed lowering it to 1000 — that would have
          // cut the answer mid-way and returned an empty MAX_TOKENS, i.e.
          // broken things instead of saving. The right knob is the thinking
          // budget below, not the ceiling.
          maxOutputTokens: 2048,
          ...thinking,
        },
      }),
    });

  // ⚠️ Attempts go into the log: a second attempt that succeeded isn't visible
  // in the response, and it is exactly the signal that Google is unstable —
  // before the family feels it.
  const tr = p.trace?.gemini;
  try {
    res = await call();
    if (tr) tr.attempts = 1;
    if (transient(res.status)) {
      if (tr) tr.first_status = res.status;
      // ⚠️ A retry only with time for it (deadline.ts `retryMinLeftMs`). One that will be cut
      // anyway spends the family's wait and returns the same failure, later.
      const dl = p.limit?.deadline;
      if (!dl || dl.left() >= dl.limits.retryMinLeftMs) {
        await new Promise((r) => setTimeout(r, 700));
        res = await call();
        if (tr) tr.attempts = 2;
      }
    }
  } catch (e) {
    // 🔴 Our own time limit is not "unreachable": Google answered nothing in time. It is said
    // as itself, and the log line names the stage (timed_out: ["gemini"]).
    if (isTimeout(e)) {
      noteTimeout(p.limit, "gemini", e);
      return failWith(504, { error: "upstream_timeout", model: p.model });
    }
    if (tr) tr.unreachable = true;
    return failWith(502, { error: "upstream_unreachable" });
  }

  if (!res.ok) {
  // Google's response body may echo back parts of the request, so it wasn't
  // returned at all — but a "400" with no reason can't be diagnosed, and that
  // was a silent failure of its own: we spent a whole round without knowing
  // which field was rejected.
  //
  // **Only** error.message from Google's structure is returned — a sentence
  // about the request, not its content — cut to 300 characters, and after
  // scrubbing anything that looks like a key. If the structure isn't as
  // expected, nothing is returned.
    return failWith(502, {
      error: "upstream_error",
      status: res.status,
      model: p.model,
      upstream_detail: await upstreamReason(res),
      hint: res.status === 404
        ? `גוגל אינה מכירה את המודל "${p.model}". לשלוח {"diagnose":"models"} כדי לראות מה זמין למפתח הזה, ואז להגדיר סוד GEMINI_MODEL עם שם מהרשימה.`
        : transient(res.status)
        ? `גוגל עמוסה כרגע עבור "${p.model}" — זו תקלה זמנית ולא שגיאה בהגדרה. כבר ניסינו פעמיים. אם זה חוזר, להגדיר סוד GEMINI_MODEL עם דגם מיושב יותר, למשל gemini-2.5-flash.`
        : undefined,
    });
  }
  return { data: await res.json().catch(() => null) };
}

// Newer models return several parts, and some aren't text (e.g. a "thought").
// Taking only parts[0] returned empty on a perfectly valid answer.
export function readAnswer(data: any): { raw: string; finishReason: string | null; candidates: number } {
  const candidate = data?.candidates?.[0];
  const raw = (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part?.text)
    .filter((t: unknown): t is string => typeof t === "string" && t !== "")
    .join("\n")
    .trim();
  return {
    raw,
    finishReason: candidate?.finishReason ?? null,
    candidates: Array.isArray(data?.candidates) ? data.candidates.length : 0,
  };
}

// ── Measurement, to stop guessing ───────────────────────────────────
//
// The message's cost, the input/output ratio, and how much of the input came
// from cache — until now all of these were my estimate from two strings I
// measured. Google returns the real numbers in usageMetadata, and the estimate
// has already been off by a factor of twenty once.
//
// ⚠️ **Updated 10.09: stored in the database, with Guy's approval.** This
// comment used to say "not stored", and the reasoning was right: a usage log
// per conversation is a short path to leaking content.
//
// What changed is **the structure, not the intent**. In 044 only counts are
// stored; the question text is stored only when Tim couldn't answer, and there
// is no conversation id at all. So there is no way to link a count to content
// or to a person — and that is what made it permissible.
//
// ⚠️ And it is never shown to the visitor.
export function readUsage(data: any) {
  const u = data?.usageMetadata;
  return u && typeof u === "object"
    ? {
      input: u.promptTokenCount ?? null,
      output: u.candidatesTokenCount ?? null,
      // Output is billed including thinking tokens, so they're counted
      // separately rather than swallowed.
      thinking: u.thoughtsTokenCount ?? 0,
      // 0 or null means the cache wasn't touched. This is what decides whether
      // context caching is worth anything here, instead of inferring it from a
      // price table.
      cached_input: u.cachedContentTokenCount ?? 0,
    }
    : null;
}
