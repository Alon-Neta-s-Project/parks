/**
 * Parity: the database function `match_knowledge` against the server's copy of it
 * (apps/server/src/db/match-knowledge.ts), on the same database, over many inputs.
 *
 *   PARITY_DATABASE_URL=postgresql://… npx tsx scripts/parity-match-knowledge.ts
 *   npm run parity:match-knowledge            # reads DATABASE_URL from .env.staging
 *
 * 🔴 **Any difference fails** — which chunks, in which order, every field, the similarity.
 *
 * Inputs, with no call to Gemini: every stored chunk embedding used as the query, and blends
 * of neighbouring pairs (a query that is no chunk exactly) — each with every resort filter
 * (none, each resort, one that does not exist) and a limit from a cycle that includes the
 * edges (null, 0, above the cap of 20).
 * Read-only: two SELECTs per input.
 *
 * 🔴 **`--fixtures` (local only): the approval filter.** Every document and chunk is approved
 * on both databases, so the data alone cannot tell whether unapproved content is filtered —
 * a copy without `d.review_status = 'approved'` passed. In one transaction that is rolled
 * back: a document and a chunk (of another document) are set to `pending_review`, each is
 * queried by its own embedding (so it would rank first), and both sides must match and
 * **neither may return it**. Refused on any host but localhost — it writes, even if rolled back.
 *
 * ⚠️ **Only on a database that still has the function.**
 */
import { connect } from "../apps/server/src/db/client";
import { matchKnowledge } from "../apps/server/src/db/match-knowledge";

const url = process.env.PARITY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("🔴 PARITY_DATABASE_URL (or DATABASE_URL) is not set");
  process.exit(1);
}
// Before connecting: --fixtures writes (and rolls back), so only on a local database.
const host = new URL(url).hostname;
if (process.argv.includes("--fixtures") && host !== "127.0.0.1" && host !== "localhost") {
  console.error(`🔴 --fixtures writes (and rolls back) — refused on ${host}`);
  process.exit(1);
}
const sql = connect(url);

const vectors = (await sql`select embedding::text as v from knowledge_chunk where embedding is not null order by id`).map((r) => r.v as string);
const resorts = [null, ...(await sql`select distinct scope_resort from knowledge_doc where scope_resort is not null order by 1`).map((r) => r.scope_resort as string), "no-such-resort"];
const limits = [5, null, 1, 20, 50, 0];

type Input = { label: string; embedding: string; limit: number | null; resort: string | null };
const inputs: Input[] = [];
let n = 0;
const blend = (a: string, b: string) => {
  const x = JSON.parse(a) as number[];
  const y = JSON.parse(b) as number[];
  return JSON.stringify(x.map((v, i) => (v + y[i]!) / 2));
};
vectors.forEach((v, i) => {
  const queries = [v, blend(v, vectors[(i + 1) % vectors.length]!)];
  for (const [k, q] of queries.entries()) {
    for (const resort of resorts) {
      inputs.push({ label: `chunk#${i}${k ? "+next" : ""} resort=${resort}`, embedding: q, limit: limits[n++ % limits.length]!, resort });
    }
  }
});

const old = (i: Input) => sql`
  select chunk_id, doc_id, title, content, authority_tier, volatility,
         last_verified::text as last_verified, similarity
  from public.match_knowledge(${i.embedding}::text, ${i.limit}::int, ${i.resort}::text)`;

// ── Fixtures: unapproved content (local only) ──
const fixtureResults: string[] = [];
if (process.argv.includes("--fixtures")) {
  await sql.begin(async (tx) => {
    const [a, b] = await tx`
      select distinct on (c.doc_id) c.id::text as chunk, c.doc_id as doc, c.embedding::text as v
      from knowledge_chunk c where c.embedding is not null order by c.doc_id, c.id limit 2`;
    await tx`update knowledge_doc set review_status = 'pending_review' where id = ${a!.doc}`;
    await tx`update knowledge_chunk set review_status = 'pending_review' where id = ${b!.chunk}::uuid`;
    const [still] = await tx`select embedding is not null as e from knowledge_chunk where id = ${b!.chunk}::uuid`;
    if (!still?.e) throw new Error("the update cleared the embedding — the fixture would test nothing");
    for (const [what, f] of [["unapproved doc", a!], ["unapproved chunk", b!]] as const) {
      const i = { embedding: f.v, limit: 5, resort: null };
      const oldRows = await tx`select chunk_id::text as chunk_id, doc_id from public.match_knowledge(${i.embedding}::text, 5, null)`;
      const newRows = (await matchKnowledge(tx as unknown as typeof sql, i)) as unknown as { chunk_id?: unknown; doc_id?: unknown }[];
      const leaked = (rows: readonly { chunk_id?: unknown; doc_id?: unknown }[]) =>
        rows.some((r) => (what === "unapproved doc" ? r.doc_id === f.doc : String(r.chunk_id) === f.chunk));
      const same = JSON.stringify(oldRows.map((r) => r.chunk_id)) === JSON.stringify(newRows.map((r) => String(r.chunk_id)));
      fixtureResults.push(`${same && !leaked(oldRows) && !leaked(newRows) ? "✅" : "✗"} ${what}: function leaked=${leaked(oldRows)} · server leaked=${leaked(newRows)} · same=${same}`);
    }
    throw new Error("rollback");
  }).catch((e: Error) => { if (e.message !== "rollback") throw e; });
}

let same = 0;
let rows = 0;
const diffs: string[] = [];
for (const i of inputs) {
  const [a, b] = await Promise.all([old(i), matchKnowledge(sql, i)]);
  rows += a.length;
  const ja = JSON.stringify([...a]);
  const jb = JSON.stringify([...b]);
  if (ja === jb) same++;
  else diffs.push(`${i.label} limit=${i.limit}\n    function: ${a.length} rows ${a.slice(0, 3).map((r) => r.doc_id).join(" · ")}\n    server:   ${b.length} rows ${[...b].slice(0, 3).map((r) => (r as { doc_id?: string }).doc_id).join(" · ")}`);
}
await sql.end();

console.log(`${same}/${inputs.length} identical · ${rows} rows compared · ${diffs.length} differ`);
for (const d of diffs.slice(0, 15)) console.log("  ✗ " + d);
for (const f of fixtureResults) console.log("  " + f);
process.exit(diffs.length || fixtureResults.some((f) => f.startsWith("✗")) ? 1 : 0);
