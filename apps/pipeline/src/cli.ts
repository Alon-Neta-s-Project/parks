/**
 * Runs an enrichment job to completion — no HTTP server in between.
 *
 *   npm -w apps/pipeline run embed      # vectors for every chunk that has none
 *   npm -w apps/pipeline run aliases    # alias candidates for rides that have none
 *
 * ⚠️ **The database is the queue.** Each call handles one batch of whatever is
 * missing (a trigger clears a chunk's vector when its text changes), and says how
 * much remains. The job just calls again until `remaining` is 0 — it never needs
 * to know what changed.
 *
 * 🔴 **429 is Gemini's per-minute cap, not a failure.** On 25.09 the local embed
 * run hit it every ~100 vectors. Wait a minute and continue; give up after six
 * in a row, which is a daily quota rather than a minute.
 *
 * Env (from .env.server): GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, INGEST_SECRET.
 */
import { handle as aliases } from "./enrich/aliases";
import { handle as embed } from "./enrich/embed";

export type Job = (req: Request, env: Record<string, string | undefined>) => Promise<Response>;
type Reply = { remaining?: number; error?: string; status?: number; [k: string]: unknown };

export async function runJob(
  name: string,
  job: Job,
  env: Record<string, string | undefined>,
  opts: { sleep?: (ms: number) => Promise<void>; log?: (s: string) => void; maxCalls?: number } = {},
): Promise<{ ok: boolean; calls: number }> {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = opts.log ?? console.log;
  let rateLimited = 0;
  for (let calls = 1; calls <= (opts.maxCalls ?? 200); calls++) {
    const res = await job(
      new Request(`http://pipeline/${name}`, { method: "POST", headers: { "x-ingest-secret": env.INGEST_SECRET ?? "" } }),
      env,
    );
    const body = (await res.json().catch(() => ({}))) as Reply;
    if (body.status === 429 || res.status === 429) {
      if (++rateLimited >= 6) {
        log(`🔴 ${name}: 429 six times in a row — likely a daily quota. Stopping.`);
        return { ok: false, calls };
      }
      log(`⏸  ${name}: 429 (per-minute cap) — waiting 62s (${rateLimited}/6)`);
      await sleep(62_000);
      continue;
    }
    rateLimited = 0;
    if (!res.ok || body.error) {
      log(`🔴 ${name}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      return { ok: false, calls };
    }
    log(`  ${name}: ${JSON.stringify(body)}`);
    if (body.remaining === 0) {
      log(`✅ ${name}: done`);
      return { ok: true, calls };
    }
  }
  log(`🔴 ${name}: still not done after ${opts.maxCalls ?? 200} calls`);
  return { ok: false, calls: opts.maxCalls ?? 200 };
}

const JOBS: Record<string, Job> = { embed, aliases };

// Only when run as a command, not when a test imports runJob.
if (process.argv[1]?.endsWith("cli.ts")) {
  const name = process.argv[2] ?? "";
  const job = JOBS[name];
  if (!job) {
    console.error(`usage: cli.ts <${Object.keys(JOBS).join("|")}>`);
    process.exit(2);
  }
  const { ok } = await runJob(name, job, process.env);
  process.exit(ok ? 0 : 1);
}
