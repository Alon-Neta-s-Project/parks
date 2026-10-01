import { afterEach, describe, expect, it, vi } from "vitest";
import { saveNote } from "../save-note";

/**
 * Where a tester's note goes. With VITE_NOTE_URL (staging) — the server's POST /note, with the
 * question and the answer, no key (Alon, 01.10). Without it — the old path, untouched: the
 * production test page still runs on the old server.
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const NOTE = { turnRef: "t1", sessionRef: "s1", note: "ארוך מדי", question: "מה הגובה?", answer: "112 ס\"מ." };

describe("saveNote", () => {
  it("with VITE_NOTE_URL: posts to the server — the note, the question and the answer, no key", async () => {
    vi.stubEnv("VITE_NOTE_URL", "/api/note");
    const f = vi.fn(async () => new Response(JSON.stringify({ saved: true }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await saveNote(NOTE)).toBe("saved");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/note");
    expect(JSON.parse(String(init.body))).toEqual(NOTE);
  });

  it("a server that refuses, or cannot be reached, leaves the note local — and says so", async () => {
    vi.stubEnv("VITE_NOTE_URL", "/api/note");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    expect(await saveNote(NOTE)).toBe("local-only");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await saveNote(NOTE)).toBe("local-only");
  });

  // One variable fewer (Alon, 01.10: "why do we need environment variables"): a page that asks Tim on
  // its own server (/api/tim) sends notes next to it.
  it("without VITE_NOTE_URL, but Tim on our own server (/api/tim): notes go to /api/note", async () => {
    vi.stubEnv("VITE_NOTE_URL", "");
    vi.stubEnv("VITE_TIM_URL", "/api/tim");
    const f = vi.fn(async () => new Response(JSON.stringify({ saved: true }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await saveNote(NOTE)).toBe("saved");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/note");
  });

  it("without VITE_NOTE_URL, and Tim elsewhere (production's Supabase): never calls /api/note", async () => {
    vi.stubEnv("VITE_NOTE_URL", "");
    vi.stubEnv("VITE_TIM_URL", "https://example.supabase.co/functions/v1/tim");
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await saveNote(NOTE);
    expect(f.mock.calls.some((c) => String((c as unknown[])[0]).includes("/api/note"))).toBe(false);
  });
});
