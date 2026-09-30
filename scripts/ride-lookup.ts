/**
 * The ride lookup the eval runners judge against — `ride`, `height_cm`, `fits` are not in
 * Tim's response, so the runners look the ride up the way Tim does.
 *
 * ⚠️ **The same path as the Tim being asked.** With DATABASE_URL (staging: Tim runs the query in
 * the server, and the database function is dropped there) — the server's query. Without it
 * (production, local) — the database function over PostgREST.
 *
 * 🔴 **A failed lookup throws.** It used to return `[]`, and a case judged against no rows is a
 * verdict about nothing.
 */
import { connect, type Sql } from "../apps/server/src/db/client";
import { findExperiences } from "../apps/server/src/db/find-experiences";
import { extractHeight, extractRideName } from "../apps/server/src/tim/index";
import type { Row } from "../apps/server/src/eval/checks";

export function rideLookup(db: { url?: string; key?: string; databaseUrl?: string }) {
  let sql: Sql | undefined;
  return {
    source: db.databaseUrl ? "server query" : "database function",
    async lookup(question: string): Promise<Row[]> {
      const name = extractRideName(question);
      if (!name) return [];
      const args = { name, park: null, heightCm: extractHeight(question), limit: 6 };
      if (db.databaseUrl) return findExperiences((sql ??= connect(db.databaseUrl)), args);
      if (!db.url || !db.key) throw new Error("ride lookup: neither DATABASE_URL nor SUPABASE_URL + key");
      const res = await fetch(`${db.url}/rest/v1/rpc/find_experiences`, {
        method: "POST",
        headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_name: args.name, p_height_cm: args.heightCm, p_limit: args.limit }),
      });
      if (!res.ok) throw new Error(`ride lookup: find_experiences returned ${res.status}`);
      return (await res.json()) as Row[];
    },
    end: () => sql?.end(),
  };
}
