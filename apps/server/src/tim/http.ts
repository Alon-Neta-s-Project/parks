/**
 * The allowed origins, normalized.
 *
 * 🔴 **Guy caught two ways an exact comparison fails on a value that looks right.**
 *
 * 1. **Trailing slash.** The `Origin` header a browser sends never includes
 *    one. `ALLOWED_ORIGIN=https://x/` would have blocked **every** real
 *    request — and the symptom is CORS, so it looks like a network problem,
 *    not a misconfiguration.
 * 2. **Only one origin.** The test build lives on
 *    `tim-test--<site>.netlify.app` — a **different** origin from the public
 *    site. A single value means one of the two is always blocked.
 *
 * ⚠️ **And this change widens what's allowed, so it is deliberately narrow:**
 * split on commas and compare each one exactly. **No prefix match and no
 * wildcard subdomain** — `https://x` matching `https://x.evil.com` is exactly
 * the failure this narrowness exists to prevent.
 */
export function allowedOrigins(env: Record<string, string | undefined>): string[] {
  return (env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter((o) => o !== "");
}

export function corsFor(req: Request, env: Record<string, string | undefined>) {
  const allowed = allowedOrigins(env);
  const origin = req.headers.get("origin");
  // ⚠️ Empty list = the secret isn't set, and that's still `*`. A value that
  // is only a slash, or only commas, normalizes to an empty list — i.e. it
  // **opens**, not closes. That's why `diagnose` reports how many origins
  // were counted, not just that the secret exists.
  const value = allowed.length === 0 ? "*" : origin && allowed.includes(origin) ? origin : "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // ⚠️ Without this line the browser sends a preflight request **before
    // every question**, and waits for the answer before sending the question
    // itself. It shows in the log: every POST has an OPTIONS right next to
    // it. A day of caching removes that round trip from the second question
    // onward.
    //
    // ⚠️ And what this **isn't**: a permission. The browser remembers the
    // answer, it doesn't skip the check — a policy change takes effect for an
    // existing visitor within a day.
    "Access-Control-Max-Age": "86400",
  };
  if (value) h["Access-Control-Allow-Origin"] = value;
  return h;
}

/**
 * A step that can't continue — and the response it would have given. `handle`
 * returns it as is, so the status codes and bodies are identical to the ones
 * once written inside `handle` itself.
 */
export type Fail = { fail: { status: number; body: Record<string, unknown> } };
export const failWith = (status: number, body: Record<string, unknown>): Fail => ({ fail: { status, body } });
export const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && "fail" in x;

export function jsonResponder(cors: Record<string, string>) {
  return (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });
}
