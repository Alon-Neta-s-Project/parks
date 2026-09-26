import type { TimEvent } from "./log";
/**
 * What the host gives to keep a task alive after the response has gone out.
 * Netlify: `context.waitUntil` · Supabase: `EdgeRuntime.waitUntil` · Node: not needed.
 */
export type WaitUntil = (p: Promise<unknown>) => void;

/** What the log needs from the host. */
export interface TurnLogHost {
  waitUntil?: WaitUntil;
  /** 🔴 A failed write doesn't change the response — but it shows in the application log. */
  report?: (e: TimEvent) => void;
}

/**
 * A write to the turn log. **Fails silently, on purpose.**
 *
 * ⚠️ **The write isn't awaited** — the answer to the family doesn't wait for the log. So
 * something has to keep it alive: the host's `waitUntil` when given, and otherwise
 * Supabase's `EdgeRuntime.waitUntil`. On Node the process keeps running, so it's not needed.
 * 🔴 **On Netlify without waitUntil the write vanishes** — the function is frozen after
 * the response, and silently, because the log fails silently.
 *
 * ⚠️ The one second (`AbortSignal.timeout`) bounds the write itself, not the response —
 * no one waits for it. It's what stops a stuck database from keeping the function alive.
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
    // ⚠️ The error's name only: a network message can carry an address, and here there's nothing to hide it with.
    (e) => host.report?.({ event: "turn_log_failed", error: e instanceof Error ? e.name : "unknown" }),
  ).catch(() => {});

  if (host.waitUntil) return host.waitUntil(write);
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: WaitUntil } }).EdgeRuntime;
  if (typeof rt?.waitUntil === "function") rt.waitUntil(write);
}

// 🔴 **And the judgement here is an estimate, and says so.** `answered` is derived from a
// combination of signals — zero sources, and refusal phrasing that our own instructions
// dictate — not from a statement by the model. It's good enough to see a trend, **and not
// good enough to conclude anything about a single row.** Whoever reads the log needs to
// know that, so it's written here and not only in my head.
export function wasAnswered(p: { rides: unknown[]; chunks: unknown[]; candidates: unknown[]; answer: string }): boolean {
  const noSources = p.rides.length === 0 && p.chunks.length === 0 && p.candidates.length === 0;
  const refusalPhrasing = /(אין לי את הנתון|אין לנו את הנתון|לא ידוע אם קיימת|לא נבדק)/
    .test(p.answer ?? "");
  return !(noSources && refusalPhrasing);
}
