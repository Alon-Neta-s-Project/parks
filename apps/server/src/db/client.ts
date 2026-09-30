import postgres from "postgres";

/**
 * A direct connection to Postgres, for the queries that move out of the database
 * (docs/refactor-server-split.md, "Target: no logic in the database").
 *
 * ⚠️ `prepare: false` — on Netlify the connection goes through Supabase's pooler in
 * transaction mode, which does not keep prepared statements between transactions.
 * ⚠️ A small pool: a serverless invocation serves one request at a time.
 */
export function connect(url: string) {
  return postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 });
}

export type Sql = ReturnType<typeof connect>;
