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
 * Env (from .env.server): SUPABASE_URL, SUPABASE_ANON_KEY — for the lookup only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { extractHeight, extractRideName } from "../apps/server/src/tim/index";
import { ROOT } from "./paths";

type Expect = {
  ride?: string; rides?: number; rides_gt?: number; chunks_gt?: number;
  height_cm?: number; fits?: boolean; tiers?: string[];
  must_contain?: string[]; must_not_contain?: string[]; must_not_match?: string[];
  must_ask_clarifying?: boolean; max_words?: number; should_refuse?: boolean;
};
type Case = { id: string; kind: string; ask: string; expect: Expect; status?: string };
type TimReply = {
  answer?: string; error?: string; status?: number; rides?: number; chunks?: number;
  tiers?: string[]; retrieval?: string;
};
// ⚠️ The function's names, not the table's: `height_cm`, not `height_requirement_cm`.
// The first version read the table name, got undefined, and failed a correct row.
type Row = { name: string; height_cm: number | null; fits: boolean | null };

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SERVER = arg("--server") ?? "http://localhost:8787";
const ONLY = arg("--only");

const golden = parse(readFileSync(join(ROOT, "evals", "golden.yaml"), "utf8")) as { cases: Case[] };
const cases = golden.cases.filter((c) => !ONLY || c.id.startsWith(ONLY));

async function ask(question: string): Promise<TimReply> {
  const res = await fetch(`${SERVER}/tim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return { ...(await res.json()), status: res.status } as TimReply;
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

type Verdict = { result: "pass" | "fail" | "not run"; why: string[] };

async function run(c: Case): Promise<Verdict> {
  const e = c.expect ?? {};
  const why: string[] = [];
  const needsRow = e.ride !== undefined || e.height_cm !== undefined || e.fits !== undefined;
  const rows = needsRow ? await lookup(c.ask) : [];

  if (e.ride !== undefined) {
    const hit = rows.find((r) => r.name === e.ride);
    if (!hit) why.push(`ride "${e.ride}" not found (got: ${rows.map((r) => r.name).join(", ") || "none"})`);
    else {
      if (e.height_cm !== undefined && hit.height_cm !== e.height_cm)
        why.push(`height ${hit.height_cm} ≠ ${e.height_cm}`);
      if (e.fits !== undefined && hit.fits !== e.fits) why.push(`fits ${hit.fits} ≠ ${e.fits}`);
    }
  }

  const reply = await ask(c.ask);
  if (typeof reply.answer !== "string") {
    // The table checks above are real; the answer checks were never made.
    return { result: "not run", why: [...why, `no answer: ${reply.error ?? "?"} ${reply.status ?? ""}`.trim()] };
  }
  const a = reply.answer;
  if (e.rides !== undefined && reply.rides !== e.rides) why.push(`rides ${reply.rides} ≠ ${e.rides}`);
  if (e.rides_gt !== undefined && !((reply.rides ?? 0) > e.rides_gt)) why.push(`rides ${reply.rides} ≯ ${e.rides_gt}`);
  if (e.chunks_gt !== undefined && !((reply.chunks ?? 0) > e.chunks_gt)) why.push(`chunks ${reply.chunks} ≯ ${e.chunks_gt}`);
  for (const t of e.tiers ?? []) if (!reply.tiers?.includes(t)) why.push(`tier ${t} missing`);
  for (const s of e.must_contain ?? []) if (!a.includes(s)) why.push(`missing "${s}"`);
  for (const s of e.must_not_contain ?? []) if (a.includes(s)) why.push(`contains "${s}"`);
  for (const p of e.must_not_match ?? []) if (new RegExp(p).test(a)) why.push(`matches /${p}/`);
  if (e.max_words !== undefined) {
    const n = a.trim().split(/\s+/).length;
    if (n > e.max_words) why.push(`${n} words > ${e.max_words}`);
  }
  if (e.must_ask_clarifying) {
    if (!a.trim().endsWith("?")) why.push("does not end with a question");
    if (reply.rides !== 0 || reply.chunks !== 0) why.push(`clarifying, yet rides ${reply.rides} / chunks ${reply.chunks}`);
  }
  return { result: why.length ? "fail" : "pass", why };
}

const tally = { pass: 0, fail: 0, "not run": 0 };
for (const c of cases) {
  const v = await run(c);
  tally[v.result]++;
  const mark = v.result === "pass" ? "✅" : v.result === "fail" ? "❌" : "⏸️";
  const was = c.status ? ` (file: ${c.status})` : "";
  console.log(`${mark} ${c.id}${was}${v.why.length ? "\n     " + v.why.join("\n     ") : ""}`);
}
console.log(`\n${tally.pass} pass · ${tally.fail} fail · ${tally["not run"]} not run · of ${cases.length}`);
