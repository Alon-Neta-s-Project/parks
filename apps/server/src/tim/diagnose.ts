import { failWith, type Fail } from "./http";
import { DEFAULT_MODEL } from "./config";
import { thinkingConfig } from "./config";
import { allowedOrigins } from "./http";
import { FIT_STAMP } from "./prompt";
import { DEPLOY_STAMP } from "./stamp";

export function diagnose(env: Record<string, string | undefined>) {
  const watched = [
    "GEMINI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_DB_URL",
    "ALLOWED_ORIGIN",
    "GEMINI_MODEL",
    "GEMINI_THINKING_BUDGET",
    "GEMINI_THINKING_LEVEL",
  ];
  const known: Record<string, string> = {};
  for (const name of watched) {
    const v = env[name];
    known[name] = typeof v === "string" && v !== ""
      ? `קיים · ${v.trim().length} תווים`
      : "חסר";
  }
  // Also every other injected name I don't know — names only.
  const others = Object.keys(env).filter((k) => !watched.includes(k)).sort();
  // ⚠️ What is actually sent, not what was configured. Those are two different
  // questions: a secret that never reached the function and a secret that
  // arrived and the model ignored look identical from outside, and only this
  // tells them apart.
  // 🔴 **The stamp, and this is the answer to "how will I know it happened on
  // every deploy".**
  //
  // This function is pasted by hand into Supabase. A build-time check verifies
  // the repo, not what is live — and the gap between the two is exactly the
  // risk: pasting an old file looks exactly like pasting a new one.
  //
  // ⚠️ The stamp is derived from the wording itself, so it **changes when the
  // wording changes**. Comparing what comes back from here with what the build
  // prints answers the question without guessing.
  return {
    known,
    other_names: others,
    sent_to_model: thinkingConfig(env),
    // 🔴 **"קיים · 32 תווים" ("present · 32 chars") doesn't mean it takes
    // effect.** `https://x/` is present and of valid length, and normalizes to a
    // list of one that no browser will match; `/` alone normalizes to
    // **empty**, i.e. `*` — open to all, while looking configured. This number
    // is the difference between the two, and it's checked from the live
    // environment.
    allowed_origins: allowedOrigins(env).length,
    fit_stamp: FIT_STAMP,
    // ⚠️ **This is the stamp that answers "is what's live what's in the
    // repo".** `fit_stamp` only answers "was the wording block rebuilt", and
    // on 25.09 it said "identical" about an old function.
    deploy_stamp: DEPLOY_STAMP,
  };
}

// {"diagnose":"models"} — asks Google which models are available to this key.
// Model names aren't secret, and the key doesn't come back in the response.
export async function listModels(env: Record<string, string | undefined>): Promise<Fail | { current: string; usable: string[] }> {
  const k = env.GEMINI_API_KEY;
  if (!k) return failWith(500, { error: "missing_api_key" });
  let r: Response;
  try {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": k },
    });
  } catch {
    return failWith(502, { error: "upstream_unreachable" });
  }
  if (!r.ok) return failWith(502, { error: "upstream_error", status: r.status });
  const list = await r.json().catch(() => null);
  const usable = (list?.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes("generateContent"))
    .map((m: { name: string }) => m.name.replace(/^models\//, ""));
  return { current: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL, usable };
}
