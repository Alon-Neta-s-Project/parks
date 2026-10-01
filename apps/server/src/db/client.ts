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

/**
 * A query that stops when the signal fires — the request's deadline (tim/deadline.ts).
 *
 * ⚠️ `query.cancel()`, not only a rejected promise: it sends Postgres a real cancel, so the
 * query does not keep running on the server after Tim gave up on it. `statement_timeout` is not
 * used — it is a session setting, and Supabase's transaction pooler does not keep sessions.
 */
export function withSignal<T>(query: Promise<T> & { cancel(): unknown }, signal?: AbortSignal): Promise<T> {
  if (!signal) return query;
  if (signal.aborted) {
    query.cancel();
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const stop = () => {
      query.cancel();
      reject(signal.reason);
    };
    signal.addEventListener("abort", stop, { once: true });
    query.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}
