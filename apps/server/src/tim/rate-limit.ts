import { RETRY_AFTER_MINUTES } from "./config";
import { noteTimeout, signalFor, type Limit } from "./deadline";
import { failWith, type Fail } from "./http";
/** A stable ID for the rate-limit bucket, without storing an IP address. */
export async function bucketKey(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Db = { url: string; dbKey: string };

// ── Rate limit ───────────────────────────────────────────────────────
//
// ⚠️ Fails **closed**. If we can't count, the model isn't called.
//
// The first version skipped the limit when the env vars were missing and
// went on to the model. So a config mistake would have made the endpoint
// wide open, silently, exactly when token verification is off. A visible
// error beats an open endpoint nobody knows about — the same "no silent
// fallback" rule as in CLAUDE.md.
// ⚠️ The anon key, not service_role, on purpose. PostgREST returned 403, not
// 401 — i.e. the key was accepted, and the role it resolves to isn't
// service_role. check_rate_limit is security definer and granted to anon, so
// it works regardless of role. The table itself stays fully closed.
export function dbAccess(env: Record<string, string | undefined>): Db | Fail {
  const url = env.SUPABASE_URL;
  const dbKey = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY
    ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !dbKey) {
    return failWith(500, {
      error: "rate_limit_unavailable",
      detail: "SUPABASE_URL או מפתח גישה למסד חסרים, ולכן אי אפשר לאכוף גג קריאות",
    });
  }
  return { url, dbKey };
}

/** 'ok' → null (carry on). Anything else → the response that stops the request. */
export async function checkRateLimit({ url, dbKey }: Db, ip: string, salt: string | undefined, limit?: Limit): Promise<Fail | null> {
  const bucket = await bucketKey(ip, salt ?? dbKey.slice(0, 16));
  const auth = {
    apikey: dbKey,
    Authorization: `Bearer ${dbKey}`,
    "Content-Type": "application/json",
  };

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      signal: signalFor(limit, "rateLimitMs"),
      headers: auth,
      // ⚠️ The bucket only. Any extra value here is a cap the caller picks for herself.
      body: JSON.stringify({ p_bucket: bucket }),
    });
  } catch (e) {
    // ⚠️ A timeout here fails closed, like any failure of the limit: without it the endpoint is open.
    noteTimeout(limit, "rate_limit", e);
    return failWith(500, { error: "rate_limit_unavailable", detail: "המסד לא נענה" });
  }

  if (!res.ok) {
    return failWith(500, {
      error: "rate_limit_unavailable",
      detail: `check_rate_limit החזירה ${res.status}. אם 404 — לא הורצה מיגרציה 026 (החתימה השתנתה לארגומנט אחד).`,
    });
  }

  // Migration 021 replaced the boolean with text: 'ok' | 'user' | 'global'.
  // Anything else means we didn't understand the answer, and that's a
  // failure — not a pass.
  // ⚠️ A boolean counts as **not understood** here, on purpose: a database
  // still on 020 returns true, and true read as "allowed" is exactly a rate
  // limit that vanished without anyone noticing.
  const verdict = await res.json().catch(() => null);
  if (verdict !== "ok" && verdict !== "user" && verdict !== "global") {
    return failWith(500, {
      error: "rate_limit_unavailable",
      detail: typeof verdict === "boolean"
        ? "check_rate_limit החזירה בוליאני — לא הורצה מיגרציה 021"
        : "תשובה לא צפויה מ-check_rate_limit",
    });
  }
  // ⚠️ The two limits are not the same message. "Try again in an hour" when
  // the daily quota is used up is a lie the visitor only discovers after an
  // hour of waiting.
  if (verdict === "user") {
    return failWith(429, { error: "rate_limited", scope: "user", retry_after_minutes: RETRY_AFTER_MINUTES });
  }
  if (verdict === "global") {
    return failWith(429, { error: "rate_limited", scope: "global", retry_after_minutes: 60 * 24 });
  }
  return null;
}
