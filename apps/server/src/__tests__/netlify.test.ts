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

/**
 * 🔴 **The turn log survives the response.** Tim does not await the write, and
 * Netlify may freeze the function once the answer is out — unless the write was
 * handed to `context.waitUntil`.
 */
describe("the turn log on Netlify", () => {
  it("hands the log write to context.waitUntil", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).endsWith("/rpc/check_rate_limit")
        ? new Response(JSON.stringify("ok"), { status: 200 })
        : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "שלום" }] } }] }), { status: 200 })));
    const held: Promise<unknown>[] = [];
    const res = await createNetlifyHandler(baseEnv)(post("/api/tim"), {
      ip: "9.9.9.9",
      waitUntil: (p) => { held.push(p); },
    });
    expect(res.status).toBe(200);
    expect(held).toHaveLength(1);
  });
});

describe("the log line on Netlify", () => {
  it("carries Netlify's requestId and says it ran on Netlify", async () => {
    const out: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((s: string) => { out.push(s); });
    const res = await createNetlifyHandler(baseEnv)(
      new Request(`${site}/api/tim`, { method: "POST", body: JSON.stringify({ question: "" }) }),
      { ip: "9.9.9.9", requestId: "01NETLIFYREQUEST" },
    );
    vi.restoreAllMocks();
    const line = JSON.parse(out[0]!);
    expect([line.req, line.platform, line.outcome]).toEqual(["01NETLIFYREQUEST", "netlify", "empty_question"]);
    expect(res.headers.get("x-request-id")).toBe("01NETLIFYREQUEST");
  });
});

/**
 * 🔴 **Where the ride lookup runs on Netlify.** With DATABASE_URL, find_experiences runs in the
 * server (apps/server/src/db) and the database function is never called — staging drops it.
 * The address here refuses connections: the lookup fails soft, and still does not fall back.
 */
describe("find_experiences on Netlify", () => {
  const rpcCalls = () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).endsWith("/rpc/check_rate_limit")) return new Response(JSON.stringify("ok"), { status: 200 });
      return new Response("[]", { status: 200 });
    }));
    return () => urls.filter((u) => u.includes("/rpc/find_experiences")).length;
  };

  it("without DATABASE_URL — the database function, as before", async () => {
    const count = rpcCalls();
    await createNetlifyHandler(baseEnv)(post("/api/tim"), { ip: "9.9.9.9" });
    expect(count()).toBe(1);
  });

  it("with DATABASE_URL — the server's query, and the database function is not called", async () => {
    const count = rpcCalls();
    const env = { ...baseEnv, DATABASE_URL: "postgresql://u:p@127.0.0.1:1/none" };
    await createNetlifyHandler(env)(post("/api/tim"), { ip: "9.9.9.9" });
    expect(count()).toBe(0);
  });
});
