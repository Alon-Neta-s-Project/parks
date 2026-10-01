import type { KnowledgeChunk } from "../tim/lookup";
import { withSignal, type Sql } from "./client";

/**
 * `match_knowledge`, run from the server — the semantic search over the knowledge chunks.
 *
 * 🔴 **A copy of the function's body, not a rewrite** — `apps/server/db/migrations/
 * 20260926000000_baseline.sql`, `public.match_knowledge`. What changed, and only this:
 * - the parameters are bound (`p_embedding` → `${p.embedding}`, and so on);
 * - the output columns are aliased (`c.id as chunk_id` …) — a function's `RETURNS TABLE`
 *   names them by position, a plain query has to say them;
 * - `last_verified::text` — PostgREST returns a date as "YYYY-MM-DD", the driver a Date;
 * - `extensions.vector` and `operator(extensions.<=>)` — the function pins
 *   `search_path` to `public, extensions`; a query takes the connection's, and the server's
 *   own role (O2) may not have `extensions` in it. Named, so it cannot drift.
 * `npm run parity:match-knowledge` runs both on the same database and fails on any difference.
 *
 * ⚠️ **`review_status = 'approved'` on both the chunk and the document.** The function is
 * `security definer` and bypasses RLS, so it filters itself — and so does the server, which
 * connects as a role that bypasses RLS too. Unapproved content must not reach Tim this way.
 *
 * ⚠️ **The cap is set here, not by the caller** (the lesson of 026): at most 20, 5 by default.
 */
export async function matchKnowledge(
  sql: Sql,
  p: { embedding: string; limit: number | null; resort: string | null },
  signal?: AbortSignal,
): Promise<KnowledgeChunk[]> {
  const rows = await withSignal(sql`
    select
      c.id as chunk_id,
      d.id as doc_id,
      d.title,
      c.content,
      c.authority_tier,
      d.volatility,
      d.last_verified::text as last_verified,
      -- <=> is cosine distance: 0 identical, 2 opposite. 1 - distance, so the number grows
      -- as the chunk gets more relevant.
      1 - (c.embedding operator(extensions.<=>) ${p.embedding}::text::extensions.vector) as similarity
    from knowledge_chunk c
    join knowledge_doc d on d.id = c.doc_id
    where c.embedding is not null
      and c.review_status = 'approved'
      and d.review_status = 'approved'
      and (${p.resort}::text is null or d.scope_resort = ${p.resort}::text)
    order by c.embedding operator(extensions.<=>) ${p.embedding}::text::extensions.vector
    limit least(coalesce(${p.limit}::int, 5), 20)
  `, signal);
  return rows as unknown as KnowledgeChunk[];
}
