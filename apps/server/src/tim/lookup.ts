import type { Db } from "./rate-limit";
import { extractHeight, wantsRecommendation } from "./understand";
/** A ride as it comes back from find_experiences. */
export interface ExperienceRow {
  name: string;
  name_he: string | null;
  park: string;
  land: string | null;
  status: string;
  status_note: string | null;
  intensity: number | null;
  height_cm: number | null;
  /**
   * ⚠️ The opposite of `height_cm`: how tall you are allowed to be.
   *
   * `undefined` and not only `null`, on purpose — a database that has not yet
   * received migration 038 does not return the field at all, and the function
   * should keep working and say nothing, rather than print "undefined ס״מ" ("cm")
   * in an answer to a family.
   */
  max_height_cm?: number | null;
  /**
   * The four sensitivity flags. ⚠️ Three states each, and `null` is "not checked"
   * and never "no sensitivity" — that is the whole difference for the family asking.
   *
   * Optional, like the ceiling: a database without migration 039 does not return them.
   */
  /**
   * 🔴 **Text, not boolean, since migration 040 — and this was a live bug.**
   *
   * The type here was written as `boolean | null` when the columns were boolean,
   * and 040 moved them to `"true" | "false" | "na" | null`. The code reading them
   * compared against `true` — a comparison that never holds for a string — so
   * **no flagged sensitivity ever reached Tim.**
   *
   * ⚠️ And TypeScript did not catch it: the type describes what I **declare** comes
   * over the network, not what actually comes. A wrong declaration compiles silently.
   */
  sens_dark?: string | null;
  sens_heights?: string | null;
  sens_loud?: string | null;
  sens_strobe?: string | null;
  gets_wet: string | null;
  skip_line: string | null;
  last_verified: string | null;
  fits: boolean | null;
}

/**
 * Rides, as they enter the context.
 *
 * ⚠️ **The three height states are kept all the way to the screen** (CLAUDE.md):
 * a number is a limit, `0` is "checked, no limit", and NULL is "not checked". All
 * three are written in different words, because a model that receives `0` may write
 * "גובה מינימום 0 ס\"מ" ("minimum height 0 cm") — which is exactly what the rule forbids.
 */
/** A candidate row for a park. See `park_candidates` in migration 043. */
export interface ParkCandidate {
  park: string;
  name: string;
  name_he: string | null;
  land: string | null;
  category: string | null;
  intensity: number | null;
  height_cm: number | null;
  max_height_cm: number | null;
  gets_wet: string | null;
}

/** A chunk as it comes back from match_knowledge. */
export interface KnowledgeChunk {
  content: string;
  volatility: string | null;
  last_verified: string | null;
  /**
   * ⚠️ **Retrieved, not thrown away.** `match_knowledge` has returned it since 028,
   * and it was swallowed here — meaning six of the golden-set cases that require
   * `must_cite_tier: [T1]` could not be checked at all: there was nothing to look at.
   *
   * It does **not** enter the model's context. It goes out in the response so a test
   * can verify which source tier the answer leaned on — a T1 chunk is an official
   * source, and an answer that leans only on a lower tier is a finding, not a fault.
   */
  authority_tier: string | null;
}

/**
 * 🔴 **On a recommendation question Tim did not get a single ride.**
 *
 * `ridesTask` ran only when a ride name was extracted from the question, and
 * "מעדיפים פארקים עם תפאורה יפה" ("we prefer parks with beautiful scenery") contains
 * no name. So zero rows came back, and all he had to answer from was the park
 * character guides — prose. He answered in paragraphs of atmosphere without a single
 * ride by name, and that is what Paula caught.
 *
 * ⚠️ **And only when we were asked to choose.** Retrieval like this on every question
 * would inject twenty ride rows into the context of "what happens if it rains", and
 * there is a test that forbids exactly that.
 */
