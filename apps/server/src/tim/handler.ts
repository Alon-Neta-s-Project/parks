import { DEFAULT_MODEL, MAX_QUESTION_CHARS, keyProblem } from "./config";
import { composeContext } from "./context";
import { diagnose, listModels } from "./diagnose";
import { askGemini, readAnswer, readUsage } from "./gemini";
import { corsFor, isFail, jsonResponder, type Fail } from "./http";
import { findCandidates, findRides, retrieveKnowledge } from "./lookup";
import { SYSTEM } from "./prompt";
import { checkRateLimit, dbAccess } from "./rate-limit";
import { scrubAnswer } from "./safety";
import { timed, type TimEvent, type Trace } from "./log";
import { logTurn, wasAnswered, type WaitUntil } from "./turn-log";
import { extractRideName, readHistory } from "./understand";

/**
 * Tim — the flow of one question, end to end.
 *
 *   checks  →  rate limit  →  retrieval (in parallel)  →  model  →  scrub  →  log  →  response
 *
 * ⚠️ **Every step here is a call to a function in its own module**, and the reasons it
 * is built the way it is live there, next to the code. A step that can't continue
 * returns a `Fail` — exactly the response that was once written here — and `handle`
 * returns it as is.
 */
/** What the host gives Tim beyond the request and the env. Every field is optional. */
export interface Host {
  waitUntil?: WaitUntil;
  /** Filled in as the request runs, for the log line (log.ts). Tim never prints. */
  trace?: Trace;
  /** For what happens after the response — the turn log's write. */
  report?: (e: TimEvent) => void;
}

export async function handle(
  req: Request,
  env: Record<string, string | undefined>,
  host: Host = {},
): Promise<Response> {
  const CORS = corsFor(req, env);
  const json = jsonResponder(CORS);
  const reply = (r: Fail) => json(r.fail.body, r.fail.status);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const key = env.GEMINI_API_KEY;
  const bad = keyProblem(key);
  if (bad) return reply(bad);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // {"diagnose": true} — before any other check, so it works even when something is broken.
  if (body.diagnose) host.trace && (host.trace.outcome = "diagnose");
  if (body.diagnose === true) return json(diagnose(env));
  if (body.diagnose === "models") {
    const m = await listModels(env);
    return isFail(m) ? reply(m) : json(m);
  }

  const question: unknown = body.question;
  if (typeof question !== "string" || question.trim() === "") {
    return json({ error: "empty_question" }, 400);
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return json({ error: "question_too_long", limit: MAX_QUESTION_CHARS }, 413);
  }
  const history = readHistory(body.history);

  // ── Rate limit — fails closed (rate-limit.ts) ─────────────────────────
  const db = dbAccess(env);
  if (isFail(db)) return reply(db);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = await timed(host.trace, "rate_limit", () => checkRateLimit(db, ip, env.RATE_LIMIT_SALT));
  if (limited) return reply(limited);

  // ⚠️ **The two sources below fail soft, on purpose, unlike the rate limit.** A limit
  // that fails must stop, because without it the endpoint is open. A knowledge source
  // that fails opens nothing — it only leaves Tim without the data, and his instructions
  // already forbid him to make it up. So a failure here is reported in the response
  // and doesn't stop it from going out.

  // ── The rides ─────────────────────────────────────────────────────────
  //
  // ⚠️ **A fact about a ride is read from the table, not from semantic search** — the
  // separation set in 003: "mixing the two is exactly the mistake the architecture is
  // meant to prevent". "What's the minimum height" needs the number from the row, not
  // the passage that sounds similar.
  //
  // ⚠️ And this is also what stops Tim from answering from his training. He "knows"
  // heights from the web, and they may be two years old. Here he gets **our** number,
  // with the date it was checked.
  const asked = extractRideName(question);

  /**
   * ⚠️ **In parallel, not in series.** The ride row is read from the database, and the
   * question is sent to Google to be turned into a vector — two operations that don't
   * depend on each other, and that waited for each other only because they were written
   * one after the other. Measured in the log: 3–4 seconds per question.
   *
   * ⚠️ And `Promise.all`, not `allSettled`, because both already fail soft inside and
   * don't throw. The choice is right only as long as that holds — error handling
   * removed from either one will break this line silently.
   */
  const [rides, candidates, { chunks, retrieval }] =
    await timed(host.trace, "retrieval", () => Promise.all([
      findRides(db, asked, question),
      findCandidates(db, asked, question),
      retrieveKnowledge(db, key!, question),
    ]));
  if (host.trace) host.trace.candidates = candidates.length;

  // ── The model call (gemini.ts) ────────────────────────────────────────
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const gemini = await timed(host.trace, "gemini", () => askGemini({
    key: key!, model, env, system: SYSTEM, history,
    userText: composeContext({ rides, candidates, chunks, question }),
    trace: host.trace,
  }));
  if (isFail(gemini)) return reply(gemini);
  const { data } = gemini;
  const { raw, finishReason, candidates: hadCandidates } = readAnswer(data);

  // 🔴 **The enforcement layer.** The instructions ask Tim not to reveal links and keys;
  // here that is checked on the actual output. `scrubbed` is non-empty only when
  // something was caught, and that is exactly the signal that matters — an attempt
  // that managed to produce something that must not go out.
  const { clean: answer, hits: scrubbed } = scrubAnswer(raw);

  if (!answer) {
    // finishReason is the explanation: MAX_TOKENS means the budget ran out before the
    // text, SAFETY means filtering. Without it, "empty" is an answer with no reason.
    return json({
      error: "empty_answer",
      model,
      finish_reason: finishReason,
      had_candidates: hadCandidates,
    }, 502);
  }

  const usage = readUsage(data);

  // ⚠️ retrieval is always returned. Without it, "Tim doesn't know" and "retrieval
  // failed" look the same on screen — and the first is an answer, the second a fault.
  // ⚠️ `tiers` is for tests, not for the UI. It says what the answer leaned on, and
  // without it "must_cite_tier" in the golden set can't be enforced.
  const tiers = [...new Set(chunks.map((c) => c.authority_tier).filter(Boolean))];

  // ── The turn log (044) ────────────────────────────────────────────
  //
  // ⚠️ **Best-effort, and never at the answer's expense.** An answer to a family matters
  // more than a record, so a failure here is swallowed: no throw, no unbounded await,
  // and no case where a database fault delays what appears on screen. A lost row is
  // missing data; a stuck answer is a broken product.
  //
  const answered = wasAnswered({ rides, chunks, candidates, answer });
  if (host.trace) host.trace.answered = answered;
  logTurn(db.url, db.dbKey, {
    question,
    answered,
    reason: answered ? null : (retrieval === "failed" ? "unverified" : "no_data"),
    model,
    usage,
  }, host);

  return json({
    answer, model, usage, retrieval,
    chunks: chunks.length, rides: rides.length, tiers,
    // 🔴 **The signal of an attempt that worked.** Almost always empty. Non-empty means
    // the model produced something that must not go out, and the filter caught it —
    // i.e. someone tried, and how far they got.
    //
    // ⚠️ **Returned, not yet stored.** Storing it needs a new value in refusal_reason,
    // and the vocabulary there is set with Guy's approval. Without it, this stays visible
    // in the response and in tests only — and is not written to the database silently.
    scrubbed,
  });
}
