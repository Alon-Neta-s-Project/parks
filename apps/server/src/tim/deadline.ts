import type { Trace } from "./log";

/**
 * One deadline per request, and a cap per outgoing call.
 *
 * 🔴 **Until 01.10 no outgoing call had a time limit.** Netlify kills a synchronous function at
 * 60s and cannot be raised; a killed function writes no log line, so a hang was invisible — and
 * the family got Netlify's error page after a minute instead of Tim's answer.
 *
 * ⚠️ **One deadline, not a sum of caps.** Each call gets `min(its cap, the time left)`, so a slow
 * stage leaves less for the next one and the whole request stays under `totalMs`. 45s leaves 15s
 * below Netlify's 60 to send Tim's own JSON and write the log line.
 *
 * Measured 26.09: a whole answer is median 6.2s, max 9.3s — the caps are far above normal and
 * exist only for the hang.
 */
export const LIMITS = {
  /** The whole request. */
  totalMs: 45_000,
  /** check_rate_limit — one short query. On timeout it fails closed, as on any failure. */
  rateLimitMs: 3_000,
  /** One database query (rides, candidates, knowledge) — ~0.3s to Singapore. Fails soft. */
  dbMs: 5_000,
  /** Embedding the question — ~1s. Fails soft. */
  embedMs: 5_000,
  /** One Gemini answer. */
  geminiMs: 20_000,
  /** A retry after 429/503 only with at least this much left — one that will be cut anyway only spends time. */
  retryMinLeftMs: 10_000,
};
export type Limits = typeof LIMITS;

export interface Deadline {
  limits: Limits;
  /** Milliseconds left until the request's deadline. */
  left(): number;
  /** A signal that aborts at `min(cap, left())`. */
  signal(capMs: number): AbortSignal;
}

export function startDeadline(over: Partial<Limits> = {}): Deadline {
  const limits = { ...LIMITS, ...over };
  const t0 = performance.now();
  const left = () => Math.max(0, limits.totalMs - (performance.now() - t0));
  // ⚠️ Whole milliseconds: `AbortSignal.timeout` throws a RangeError on a fraction — and the time
  // left always is one. Found by the test where a slow stage leaves Gemini less than its cap.
  return { limits, left, signal: (capMs) => AbortSignal.timeout(Math.max(1, Math.floor(Math.min(capMs, left())))) };
}

/** Whether a failure is our own time limit — the reason `AbortSignal.timeout` gives. */
export const isTimeout = (e: unknown): boolean =>
  !!e && typeof e === "object" && (e as { name?: string }).name === "TimeoutError";

/**
 * The request's deadline and trace, for the calls below. Optional: without it a
 * call runs uncapped, as before 01.10.
 */
export interface Limit {
  deadline?: Deadline;
  trace?: Trace;
}

/** A signal for one call: `min(its cap, the time left)`. */
export const signalFor = (l: Limit | undefined, cap: keyof Limits): AbortSignal | undefined =>
  l?.deadline ? l.deadline.signal(l.deadline.limits[cap]) : undefined;

/** A timeout is a result: the stage goes into the log line (`timed_out`), not into silence. */
export const noteTimeout = (l: Limit | undefined, stage: string, e: unknown): void => {
  if (isTimeout(e) && l?.trace) (l.trace.timed_out ??= []).push(stage);
};
