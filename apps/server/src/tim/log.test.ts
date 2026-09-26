import { afterEach, beforeEach, test, vi } from "vitest";
import { handle } from "./index";
import { logged, redact } from "./log";
import { DEPLOY_STAMP } from "./stamp";
import { assertEquals, stub, geminiOk, FULL, KEY } from "./test-helpers";

// ── What was written to the log, as objects ──────────────────────────
type Line = Record<string, any>;
let lines: Line[] = [];
let raw: string[] = [];
beforeEach(() => {
  lines = [];
  raw = [];
  for (const m of ["log", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((s: string) => {
      raw.push(s);
      lines.push({ ...JSON.parse(s), _via: m });
    });
  }
});
afterEach(() => vi.restoreAllMocks());

const MARKER = "סימן-זיהוי-שאסור-שידלוף";
const IP = "203.0.113.77";
const request = (body: unknown) =>
  new Request("http://x/tim", {
    method: "POST",
    headers: { "x-forwarded-for": IP },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const run = (body: unknown, env: Record<string, string | undefined> = FULL, ctx = {}) => {
  const held: Promise<unknown>[] = [];
  return logged(request(body), { platform: "test", route: "/tim", waitUntil: (p) => held.push(p), ...ctx },
    (req, host) => handle(req, env, host)).then(async (res) => { await Promise.all(held); return res; });
};

/** A database and Google that answer; `gemini` decides what Google returns on each call. */
const world = (gemini: () => Response, logTurn = () => new Response(null, { status: 204 })) => (url: string) =>
  url.includes("/rpc/check_rate_limit") ? new Response(JSON.stringify("ok"), { status: 200 })
  : url.includes("/rpc/log_turn") ? logTurn()
  : url.includes("generateContent") ? gemini()
  : url.includes(":embedContent")
    ? new Response(JSON.stringify({ embedding: { values: Array.from({ length: 1536 }, () => 0.01) } }), { status: 200 })
  : new Response("[]", { status: 200 });

// ── One line per request ──────────────────────────────────────────────

test("שורה אחת לבקשה, עם הזמן, השלבים והמודל", async () => {
  const s = stub(world(geminiOk));
  const res = await run({ question: "היי" });
  s.restore();
  assertEquals(res.status, 200);
  assertEquals(lines.length, 1);
  const l = lines[0]!;
  assertEquals([l.level, l._via, l.platform, l.route, l.method, l.status, l.stamp], ["info", "log", "test", "/tim", "POST", 200, DEPLOY_STAMP]);
  assertEquals(typeof l.t === "string" && !Number.isNaN(Date.parse(l.t)), true, "זמן ISO");
  assertEquals(typeof l.ms, "number");
  assertEquals(["answered", "not_answered"].includes(l.outcome), true, `outcome: ${l.outcome}`);
  assertEquals(Object.keys(l.stages_ms).sort(), ["gemini", "rate_limit", "retrieval"]);
  assertEquals(l.gemini.attempts, 1);
  assertEquals(typeof l.gemini.model, "string");
});

test("מזהה הבקשה חוזר בכותרת x-request-id, וזהה לזה שבשורה", async () => {
  const s = stub(world(geminiOk));
  const res = await run({ question: "היי" });
  s.restore();
  assertEquals(res.headers.get("x-request-id"), lines[0]!.req);
  assertEquals(typeof lines[0]!.req === "string" && lines[0]!.req.length > 8, true);
});

test("מזהה שהמארח נתן (Netlify: context.requestId) הוא המזהה", async () => {
  const s = stub(world(geminiOk));
  await run({ question: "היי" }, FULL, { req: "01NETLIFYREQ" });
  s.restore();
  assertEquals(lines[0]!.req, "01NETLIFYREQ");
});

// ── 🔴 Privacy: no line carries content, an address or a key ─────────

test("השאלה, התשובה, ה-IP והמפתח — אינם באף שורה", async () => {
  const s = stub(world(geminiOk));
  await run({ question: `מה הגובה ב-${MARKER}?`, history: [{ role: "user", text: `קודם: ${MARKER}` }] });
  s.restore();
  const all = raw.join("\n");
  for (const secret of [MARKER, "שלום, אני מחובר.", IP, KEY, FULL.SUPABASE_ANON_KEY]) {
    assertEquals(all.includes(secret), false, `דלף: ${secret}`);
  }
});

// ── Levels ────────────────────────────────────────────────────────────

test("4xx הוא warn, עם הקוד של טים כ-outcome", async () => {
  await run({ question: "" });
  assertEquals([lines[0]!.level, lines[0]!._via, lines[0]!.status, lines[0]!.outcome], ["warn", "warn", 400, "empty_question"]);
});

test("5xx מגוגל הוא error, עם הסטטוס שלה ושני הניסיונות", async () => {
  const s = stub(world(() => new Response("{}", { status: 503 })));
  await run({ question: "היי" });
  s.restore();
  const l = lines[0]!;
  assertEquals([l.level, l._via, l.status, l.outcome], ["error", "error", 502, "upstream_error"]);
  assertEquals([l.gemini.attempts, l.gemini.first_status, l.gemini.upstream_status], [2, 503, 503]);
});

test("ניסיון שני שהצליח — info, אבל נראה: attempts 2 והסטטוס של הראשון", async () => {
  let n = 0;
  const s = stub(world(() => (n++ === 0 ? new Response("{}", { status: 503 }) : geminiOk())));
  await run({ question: "היי" });
  s.restore();
  const l = lines[0]!;
  assertEquals([l.level, l.status, l.gemini.attempts, l.gemini.first_status], ["info", 200, 2, 503]);
});

test("שליפה שנפלה עם תשובה 200 — warn, כי 200 כזה הוא תשובה בלי נתונים", async () => {
  const s = stub((url) =>
    url.includes(":embedContent") ? new Response("{}", { status: 500 }) : world(geminiOk)(url));
  await run({ question: "כמה עולה חניה?" });
  s.restore();
  assertEquals([lines[0]!.level, lines[0]!.status, lines[0]!.retrieval], ["warn", 200, "failed"]);
});

test("גוגל שאינה עונה כלל — error, unreachable", async () => {
  const s = stub((url) => {
    if (url.includes("generateContent")) throw new TypeError("fetch failed");
    return world(geminiOk)(url);
  });
  await run({ question: "היי" });
  s.restore();
  assertEquals([lines[0]!.level, lines[0]!.outcome, lines[0]!.gemini.unreachable], ["error", "upstream_unreachable", true]);
});

// ── Exceptions ────────────────────────────────────────────────────────

test("חריגה: error עם שם ומחסנית, והדפדפן מקבל מזהה — לא את ההודעה", async () => {
  const res = await logged(request({ question: "היי" }), { platform: "test", route: "/tim" }, () => {
    throw new RangeError("the internals broke");
  });
  const body = await res.json();
  assertEquals([res.status, body.error, "detail" in body], [500, "unhandled", false]);
  assertEquals(body.req, lines[0]!.req);
  const l = lines[0]!;
  assertEquals([l.level, l.outcome, l.error.name, l.error.message], ["error", "unhandled", "RangeError", "the internals broke"]);
  assertEquals(Array.isArray(l.error.stack) && l.error.stack.length > 0 && l.error.stack.every((f: string) => f.startsWith("at ")), true);
});

test("🔴 חריגה שמצטטת את השאלה — ההודעה מוסתרת, והסימן אינו בשורה", async () => {
  await logged(request({ question: `שאלה עם ${MARKER} בפנים` }), { platform: "test", route: "/tim" }, () => {
    throw new SyntaxError(`Unexpected token in "${MARKER.slice(2, 14)}"`);
  });
  assertEquals(raw.join("\n").includes(MARKER.slice(2, 14)), false);
  assertEquals(lines[0]!.error.message.startsWith("‹"), true, lines[0]!.error.message);
});

test("redact: מפתחות נמחקים, והודעה ארוכה נחתכת ל-200", () => {
  assertEquals(redact(`bad key ${KEY}`, []).includes("AIza"), false);
  assertEquals(redact("no such row. ".repeat(40), []).length, 200);
  assertEquals(redact("plain failure", ["שאלה אחרת לגמרי"]), "plain failure");
});

// ── A failed turn log — a separate line, the same id ─────────────────

test("כתיבה ליומן שנכשלה — שורת warn נפרדת עם אותו req", async () => {
  const s = stub(world(geminiOk, () => new Response("{}", { status: 500 })));
  await run({ question: "היי" });
  s.restore();
  const failed = lines.find((l) => l.event === "turn_log_failed");
  assertEquals(failed !== undefined, true, "אין שורת turn_log_failed");
  assertEquals([failed!.level, failed!.status, failed!.req], ["warn", 500, lines[0]!.req]);
});

test("כתיבה ליומן שזרקה — אותה שורה, עם שם השגיאה בלבד", async () => {
  // ⚠️ A real fetch doesn't throw — it returns a rejected Promise. So does this one.
  const real = globalThis.fetch;
  globalThis.fetch = ((u: string | URL | Request) => String(u).includes("/rpc/log_turn")
    ? Promise.reject(new TypeError(`network ${MARKER}`))
    : Promise.resolve(world(geminiOk)(String(u)))) as typeof fetch;
  await run({ question: "היי" });
  globalThis.fetch = real;
  const failed = lines.find((l) => l.event === "turn_log_failed");
  assertEquals(failed?.error, "TypeError");
  assertEquals(raw.join("\n").includes(MARKER), false);
});
