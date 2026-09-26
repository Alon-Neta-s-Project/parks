import { afterEach, describe, expect, it, vi } from "vitest";
import { bucketKey } from "../tim/index";
import type { Env } from "../app";
import { createNetlifyHandler } from "../netlify";
import fn, { config } from "../../netlify/functions/api";

const SALT = "test-salt";
const baseEnv: Env = {
  GEMINI_API_KEY: "k".repeat(39),
  SUPABASE_URL: "https://db.example",
  SUPABASE_ANON_KEY: "anon-key-for-tests",
  RATE_LIMIT_SALT: SALT,
};

/** Stubs the database: records the bucket, and says "rate limited" so Gemini is never reached. */
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

const site = "https://park.example";
const post = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${site}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ question: "מה הגובה ב-Space Mountain?" }),
  });

afterEach(() => vi.unstubAllGlobals());

describe("the Netlify function", () => {
  it("is mounted under /api, on the same site as the web app", () => {
    expect(typeof fn).toBe("function");
    expect(config.path).toBe("/api/*");
  });

  it("answers /api/health and /api/tim", async () => {
    const handle = createNetlifyHandler(baseEnv);
    const health = await handle(new Request(`${site}/api/health`), { ip: "9.9.9.9" });
    expect(await health.json()).toEqual({ ok: true });

    const tim = await handle(post("/api/tim"), { ip: "9.9.9.9" });
    const noKey = await createNetlifyHandler({ ...baseEnv, GEMINI_API_KEY: undefined })(
      post("/api/tim"), { ip: "9.9.9.9" });
    expect(tim.status).not.toBe(404);
    expect((await noKey.json()).error).toBe("missing_api_key");
  });

  // ⚠️ Netlify passes the full path. A route without the prefix would mean the
  // mount is wrong, not that there is a second way in.
  it("does not answer outside /api", async () => {
    const res = await createNetlifyHandler(baseEnv)(post("/tim"), { ip: "9.9.9.9" });
    expect(res.status).toBe(404);
  });
});

/**
 * 🔴 **The rate limit is keyed on `context.ip`** — the address Netlify's edge saw,
 * not a header the caller wrote. `x-nf-client-connection-ip` is Netlify's own header,
 * and a caller can send it too.
 */
describe("the rate-limit bucket on Netlify comes from context.ip", () => {
  it("ignores spoofed x-forwarded-for and x-nf-client-connection-ip", async () => {
    const buckets = stubRateLimit();
    const handle = createNetlifyHandler(baseEnv);
    await handle(post("/api/tim", { "x-forwarded-for": "1.1.1.1" }), { ip: "9.9.9.9" });
    await handle(post("/api/tim", { "x-nf-client-connection-ip": "2.2.2.2" }), { ip: "9.9.9.9" });
    const real = await bucketKey("9.9.9.9", SALT);
    expect(buckets).toEqual([real, real]);
  });

  it("gives two clients two buckets", async () => {
    const buckets = stubRateLimit();
    const handle = createNetlifyHandler(baseEnv);
    await handle(post("/api/tim"), { ip: "9.9.9.9" });
    await handle(post("/api/tim"), { ip: "8.8.8.8" });
    expect(buckets[0]).not.toBe(buckets[1]);
  });
});
