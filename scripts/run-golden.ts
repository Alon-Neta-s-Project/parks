/**
 * Runs evals/golden.yaml against a running server.
 *
 *   npx tsx scripts/run-golden.ts [--server http://localhost:8787] [--only <id-prefix>]
 *
 * 🔴 **Until 25.09 the golden set had no runner** — every `measured` date in it was
 * a hand run. This asks the server exactly as the browser does (`POST /tim`), and
 * checks what the response carries: `rides`, `chunks`, `tiers`, the answer text.
 *
 * ⚠️ **`ride`, `height_cm` and `fits` are not in Tim's response** — it returns counts,
 * not names. For those the runner does what Tim does, with Tim's own functions
 * (`extractRideName`, `extractHeight`) and the same `find_experiences` call. It is
 * not a second implementation of the lookup; it is the lookup, observed.
 *
 * ⚠️ **A case whose answer never arrived is `not run`, not `fail` and not `pass`.**
 * Gemini returning 503 says nothing about Tim. Counting it either way would make
 * the number mean something it does not.
 *
 * Env (from .env.local, or .env.staging for `golden:staging`): SUPABASE_URL, SUPABASE_ANON_KEY — for
 * the lookup only — and TIM_SERVER_URL with `--server-from-env`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { extractHeight, extractRideName } from "../apps/server/src/tim/index";
import { ROOT } from "./paths";

import { evaluate, needsRow, type Case, type Row, type TimReply, type Verdict } from "../apps/server/src/eval/checks";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
// ⚠️ `--server-from-env` never falls back to localhost. `golden:staging` looks rows up in the
// staging database; asking the local server instead would compare two different databases and
// report it as one — a silent fallback to the wrong source.
const fromEnv = process.argv.includes("--server-from-env");
if (fromEnv && !process.env.TIM_SERVER_URL) {
  console.error("🔴 TIM_SERVER_URL is empty in the env file — set the staging site's address first.");
  process.exit(1);
}
const SERVER = arg("--server") ?? (fromEnv ? process.env.TIM_SERVER_URL!.replace(/\/$/, "") : "http://localhost:8787");
const ONLY = arg("--only");

const golden = parse(readFileSync(join(ROOT, "evals", "golden.yaml"), "utf8")) as { cases: Case[] };
const cases = golden.cases.filter((c) => !ONLY || c.id.startsWith(ONLY));

async function ask(question: string): Promise<TimReply> {
  const t0 = performance.now();
  const res = await fetch(`${SERVER}/tim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const body = await res.json();
  return { ...body, status: res.status, ms: Math.round(performance.now() - t0) } as TimReply;
}

async function lookup(question: string): Promise<Row[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const name = extractRideName(question);
  if (!url || !key || !name) return [];
  const res = await fetch(`${url}/rest/v1/rpc/find_experiences`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_name: name, p_height_cm: extractHeight(question), p_limit: 6 }),
  });
  return res.ok ? ((await res.json()) as Row[]) : [];
}

async function run(c: Case): Promise<Verdict> {
  const rows = needsRow(c.expect ?? {}) ? await lookup(c.ask) : [];
  return evaluate(c, await ask(c.ask), rows);
}

const tally = { pass: 0, fail: 0, "not run": 0 };
const times: number[] = [];
for (const c of cases) {
  const v = await run(c);
  tally[v.result]++;
  times.push(v.ms);
  const mark = v.result === "pass" ? "✅" : v.result === "fail" ? "❌" : "⏸️";
  const was = c.status ? ` (file: ${c.status})` : "";
  console.log(`${mark} ${c.id}${was} · ${(v.ms / 1000).toFixed(1)}s${v.why.length ? "\n     " + v.why.join("\n     ") : ""}`);
}
console.log(`\n${tally.pass} pass · ${tally.fail} fail · ${tally["not run"]} not run · of ${cases.length}`);
// ⚠️ Every call is timed, answered or not: a slow 503 is still time the host waits.
if (times.length) {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  console.log(`time · median ${s(at(0.5))} · p95 ${s(at(0.95))} · max ${s(sorted[sorted.length - 1]!)}`);
}
