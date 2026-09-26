import { afterEach, test } from "vitest";
import { handle } from "./index";
import { logTurn } from "./turn-log";
import { assertEquals, ask, stub, FULL, dbSays } from "./test-helpers";

const turn = { question: "שאלה", answered: false, reason: "no_data", model: "m", usage: null };

afterEach(() => {
  delete (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
});

/**
 * 🔴 **The write isn't awaited, so something has to keep it alive.** On Netlify the
 * function is frozen after the response goes out, and a write not handed to waitUntil
 * vanishes — silently, because the log fails silently on purpose.
 */
test("הכתיבה נמסרת ל-waitUntil שהמארח נתן", async () => {
  const s = stub(() => new Response(null, { status: 204 }));
  const held: Promise<unknown>[] = [];
  logTurn("http://db", "k", turn, { waitUntil: (p) => held.push(p) });
  assertEquals(held.length, 1);
  await held[0];
  assertEquals(s.calls.filter((c) => c.url.endsWith("/rpc/log_turn")).length, 1);
  s.restore();
});

test("בלי waitUntil מהמארח — EdgeRuntime של Supabase, כמו קודם", () => {
  const s = stub(() => new Response(null, { status: 204 }));
  const held: Promise<unknown>[] = [];
  (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => held.push(p) };
  logTurn("http://db", "k", turn);
  assertEquals(held.length, 1);
  s.restore();
});

test("המארח גובר על EdgeRuntime — הכתיבה נמסרת פעם אחת, לא פעמיים", () => {
  const s = stub(() => new Response(null, { status: 204 }));
  const host: Promise<unknown>[] = [], edge: Promise<unknown>[] = [];
  (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => edge.push(p) };
  logTurn("http://db", "k", turn, { waitUntil: (p) => host.push(p) });
  assertEquals([host.length, edge.length], [1, 0]);
  s.restore();
});

test("handle מעביר את waitUntil של המארח עד היומן", async () => {
  const s = stub(dbSays("ok"));
  const held: Promise<unknown>[] = [];
  const r = await handle(ask({ question: "היי" }), FULL, { waitUntil: (p) => held.push(p) });
  assertEquals(r.status, 200);
  assertEquals(held.length, 1);
  s.restore();
});
