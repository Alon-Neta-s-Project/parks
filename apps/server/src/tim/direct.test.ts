import { afterEach, test } from "vitest";
import { handle } from "./index";
import { findCandidates, type DirectQueries } from "./lookup";
import { assertEquals, ask, stub, geminiOk, withChunks, FULL } from "./test-helpers";

/**
 * 🔴 **Which flow a question takes (01.10).** Without a direct connection — the classic flow,
 * the database functions over PostgREST, as production runs today. With one (staging) — the
 * agent: the knowledge is fetched up front through the server's query, and rides are reached
 * **only through the tools**, when Gemini asks for them (tools.test.ts, agent.test.ts).
 */
const world = (calls: string[]) => (url: string) => {
  calls.push(url);
  if (url.includes("/rpc/check_rate_limit")) return new Response(JSON.stringify("ok"), { status: 200 });
  if (url.includes("/rpc/find_experiences")) return new Response(JSON.stringify([{ name: "From RPC", park: "P", status: "open", height_cm: 112 }]), { status: 200 });
  return geminiOk();
};

let restore = () => {};
afterEach(() => restore());

const noDirect: DirectQueries = {
  findExperiences: async () => { throw new Error("the classic lookup must not run with a direct connection"); },
  matchKnowledge: async () => [],
  parkCandidates: async () => { throw new Error("the classic lookup must not run with a direct connection"); },
};

test("בלי חיבור ישיר — find_experiences דרך PostgREST, כמו קודם", async () => {
  const calls: string[] = [];
  restore = stub(world(calls)).restore;
  const r = await handle(ask({ question: "מה הגובה ב-Space Mountain?" }), FULL);
  assertEquals((await r.json()).rides, 1);
  assertEquals(calls.some((u) => u.includes("/rpc/find_experiences")), true);
});

// The regex never decides on staging: a ride question does not fetch a ride on its own — only a
// tool call from Gemini does. And the database functions are never called (staging dropped them).
test("עם חיבור ישיר — הסוכן: אין שליפת מתקן מה-regex, ואין קריאה לפונקציות המסד", async () => {
  const calls: string[] = [];
  restore = stub(world(calls)).restore;
  const r = await handle(ask({ question: "מה הגובה ב-Space Mountain?" }), FULL, { direct: noDirect });
  assertEquals([r.status, (await r.json()).rides], [200, 0]);
  assertEquals(calls.filter((u) => /\/rpc\/(find_experiences|park_candidates|match_knowledge)/.test(u)), []);
});

// ── match_knowledge — the knowledge up front ─────────────────────────

const CHUNK = { content: "From RPC", volatility: "stable", last_verified: "2026-09-01", authority_tier: "T1" };

test("match_knowledge בלי חיבור ישיר — דרך PostgREST, כמו קודם", async () => {
  const s = stub(withChunks([CHUNK]));
  restore = s.restore;
  const r = await (await handle(ask({ question: "מה עושים כשיורד גשם?" }), FULL)).json();
  assertEquals([r.chunks, r.retrieval], [1, "ok"]);
  assertEquals(s.calls.some((c) => c.url.includes("/rpc/match_knowledge")), true);
});

test("match_knowledge עם חיבור ישיר — השאילתה בשרת, עם אותו וקטור ואותו גג", async () => {
  const s = stub(withChunks([CHUNK]));
  restore = s.restore;
  const asked: { embedding: string; limit: number | null; resort: string | null }[] = [];
  const direct: DirectQueries = {
    ...noDirect,
    matchKnowledge: async (p) => {
      asked.push(p);
      return [{ ...CHUNK, content: "From direct" }];
    },
  };
  const r = await (await handle(ask({ question: "מה עושים כשיורד גשם?" }), FULL, { direct })).json();
  assertEquals([r.chunks, r.retrieval], [1, "ok"]);
  assertEquals(s.calls.some((c) => c.url.includes("/rpc/match_knowledge")), false);
  // The same arguments the RPC gets: the embedding as a JSON array string, 5, no resort.
  assertEquals(asked.length, 1);
  assertEquals([JSON.parse(asked[0]!.embedding).length, asked[0]!.limit, asked[0]!.resort], [1536, 5, null]);
});

test("match_knowledge ישיר שנכשל — retrieval failed, בלי ליפול בשקט ל-PostgREST", async () => {
  const s = stub(withChunks([CHUNK]));
  restore = s.restore;
  const direct: DirectQueries = { ...noDirect, matchKnowledge: async () => { throw new Error("connection refused"); } };
  const r = await (await handle(ask({ question: "מה עושים כשיורד גשם?" }), FULL, { direct })).json();
  assertEquals([r.chunks, r.retrieval], [0, "failed"]);
  assertEquals(s.calls.some((c) => c.url.includes("/rpc/match_knowledge")), false);
});

// ── park_candidates — the classic flow's RPC ─────────────────────────
// 🔴 Called on findCandidates, not through handle(): no real question reaches it through the
// classic handler — extractRideName leaves a "name" in every recommendation question (O17).
// The agent calls park_candidates itself (tools.test.ts).

const RECOMMEND = "מה תמליצו לנו לעשות בפארק?";
const DB = { url: "http://db", dbKey: "anon-key-value" };
const CANDIDATE = { park: "Magic Kingdom", name: "From RPC", name_he: null, land: null, category: null, intensity: 2, height_cm: null, max_height_cm: null, gets_wet: null };
const withCandidates = (calls: string[]) => (url: string) => {
  calls.push(url);
  if (url.includes("/rpc/park_candidates")) return new Response(JSON.stringify([CANDIDATE]), { status: 200 });
  return geminiOk();
};

test("park_candidates — דרך PostgREST, עם 3 לפארק", async () => {
  const s = stub(withCandidates([]));
  restore = s.restore;
  const rows = await findCandidates(DB, null, RECOMMEND);
  assertEquals(rows.map((r) => r.name), ["From RPC"]);
  const call = s.calls.find((c) => c.url.includes("/rpc/park_candidates"))!;
  assertEquals(JSON.parse(String(call.init!.body)), { p_per_park: 3 });
});

test("park_candidates — רק כשאין שם מתקן ויש בקשת המלצה", async () => {
  const calls: string[] = [];
  restore = stub(withCandidates(calls)).restore;
  await findCandidates(DB, "Space Mountain", RECOMMEND);
  await findCandidates(DB, null, "מה הגובה ב-Space Mountain?");
  assertEquals(calls.filter((u) => u.includes("/rpc/park_candidates")), []);
});
