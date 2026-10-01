import type { Host } from "./handler";
import { commit } from "../build-info";
import { DEPLOY_STAMP } from "./stamp";
import type { WaitUntil } from "./turn-log";

/**
 * The application log — **one JSON line per request**, at its end.
 *
 * ⚠️ **Tim himself doesn't write to the log.** He fills a record (`Trace`) the host hands
 * him — stage timings, attempts, counts — the same way `waitUntil` is passed. `logged`
 * wraps the request, measures, and prints. So Node, Netlify and Supabase print the same
 * line, and Tim doesn't know which of them he runs on.
 *
 * 🔴 **What is never in the line:** the question text, the answer, the IP (not even its
 * hash), keys, and Google's error text. The line is built **from a closed list** of
 * fields from the response body, not from the whole body — a new field in the response
 * doesn't reach the log until someone adds it here on purpose. Same rules as the turn
 * log (044).
 *
 * ⚠️ And the log itself is a new way for data to leave the system — recorded in O2 for Guy.
 */
export type Level = "info" | "warn" | "error" | "fatal";

/** What Tim tells about the request, beyond what's in the response. */
export interface Trace {
  /** When the response doesn't say what happened (e.g. diagnose). */
  outcome?: string;
  stages_ms: Record<string, number>;
  gemini: { attempts?: number; first_status?: number; unreachable?: boolean };
  candidates?: number;
  answered?: boolean;
  /**
   * The stages whose call hit its time limit (deadline.ts) — "rate_limit", "rides",
   * "candidates", "embed", "knowledge", "gemini". A name, never what was being asked.
   */
  timed_out?: string[];
}

export const newTrace = (): Trace => ({ stages_ms: {}, gemini: {} });

/** Times a stage, even when it fails. Without a trace — just runs it. */
export async function timed<T>(trace: Trace | undefined, stage: string, run: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await run();
  } finally {
    if (trace) trace.stages_ms[stage] = Math.round(performance.now() - t0);
  }
}

/** An event that happens after the response went out, so it can't go into its line. */
export type TimEvent = { event: "turn_log_failed"; status?: number; error?: string };

export function emit(line: { level: Level } & Record<string, unknown>): void {
  const out = JSON.stringify({ t: new Date().toISOString(), ...line });
  // ⚠️ The console method is the level: Netlify and Supabase classify by it, and filter on it.
  if (line.level === "info") console.log(out);
  else if (line.level === "warn") console.warn(out);
  else console.error(out);
}

// ── Exceptions ────────────────────────────────────────────────────────

const WINDOW = 8;

/**
 * An error message, without what came from outside.
 *
 * 🔴 **An error message can quote input** — a JSON error, for example, quotes the text it
 * failed on, i.e. the family's question. A message that shares a run of 8 characters
 * with any string from the request body is hidden entirely, not "fixed": a partial quote
 * isn't caught by replacement.
 */
export function redact(message: string, inputs: string[]): string {
  for (const s of inputs) {
    if (s.length < WINDOW) {
      if (s.length >= 3 && message.includes(s)) return "‹הוסתר: מצטט את הבקשה›";
      continue;
    }
    for (let i = 0; i + WINDOW <= s.length; i++) {
      if (message.includes(s.slice(i, i + WINDOW))) return "‹הוסתר: מצטט את הבקשה›";
    }
  }
  return message
    .replace(/AIza[\w-]{10,}/g, "‹מפתח›")
    .replace(/[A-Za-z0-9_-]{40,}/g, "‹מוסתר›")
    .slice(0, 200);
}

export function errorFields(err: unknown, inputs: string[]) {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    name: e.name,
    message: redact(e.message, inputs),
    // ⚠️ Only `at` lines — the first line of the stack is the message itself.
    stack: (e.stack ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).slice(0, 6),
  };
}

