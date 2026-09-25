import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client, behind a single accessor.
 *
 * The app runs from the bundled dataset unless both env vars are set, so the
 * database is an upgrade rather than a dependency: no keys, no network, still a
 * working product. That is also what keeps the published preview independent of
 * a project that is not seeded yet.
 *
 * Only the anon key is ever read here. service_role must never reach the client
 * (brief §9.1) — it belongs in an Edge Function's server-side environment, and a
 * VITE_ prefixed variable is compiled into the public bundle by definition.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export const isConfigured = Boolean(url && anonKey);

export function supabase(): SupabaseClient | null {
  if (!isConfigured) return null;
  // A service_role key here would be a data breach rather than a bug, so it is
  // refused outright instead of quietly working.
  if (anonKey!.includes('"role":"service_role"') || decodeRole(anonKey!) === "service_role") {
    throw new Error(
      "VITE_SUPABASE_ANON_KEY holds a service_role key. That key bypasses row-level " +
        "security and must never be shipped to a browser. Use the anon key.",
    );
  }
  client ??= createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

/** Reads the role claim without verifying the signature — a guard, not auth. */
function decodeRole(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role ?? null;
  } catch {
    return null;
  }
}

/** What the app is reading from, so the UI can say so honestly. */
export const dataSource = (): "supabase" | "bundled" => (isConfigured ? "supabase" : "bundled");
