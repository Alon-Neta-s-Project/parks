import { afterEach, test } from "vitest";
import { handle } from "./index";
import type { DirectQueries, ExperienceRow } from "./lookup";
import { extractRideName } from "./understand";
import { assertEquals, ask, stub, geminiOk, withChunks, FULL } from "./test-helpers";

/**
 * 🔴 **Which path the ride lookup takes.** With a direct connection from the host, the
 * query runs in the server (apps/server/src/db); without one, the database function over
 * PostgREST, exactly as before — so production is unchanged until a host passes `direct`.
 */
const world = (calls: string[]) => (url: string) => {
  calls.push(url);
  if (url.includes("/rpc/check_rate_limit")) return new Response(JSON.stringify("ok"), { status: 200 });
  if (url.includes("/rpc/find_experiences")) return new Response(JSON.stringify([{ name: "From RPC", park: "P", status: "open", height_cm: 112 }]), { status: 200 });
  return geminiOk();
};

let restore = () => {};
afterEach(() => restore());

test("בלי חיבור ישיר — find_experiences דרך PostgREST, כמו קודם", async () => {
  const calls: string[] = [];
  restore = stub(world(calls)).restore;
  const r = await handle(ask({ question: "מה הגובה ב-Space Mountain?" }), FULL);
  assertEquals((await r.json()).rides, 1);
  assertEquals(calls.some((u) => u.includes("/rpc/find_experiences")), true);
});

test("עם חיבור ישיר — השאילתה בשרת, ו-PostgREST אינו נקרא לשליפת המתקן", async () => {
  const calls: string[] = [];
  restore = stub(world(calls)).restore;
  const asked: unknown[] = [];
  const direct: DirectQueries = {
    matchKnowledge: async () => [],
    findExperiences: async (p) => {
      asked.push(p);
      return [{ name: "From direct", name_he: null, park: "P", land: null, status: "open", status_note: null, intensity: 3, height_cm: 112 } as ExperienceRow];
    },
  };
  const question = "מה הגובה ב-Space Mountain בגובה 110?";
  const r = await handle(ask({ question }), FULL, { direct });
  assertEquals((await r.json()).rides, 1);
  assertEquals(calls.some((u) => u.includes("/rpc/find_experiences")), false);
  // The same arguments the RPC gets: Tim's own extracted name, the height, a limit of 6.
  assertEquals(asked, [{ name: extractRideName(question), park: null, heightCm: 110, limit: 6 }]);
});

test("חיבור ישיר שנכשל — כשל רך כמו השליפה, בלי ליפול בשקט ל-PostgREST", async () => {
  const calls: string[] = [];
  restore = stub(world(calls)).restore;
  const direct: DirectQueries = { matchKnowledge: async () => [], findExperiences: async () => { throw new Error("connection refused"); } };
  const r = await handle(ask({ question: "מה הגובה ב-Space Mountain?" }), FULL, { direct });
  assertEquals(r.status, 200);
  assertEquals((await r.json()).rides, 0);
  // ⚠️ No silent fallback to the other source (CLAUDE.md).
  assertEquals(calls.some((u) => u.includes("/rpc/find_experiences")), false);
});

// ── match_knowledge ──────────────────────────────────────────────────

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
    findExperiences: async () => [],
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
  const direct: DirectQueries = {
    findExperiences: async () => [],
    matchKnowledge: async () => { throw new Error("connection refused"); },
  };
  const r = await (await handle(ask({ question: "מה עושים כשיורד גשם?" }), FULL, { direct })).json();
  assertEquals([r.chunks, r.retrieval], [0, "failed"]);
  assertEquals(s.calls.some((c) => c.url.includes("/rpc/match_knowledge")), false);
});
