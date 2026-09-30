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
import { withFit, type ExperienceRow } from "../apps/server/src/tim/lookup";
import type { Row } from "../apps/server/src/eval/checks";

export function rideLookup(db: { url?: string; key?: string; databaseUrl?: string }) {
  let sql: Sql | undefined;
  return {
    source: db.databaseUrl ? "server query" : "database function",
    async lookup(question: string): Promise<Row[]> {
      const name = extractRideName(question);
      if (!name) return [];
      const heightCm = extractHeight(question);
      const args = { name, park: null, limit: 6 };
      // The fit is judged the way Tim says it: the shared rule (withFit), not the database's.
      if (db.databaseUrl) return withFit(await findExperiences((sql ??= connect(db.databaseUrl)), args), heightCm);
      if (!db.url || !db.key) throw new Error("ride lookup: neither DATABASE_URL nor SUPABASE_URL + key");
      const res = await fetch(`${db.url}/rest/v1/rpc/find_experiences`, {
        method: "POST",
        headers: { apikey: db.key, Authorization: `Bearer ${db.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_name: args.name, p_height_cm: heightCm, p_limit: args.limit }),
      });
      if (!res.ok) throw new Error(`ride lookup: find_experiences returned ${res.status}`);
      return withFit((await res.json()) as ExperienceRow[], heightCm);
    },
    end: () => sql?.end(),
  };
}
