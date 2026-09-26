import type { Host } from "./handler";
import { DEPLOY_STAMP } from "./stamp";
import type { WaitUntil } from "./turn-log";

/**
 * היומן היישומי — **שורת JSON אחת לכל בקשה**, בסופה.
 *
 * ⚠️ **טים עצמו אינו כותב ליומן.** הוא ממלא רשומה (`Trace`) שהמארח מעביר
 * לו — זמני שלבים, ניסיונות, ספירות — כמו ש-`waitUntil` עובר. `logged`
 * עוטף את הבקשה, מודד, ומדפיס. כך Node, Netlify ו-Supabase מדפיסים אותה
 * שורה, וטים אינו יודע על איזה מהם הוא רץ.
 *
 * 🔴 **מה שלעולם אינו בשורה:** טקסט השאלה, התשובה, ה-IP (גם לא הגיבוב
 * שלו), מפתחות, וטקסט השגיאה של גוגל. השורה נבנית **מרשימה סגורה** של
 * שדות מגוף התשובה, ולא מהגוף כולו — שדה חדש בתשובה אינו מגיע ליומן
 * עד שמישהו מוסיף אותו כאן בכוונה. אותם כללים כמו ביומן התשובות (044).
 *
 * ⚠️ והיומן עצמו הוא יציאה חדשה של נתונים מהמערכת — רשום ב-O2 לגיא.
 */
export type Level = "info" | "warn" | "error" | "fatal";

/** מה שטים מספר על הבקשה, מעבר למה שבתשובה. */
export interface Trace {
  /** כשהתשובה אינה אומרת מה קרה (למשל אבחון). */
  outcome?: string;
  stages_ms: Record<string, number>;
  gemini: { attempts?: number; first_status?: number; unreachable?: boolean };
  candidates?: number;
  answered?: boolean;
}

export const newTrace = (): Trace => ({ stages_ms: {}, gemini: {} });

/** מודד שלב, גם כשהוא נכשל. בלי trace — מריץ בלבד. */
export async function timed<T>(trace: Trace | undefined, stage: string, run: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await run();
  } finally {
    if (trace) trace.stages_ms[stage] = Math.round(performance.now() - t0);
  }
}

/** אירוע שקורה אחרי שהתשובה יצאה, ולכן אינו יכול להיכנס לשורה שלה. */
export type TimEvent = { event: "turn_log_failed"; status?: number; error?: string };

export function emit(line: { level: Level } & Record<string, unknown>): void {
  const out = JSON.stringify({ t: new Date().toISOString(), ...line });
  // ⚠️ השיטה היא הרמה: Netlify ו-Supabase מסווגים לפיה, ובה מסננים.
  if (line.level === "info") console.log(out);
  else if (line.level === "warn") console.warn(out);
  else console.error(out);
}

// ── חריגות ───────────────────────────────────────────────────────────

const WINDOW = 8;

/**
 * הודעת שגיאה, בלי מה שהגיע מבחוץ.
 *
 * 🔴 **הודעת שגיאה יכולה לצטט קלט** — שגיאת JSON, למשל, מצטטת את הטקסט
 * שנכשלה עליו, כלומר את השאלה של המשפחה. הודעה שחולקת רצף של 8 תווים
 * עם מחרוזת כלשהי מגוף הבקשה מוסתרת כולה, ולא "מתוקנת": ציטוט חלקי
 * אינו נתפס בהחלפה.
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
    // ⚠️ רק שורות `at` — השורה הראשונה של המחסנית היא ההודעה עצמה.
    stack: (e.stack ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).slice(0, 6),
  };
}

/** כל מחרוזת בגוף הבקשה — השאלה וההיסטוריה — כדי שחריגה לא תצטט אותן. */
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
    // ⚠️ גוף שאינו JSON — הטקסט כולו הוא הקלט.
    found.push(text);
  }
  return found;
}

// ── השורה ────────────────────────────────────────────────────────────

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
  /** מזהה שהמארח נתן (Netlify: `context.requestId`). בלעדיו — נוצר כאן. */
  req?: string;
  waitUntil?: WaitUntil;
}

/**
 * מריץ בקשה אחת ומדפיס עליה שורה אחת. חריגה נתפסת כאן: הדפדפן מקבל
 * `{"error":"unhandled","req":…}`, והפרטים הולכים ליומן בלבד.
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
  const base = { req, platform: ctx.platform, stamp: DEPLOY_STAMP, route: ctx.route };
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
    // שמות הקטגוריות שנתפסו ("url"), לא מה שנתפס.
    scrubbed: Array.isArray(b.scrubbed) && b.scrubbed.length ? b.scrubbed : undefined,
    error,
  });

  try {
    res.headers.set("x-request-id", req);
  } catch { /* תשובה שכותרותיה נעולות — המזהה עדיין בשורה */ }
  return res;
}
