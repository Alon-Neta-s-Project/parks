import { afterEach, describe, expect, it, vi } from "vitest";
import { bucketKey } from "../tim/index";
import { clientIp, createApp, type Env } from "../app";

const KEY = "k".repeat(39);
const SALT = "test-salt";
const baseEnv: Env = {
  GEMINI_API_KEY: KEY,
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

const ask = (app: ReturnType<typeof createApp>, headers: Record<string, string> = {}) =>
  app.request("/tim", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ question: "מה הגובה ב-Space Mountain?" }),
  });

afterEach(() => vi.unstubAllGlobals());

describe("the server", () => {
  it("answers /health", async () => {
    const res = await createApp({ env: baseEnv }).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("routes /tim to Tim, with the server's env", async () => {
    const res = await ask(createApp({ env: { ...baseEnv, GEMINI_API_KEY: undefined } }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("missing_api_key");
  });

  it("lets Tim answer CORS preflight itself", async () => {
    const res = await createApp({ env: baseEnv }).request("/tim", { method: "OPTIONS" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("passes the body through intact", async () => {
    const buckets = stubRateLimit();
    const res = await ask(createApp({ env: baseEnv, remoteAddress: () => "9.9.9.9" }));
    // Reaching the rate limit at all means the question was read from the body.
    expect(res.status).toBe(429);
    expect(buckets).toHaveLength(1);
  });
});

/**
 * 🔴 **The rate limit is keyed on the client IP, and the caller must not choose it.**
 * A spoofed `x-forwarded-for` per request would be a fresh bucket per request.
 */
describe("the rate-limit bucket comes from an IP the caller cannot choose", () => {
  it("ignores a spoofed x-forwarded-for and uses the socket", async () => {
    const buckets = stubRateLimit();
    const app = createApp({ env: baseEnv, remoteAddress: () => "9.9.9.9" });
    await ask(app, { "x-forwarded-for": "1.1.1.1" });
    await ask(app, { "x-forwarded-for": "2.2.2.2" });
    const real = await bucketKey("9.9.9.9", SALT);
    expect(buckets).toEqual([real, real]);
  });

  it("uses the host's header when CLIENT_IP_HEADER names one", async () => {
    const buckets = stubRateLimit();
    const app = createApp({
      env: { ...baseEnv, CLIENT_IP_HEADER: "Fly-Client-IP" },
      remoteAddress: () => "10.0.0.1",
    });
    await ask(app, { "fly-client-ip": "5.5.5.5", "x-forwarded-for": "1.1.1.1" });
    expect(buckets).toEqual([await bucketKey("5.5.5.5", SALT)]);
  });

  it("falls back to the socket when the host header is missing", () => {
    const req = new Request("http://x/tim", { headers: { "x-forwarded-for": "1.1.1.1" } });
    expect(clientIp(req, { CLIENT_IP_HEADER: "fly-client-ip" }, "9.9.9.9")).toBe("9.9.9.9");
    expect(clientIp(req, {}, undefined)).toBe("unknown");
  });
});

/** embed and aliases keep their own gate: x-ingest-secret, checked inside the function. */
describe("the ingest routes", () => {
  for (const path of ["/internal/embed", "/internal/aliases"]) {
    it(`${path} refuses without the secret, and is not configured without one`, async () => {
      const secured = createApp({ env: { ...baseEnv, INGEST_SECRET: "s3cret" } });
      expect((await secured.request(path, { method: "POST" })).status).toBe(403);
      expect((await secured.request(path, { method: "POST", headers: { "x-ingest-secret": "wrong" } })).status).toBe(403);

      const bare = createApp({ env: baseEnv });
      const res = await bare.request(path, { method: "POST", headers: { "x-ingest-secret": "anything" } });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("not_configured");
    });

    it(`${path} is POST only`, async () => {
      const res = await createApp({ env: baseEnv }).request(path);
      expect(res.status).toBe(404);
    });
  }
});