/** Every string in the request body — the question and the history — so an exception can't quote them. */
async function readInputs(request: Request): Promise<string[]> {
  if (request.method !== "POST") return [];
  const text = await request.clone().text().catch(() => "");
  const found: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (typeof v === "string") found.push(v);
    else if (depth < 4 && v && typeof v === "object") for (const x of Object.values(v)) walk(x, depth + 1);
  };
  try {
    walk(JSON.parse(text), 0);
  } catch {
    // ⚠️ A body that isn't JSON — the whole text is the input.
    found.push(text);
  }
  return found;
}

// ── The line ──────────────────────────────────────────────────────────

const num = (x: unknown) => (typeof x === "number" ? x : undefined);
const str = (x: unknown) => (typeof x === "string" ? x : undefined);
const compact = (o: Record<string, unknown>) => {
  const kept = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length ? kept : undefined;
};

async function responseBody(res: Response): Promise<Record<string, unknown>> {
  if (!res.headers.get("content-type")?.includes("application/json")) return {};
  const b = await res.clone().json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? b : {};
}

export interface LogContext {
  platform: string;
  route: string;
  /** The id the host gave (Netlify: `context.requestId`). Without one, it's made here. */
  req?: string;
  waitUntil?: WaitUntil;
}

/**
 * Runs one request and prints one line about it. An exception is caught here: the
 * browser gets `{"error":"unhandled","req":…}`, and the details go to the log only.
 */
export async function logged(
  request: Request,
  ctx: LogContext,
  run: (request: Request, host: Host) => Promise<Response>,
): Promise<Response> {
  const req = ctx.req ?? crypto.randomUUID();
  const t0 = performance.now();
  const trace = newTrace();
  const inputs = await readInputs(request);
  const base = { req, platform: ctx.platform, stamp: DEPLOY_STAMP, commit: commit(), route: ctx.route };
  const host: Host = {
    waitUntil: ctx.waitUntil,
    trace,
    report: (e) => emit({ level: "warn", ...base, ...e }),
  };

  let res: Response;
  let error: ReturnType<typeof errorFields> | undefined;
  try {
    res = await run(request, host);
  } catch (err) {
    error = errorFields(err, inputs);
    res = new Response(JSON.stringify({ error: "unhandled", req }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const b = await responseBody(res);
  const usage = (b.usage && typeof b.usage === "object" ? b.usage : {}) as Record<string, unknown>;
  const outcome = error ? "unhandled"
    : str(b.error) ?? trace.outcome
    ?? (typeof b.answer === "string" ? (trace.answered === false ? "not_answered" : "answered")
      : request.method === "OPTIONS" ? "preflight" : "ok");
  const level: Level = error || res.status >= 500 ? "error"
    : res.status >= 400 || b.retrieval === "failed" ? "warn"
    : "info";

  emit({
    level,
    ...base,
    method: request.method,
    status: res.status,
    ms: Math.round(performance.now() - t0),
    outcome,
    stages_ms: compact(trace.stages_ms),
    gemini: compact({
      model: str(b.model),
      attempts: trace.gemini.attempts,
      first_status: trace.gemini.first_status,
      upstream_status: b.error === "upstream_error" ? num(b.status) : undefined,
      unreachable: trace.gemini.unreachable,
      finish_reason: str(b.finish_reason),
      in: num(usage.input),
      out: num(usage.output),
      thinking: num(usage.thinking),
      cached_in: num(usage.cached_input),
    }),
    retrieval: str(b.retrieval),
    rides: num(b.rides),
    chunks: num(b.chunks),
    candidates: trace.candidates,
    answered: trace.answered,
    timed_out: trace.timed_out?.length ? trace.timed_out : undefined,
    // The names of the categories caught ("url"), not what was caught.
    scrubbed: Array.isArray(b.scrubbed) && b.scrubbed.length ? b.scrubbed : undefined,
    error,
  });

  try {
    res.headers.set("x-request-id", req);
  } catch { /* a response with immutable headers — the id is still in the line */ }
  return res;
}
