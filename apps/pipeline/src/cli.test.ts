import { describe, expect, it } from "vitest";
import { runJob, type Job } from "./cli";

/** A job that answers from a script, one reply per call. */
const scripted = (replies: [number, object][]): Job & { secrets: string[] } => {
  const secrets: string[] = [];
  let i = 0;
  const job: Job = async (req) => {
    secrets.push(req.headers.get("x-ingest-secret") ?? "");
    const [status, body] = replies[Math.min(i++, replies.length - 1)]!;
    return new Response(JSON.stringify(body), { status });
  };
  return Object.assign(job, { secrets });
};
const quiet = { log: () => {}, sleep: async () => {} };

describe("the job runner", () => {
  it("calls until nothing remains, sending the secret each time", async () => {
    const job = scripted([[200, { remaining: 50 }], [200, { remaining: 25 }], [200, { remaining: 0 }]]);
    const r = await runJob("embed", job, { INGEST_SECRET: "s" }, quiet);
    expect(r).toEqual({ ok: true, calls: 3 });
    expect(job.secrets).toEqual(["s", "s", "s"]);
  });

  it("waits out a 429 and continues", async () => {
    const waits: number[] = [];
    const job = scripted([[200, { remaining: 9 }], [502, { error: "upstream_error", status: 429 }], [200, { remaining: 0 }]]);
    const r = await runJob("embed", job, {}, { log: () => {}, sleep: async (ms) => void waits.push(ms) });
    expect(r.ok).toBe(true);
    expect(waits).toEqual([62_000]);
  });

  it("gives up after six 429s in a row — a daily quota, not a minute", async () => {
    const job = scripted([[429, { error: "rate" }]]);
    const r = await runJob("embed", job, {}, quiet);
    expect(r).toEqual({ ok: false, calls: 6 });
  });

  // ⚠️ Any other error stops the job at once. Retrying a 403 is retrying a wrong secret.
  it("stops on any other error", async () => {
    const job = scripted([[403, { error: "forbidden" }]]);
    expect(await runJob("embed", job, {}, quiet)).toEqual({ ok: false, calls: 1 });
  });

  it("does not loop forever", async () => {
    const job = scripted([[200, { remaining: 1 }]]);
    expect(await runJob("embed", job, {}, { ...quiet, maxCalls: 5 })).toEqual({ ok: false, calls: 5 });
  });
});
