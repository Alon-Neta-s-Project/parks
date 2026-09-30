import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bucketKey } from "../tim/index";
import app from "../../server";

const SALT = "test-salt";

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "k".repeat(39));
  vi.stubEnv("SUPABASE_URL", "https://db.example");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon-key-for-tests");
  vi.stubEnv("RATE_LIMIT_SALT", SALT);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The database says "rate limited" and records the bucket; Gemini is never reached. */
function stubRateLimit() {
  const buckets: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/rpc/check_rate_limit")) {
      buckets.push(JSON.parse(String(init?.body)).p_bucket);
      return new Response(JSON.stringify("user"), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  }));
  return buckets;
}

const post = (headers: Record<string, string> = {}) =>
  app.request("/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ question: "מה הגובה ב-Space Mountain?" }),
  });

describe("the server on Vercel", () => {
  it("is the same app: /health and /tim", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await (await app.request("/health")).json()).toEqual({ ok: true });
    vi.stubEnv("GEMINI_API_KEY", "");
    expect((await (await post()).json()).error).toBe("missing_api_key");
  });

  /**
   * 🔴 **The bucket comes from `x-real-ip`, which Vercel overwrites at its edge** ("to
   * prevent IP spoofing", its request-headers docs). A caller's own `x-forwarded-for`
   * must not choose the bucket.
   */
  it("keys the rate limit on x-real-ip, not on a caller's x-forwarded-for", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const buckets = stubRateLimit();
    await post({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" });
    await post({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "2.2.2.2" });
    const real = await bucketKey("9.9.9.9", SALT);
    expect(buckets).toEqual([real, real]);
  });

  it("logs Vercel's request id and says it ran on Vercel", async () => {
    const out: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((s: string) => { out.push(s); });
    const res = await app.request("/tim", { method: "POST", body: JSON.stringify({ question: "" }), headers: { "x-vercel-id": "fra1::abc123" } });
    const line = JSON.parse(out[0]!);
    expect([line.req, line.platform, line.outcome]).toEqual(["fra1::abc123", "vercel", "empty_question"]);
    expect(res.headers.get("x-request-id")).toBe("fra1::abc123");
  });

  // ⚠️ Outside Vercel there is no request context for waitUntil. A full answer — which
  // writes the turn log through waitUntil — must still come back, not crash.
  it("answers in full outside Vercel, where waitUntil has no context", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).endsWith("/rpc/check_rate_limit")
        ? new Response(JSON.stringify("ok"), { status: 200 })
        : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "שלום" }] } }] }), { status: 200 })));
    const res = await post({ "x-real-ip": "9.9.9.9" });
    expect(res.status).toBe(200);
    expect((await res.json()).answer).toBe("שלום");
  });
});