export async function findCandidates(
  { url, dbKey }: Db, asked: string | null, question: string, direct?: DirectQueries,
): Promise<ParkCandidate[]> {
  if (asked || !wantsRecommendation(question)) return [];
  // ⚠️ Like findRides: a direct query that fails is a soft failure — never a fallback to the RPC.
  if (direct) {
    try {
      return await direct.parkCandidates({ perPark: 3 });
    } catch {
      return [];
    }
  }
  try {
    const res = await fetch(`${url}/rest/v1/rpc/park_candidates`, {
      method: "POST",
      headers: {
        apikey: dbKey,
        Authorization: `Bearer ${dbKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_per_park: 3 }),
    });
    const rows = res.ok ? await res.json() : null;
    return Array.isArray(rows) ? rows : [];
  } catch { /* soft failure, like the rest */ }
  return [];
}

/**
 * Queries the host can run directly against the database instead of the database function.
 * Injected like `waitUntil` — `tim/` never imports a driver, so the Supabase bundle stays free
 * of one. Implemented in `apps/server/src/db/`.
 */
export interface DirectQueries {
  findExperiences(p: { name: string | null; park: string | null; heightCm: number | null; limit: number }): Promise<ExperienceRow[]>;
  /** `embedding` is the vector as a JSON array string — what the RPC's `p_embedding` gets. */
  matchKnowledge(p: { embedding: string; limit: number | null; resort: string | null }): Promise<KnowledgeChunk[]>;
  parkCandidates(p: { perPark: number | null }): Promise<ParkCandidate[]>;
}

export async function findRides(
  { url, dbKey }: Db, asked: string | null, question: string, direct?: DirectQueries,
): Promise<ExperienceRow[]> {
  if (!asked) return [];
  // ⚠️ A direct query that fails is a soft failure, like the RPC's — and never a silent
  // fallback to the RPC: two sources answering the same question would hide which one broke.
  if (direct) {
    try {
      return await direct.findExperiences({ name: asked, park: null, heightCm: extractHeight(question), limit: 6 });
    } catch {
      return [];
    }
  }
  try {
    const res = await fetch(`${url}/rest/v1/rpc/find_experiences`, {
      method: "POST",
      headers: {
        apikey: dbKey,
        Authorization: `Bearer ${dbKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_name: asked,
        p_height_cm: extractHeight(question),
        p_limit: 6,
      }),
    });
    const rows = res.ok ? await res.json() : null;
    return Array.isArray(rows) ? rows : [];
  } catch { /* soft failure, like retrieval */ }
  return [];
}

// ── Retrieval ────────────────────────────────────────────────────────
export async function retrieveKnowledge({ url, dbKey }: Db, key: string, question: string, direct?: DirectQueries): Promise<{
  chunks: KnowledgeChunk[];
  retrieval: "ok" | "empty" | "failed";
}> {
  let chunks: KnowledgeChunk[] = [];
  let retrieval: "ok" | "empty" | "failed" = "empty";
  try {
    // ⚠️ The question is embedded as RETRIEVAL_QUERY, not RETRIEVAL_DOCUMENT. The
    // two roles are not symmetric, and embedding in the wrong role **works** and
    // returns worse results with no error at all — the same trap as on the load side.
    const emb = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: question }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: 1536,
        }),
      },
    );
    const vector = emb.ok ? (await emb.json())?.embedding?.values : null;
    if (Array.isArray(vector) && vector.length === 1536 && direct) {
      // ⚠️ Like findRides: a direct query that fails is "failed" — never a fallback to the RPC.
      chunks = await direct.matchKnowledge({ embedding: JSON.stringify(vector), limit: 5, resort: null });
      retrieval = chunks.length > 0 ? "ok" : "empty";
    } else if (Array.isArray(vector) && vector.length === 1536) {
      const res = await fetch(`${url}/rest/v1/rpc/match_knowledge`, {
        method: "POST",
        headers: {
          apikey: dbKey,
          Authorization: `Bearer ${dbKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_embedding: JSON.stringify(vector), p_limit: 5 }),
      });
      const rows = res.ok ? await res.json() : null;
      chunks = Array.isArray(rows) ? rows : [];
      retrieval = res.ok ? (chunks.length > 0 ? "ok" : "empty") : "failed";
    } else {
      retrieval = "failed";
    }
  } catch {
    retrieval = "failed";
  }
  return { chunks, retrieval };
}
