import { failWith, type Fail } from "./http";
/**
 * The model name. Changeable via the GEMINI_MODEL secret without touching code —
 * Google's model list changes, and a name that was valid disappears without
 * notice. A 404 from Google on a valid path almost always means the name here no
 * longer exists.
 *
 * ⚠️ There is no "safe" default here. This name is only an educated guess; what
 * decides is what {"diagnose":"models"} returns for the actual key.
 */
export const DEFAULT_MODEL = "gemini-3.5-flash";
//
// We dropped from 3.7 to 3.5 after repeated 503s. A 503 isn't "the model
// doesn't exist" — it's "the model is busy right now", and the newest model is
// also the busiest. 3.5 is more settled. If it also returns 503 — GEMINI_MODEL
// allows dropping to gemini-2.5-flash without touching code.
//
// ⛔ And explicitly **not** `gemini-flash-latest`, even though it's more
// convenient.
//
// A rolling alias changes the model under our feet with no code change, no
// notice, and without us knowing when. This project has a golden set for
// regression tests (stage 4), and its whole value is that when an answer
// changes — we know why. With a rolling alias, the golden set breaks one day
// and nobody knows whether the cause is our change or a Google upgrade.
//
// It's the same family of "silent failure" the whole project is built against:
// a real change that looks like nothing. A pinned name breaks **loudly** — 404 —
// and that is exactly what happened here and what led us to the real list.
/** ⚠️ Eight turns, not "the whole conversation". See the comment by the history intake. */
export const MAX_HISTORY_TURNS = 8;
export const MAX_HISTORY_CHARS = 1000;
export const MAX_QUESTION_CHARS = 1000;

/**
 * ⚠️ **The caps are no longer sent to the database.** They live in the database,
 * and the one number here is used **only** for the message to the user
 * ("נסי בעוד שעה" — "try again in an hour").
 *
 * 🔴 Previously they were sent as arguments to check_rate_limit, and that
 * function is granted to anon — a public key by definition, sent to every
 * browser. So anyone who opened the dev tools could call the RPC directly with
 * p_max: 999999 and get past both caps, without touching this function at all
 * (found by Guy, migration 026).
 *
 * The general lesson: a value sent by the caller is not a limit on the caller.
 */
export const RETRY_AFTER_MINUTES = 60;

/**
 * A sanity check only, before trying to call with the value.
 *
 * ⚠️ Deliberately **without** requiring the "AIza" prefix. Google keys look like
 * that today, but it's an assumption about an external vendor's format that I
 * can't verify — and here it turned into a blocker: a valid key in a different
 * format would have been rejected by my code before Google was even asked.
 * Google is the authority on what a valid key is, not me. A wrong value comes
 * back from it as an explicit error, and that beats a local guess that blocks.
 *
 * What remains: whitespace (a paste that dragged in a blank character) and an
 * implausible length (a partial paste). Neither depends on any vendor's format.
 */
export function looksLikeGeminiKey(key: string | undefined): boolean {
  if (typeof key !== "string") return false;
  return key.trim().length >= 30 && !/\s/.test(key.trim());
}


/**
 * Diagnostics. Returns which environment variables exist — **names, presence and
 * length only, never values.**
 *
 * Why this is permanent and not temporary: I'm network-blocked from Supabase and
 * can't see which variables it injects into the function. Without this, every
 * permissions failure turns into a round of guessing in which Neta pastes code and
 * reports back, again and again. A name and a length aren't secret — the value is.
 */
/**
 * The thinking settings, in one place.
 *
 * ⚠️ Derived once and used by both the model call and diagnostics. When there
 * were two computations, diagnostics could report something that isn't being
 * sent — i.e. a control panel showing a switch in a state that isn't the real one.
 *
 * Two names, because model generations disagree with each other:
 *   GEMINI_THINKING_BUDGET — a token count (2.5)
 *   GEMINI_THINKING_LEVEL  — "low" / "high" (3.x)
 * 3.5 accepted budget=128 **with no error and no effect** — 505 thinking tokens
 * before, 507 after. A field that is silently ignored is exactly the kind of
 * failure we avoid, so diagnostics show what is actually sent.
 */
export function thinkingConfig(env: Record<string, string | undefined>) {
  const raw = env.GEMINI_THINKING_BUDGET?.trim();
  const budget = Number(raw);
  const level = env.GEMINI_THINKING_LEVEL?.trim();
  const cfg: Record<string, unknown> = {};
  if (raw && Number.isFinite(budget)) cfg.thinkingBudget = budget;
  if (level) cfg.thinkingLevel = level;
  return Object.keys(cfg).length ? { thinkingConfig: cfg } : {};
}

// Two completely different failures, so two different messages. "Not set or
// doesn't start with AIza" sent Neta to check both possibilities without knowing
// which one she was in. No part of the key is returned — only its length, which
// is enough to spot a partial paste.
export function keyProblem(key: string | undefined): Fail | null {
  if (key === undefined || key.trim() === "") {
    return failWith(500, {
      error: "missing_api_key",
      detail: "הסוד GEMINI_API_KEY אינו קיים. לבדוק את השם המדויק ב-Edge Functions ← Secrets, ואז Deploy מחדש — סוד חדש נכנס לפונקציה רק בפריסה הבאה.",
    });
  }
  if (!looksLikeGeminiKey(key)) {
    return failWith(500, {
      error: "malformed_api_key",
      detail: `הסוד קיים, אבל הערך קצר מדי או מכיל רווח. אורך שהתקבל: ${key.trim().length} (מפתח תקין הוא כ-39 תווים). סביר שההדבקה הייתה חלקית.`,
    });
  }
  return null;
}
