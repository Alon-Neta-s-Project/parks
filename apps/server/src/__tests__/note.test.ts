import { describe, expect, it, vi } from "vitest";
import { createApp, type Env } from "../app";
import type { NoteStore, TesterNote } from "../note";

/**
 * POST /note — a tester's note on one of Tim's answers, saved with the question and the answer
 * (Alon, 01.10: the old path saved the note alone, tied to a random id). No tester key and no rate
 * limit — kept simple on purpose (Alon); the table's 500-note cap is the one guard.
 */
const env: Env = {};
const store = () => {
  const saved: TesterNote[] = [];
  return { saved, notes: { save: async (n: TesterNote) => { saved.push(n); } } satisfies NoteStore };
};
const post = (body: unknown) => new Request("http://x/note", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(body),
});
const NOTE = { turnRef: "t1", sessionRef: "s1", note: "ארוך מדי", question: "מה הגובה ב-Space Mountain?", answer: "112 ס\"מ." };

describe("POST /note", () => {
  it("saves the note with its question and answer", async () => {
    const s = store();
    const res = await createApp({ env, notes: s.notes }).fetch(post(NOTE));
    expect([res.status, await res.json()]).toEqual([200, { saved: true }]);
    expect(s.saved).toEqual([NOTE]);
  });

  it("refuses an empty note and a missing reference — nothing saved", async () => {
    const s = store();
    const app = createApp({ env, notes: s.notes });
    expect((await app.fetch(post({ ...NOTE, note: "   " }))).status).toBe(400);
    expect((await app.fetch(post({ ...NOTE, turnRef: "" }))).status).toBe(400);
    expect(s.saved).toEqual([]);
  });

  it("cuts to the table's limits, as the database function did", async () => {
    const s = store();
    await createApp({ env, notes: s.notes }).fetch(post({ ...NOTE, note: "x".repeat(3000), answer: "y".repeat(9000) }));
    expect([s.saved[0]!.note.length, s.saved[0]!.answer!.length]).toEqual([2000, 8000]);
  });

  it("is unavailable, and says so, on a host with no database connection", async () => {
    const res = await createApp({ env }).fetch(post(NOTE));
    expect([res.status, (await res.json()).error]).toEqual([503, "notes_unavailable"]);
  });

  it("answers only POST (and OPTIONS for CORS)", async () => {
    const app = createApp({ env, notes: store().notes });
    expect((await app.fetch(new Request("http://x/note"))).status).toBe(405);
    expect((await app.fetch(new Request("http://x/note", { method: "OPTIONS" }))).status).toBe(200);
  });

  // The log is a place data leaves the system: that a note was saved — never what it says.
  it("logs the request without the note, the question or the answer", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => { out.push(s); });
    await createApp({ env, notes: store().notes }).fetch(post(NOTE));
    vi.restoreAllMocks();
    const line = out.join("\n");
    expect(line).toContain('"route":"/note"');
    for (const s of [NOTE.note, NOTE.question, NOTE.answer]) expect(line).not.toContain(s);
  });
});
