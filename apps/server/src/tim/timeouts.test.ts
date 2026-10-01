import { afterEach, expect, test } from "vitest";
import { handle } from "./index";
import type { DirectQueries } from "./lookup";
import { newTrace } from "./log";
import { ask, stub, geminiOk, FULL } from "./test-helpers";

/**
 * 🔴 **No outgoing call had a time limit (found 01.10).** Netlify kills a function at 60s, and
 * a killed function writes no log line — so a hang was invisible, and the family got Netlify's
 * page after a minute. Now one deadline per request (45s), a cap per call, and a timeout is a
 * result: Tim's own JSON, and `timed_out` in the log line.
 *
 * The limits are shrunk here through the host, so each test runs in milliseconds.
 */
const SMALL = { totalMs: 400, rateLimitMs: 60, dbMs: 60, embedMs: 60, geminiMs: 120, retryMinLeftMs: 50 };

/** A call that never answers — until it is aborted, as a real fetch would be. */
const hang = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    const s = init?.signal;
    if (!s) return; // no signal: hangs forever — which is the bug
    s.addEventListener("abort", () => reject(s.reason), { once: true });
  });

const EMBED = () => new Response(JSON.stringify({ embedding: { values: Array.from({ length: 1536 }, () => 0.01) } }), { status: 200 });

/** Every call answers normally, except the one `which` says hangs. */
const world = (which: "rate_limit" | "rides" | "embed" | "gemini" | "none", gemini: () => Response = geminiOk) =>
  ((url: string, init?: RequestInit) => {
    if (url.includes("/rpc/check_rate_limit")) return which === "rate_limit" ? hang(init) : new Response('"ok"', { status: 200 });
    if (url.includes("/rpc/find_experiences")) return which === "rides" ? hang(init) : new Response("[]", { status: 200 });
    if (url.includes("/rpc/match_knowledge")) return new Response("[]", { status: 200 });
    if (url.includes(":embedContent")) return which === "embed" ? hang(init) : EMBED();
    return which === "gemini" ? hang(init) : gemini();
  }) as unknown as (url: string, init?: RequestInit) => Response;

let restore = () => {};
afterEach(() => restore());

const timedAsk = async (question: string, extra: Record<string, unknown> = {}) => {
  const trace = newTrace();
  const t0 = performance.now();
  const res = await handle(ask({ question }), FULL, { trace, limits: SMALL, ...extra });
  return { res, body: await res.json(), ms: performance.now() - t0, trace };
};

test("Gemini שנתקע — upstream_timeout של טים, לפני המועד, ולא שתיקה", { timeout: 2000 }, async () => {
  restore = stub(world("gemini")).restore;
  const { res, body, ms, trace } = await timedAsk("מה עושים כשיורד גשם?");
  expect([res.status, body.error]).toEqual([504, "upstream_timeout"]);
  expect(ms).toBeLessThan(SMALL.totalMs);
  expect(trace.timed_out).toEqual(["gemini"]);
});

test("שאילתת מתקן שנתקעה — התשובה בכל זאת יוצאת, בלי המתקן", { timeout: 2000 }, async () => {
  restore = stub(world("rides")).restore;
  const { res, body, trace } = await timedAsk("מה הגובה ב-Space Mountain?");
  expect([res.status, body.rides]).toEqual([200, 0]);
  expect(trace.timed_out).toEqual(["rides"]);
});

test("הטמעה שנתקעה — retrieval: failed, והתשובה יוצאת", { timeout: 2000 }, async () => {
  restore = stub(world("embed")).restore;
  const { res, body, trace } = await timedAsk("מה עושים כשיורד גשם?");
  expect([res.status, body.retrieval]).toEqual([200, "failed"]);
  expect(trace.timed_out).toEqual(["embed"]);
});

// The rate limit fails closed, as on any failure: without it the endpoint is open.
test("גג הקריאות שנתקע — נעצר, כמו בכל כשל שלו", { timeout: 2000 }, async () => {
  restore = stub(world("rate_limit")).restore;
  const { res, body, trace } = await timedAsk("היי");
  expect([res.status, body.error]).toEqual([500, "rate_limit_unavailable"]);
  expect(trace.timed_out).toEqual(["rate_limit"]);
});

test("503 כשלא נשאר זמן לניסיון שני — בלי ניסיון שני", { timeout: 2000 }, async () => {
  const s = stub(world("none", () => new Response("{}", { status: 503 })));
  restore = s.restore;
  const trace = newTrace();
  await handle(ask({ question: "היי" }), FULL, { trace, limits: { ...SMALL, retryMinLeftMs: 10_000 } });
  expect(trace.gemini.attempts).toBe(1);
  expect(s.calls.filter((c) => c.url.includes("generateContent")).length).toBe(1);
});

test("503 כשיש זמן — ניסיון שני, כמו קודם", { timeout: 2000 }, async () => {
  const s = stub(world("none", () => new Response("{}", { status: 503 })));
  restore = s.restore;
  const trace = newTrace();
  await handle(ask({ question: "היי" }), FULL, { trace, limits: { ...SMALL, retryMinLeftMs: 0 } });
  expect(trace.gemini.attempts).toBe(2);
});

test("שאילתה ישירה שנתקעה — מבוטלת, וכשל רך", { timeout: 2000 }, async () => {
  restore = stub(world("none")).restore;
  let cancelled = false;
  const direct: DirectQueries = {
    findExperiences: (_p, signal) =>
      new Promise((_, reject) => signal?.addEventListener("abort", () => { cancelled = true; reject(signal.reason); }, { once: true })),
    matchKnowledge: async () => [],
    parkCandidates: async () => [],
  };
  const { res, body, trace } = await timedAsk("מה הגובה ב-Space Mountain?", { direct });
  expect([res.status, body.rides, cancelled]).toEqual([200, 0, true]);
  expect(trace.timed_out).toEqual(["rides"]);
});

// 🔴 One deadline, not a sum of caps: a slow stage leaves less for the next.
test("המועד אחד לכל הבקשה — הטמעה איטית משאירה פחות זמן ל-Gemini", { timeout: 2000 }, async () => {
  const limits = { ...SMALL, totalMs: 200, embedMs: 150, geminiMs: 1000 };
  const slowEmbed = ((url: string, init?: RequestInit) => {
    if (url.includes(":embedContent")) return hang(init);
    return world("gemini")(url, init);
  }) as unknown as (url: string, init?: RequestInit) => Response;
  restore = stub(slowEmbed).restore;
  const t0 = performance.now();
  const res = await handle(ask({ question: "מה עושים כשיורד גשם?" }), FULL, { limits });
  expect((await res.json()).error).toBe("upstream_timeout");
  expect(performance.now() - t0).toBeLessThan(limits.totalMs + 100);
});
