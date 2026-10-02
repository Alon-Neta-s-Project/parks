/**
 * The golden set, judged two ways on the same answers — the literal checks (checks.ts, as
 * `npm run golden` runs them) and by meaning (evals/judged.yaml, a model as judge).
 *
 *   npx tsx --env-file=.env.local scripts/run-golden-judged.ts --server http://localhost:8787 --label agent-low
 *   npx tsx --env-file=.env.local scripts/run-golden-judged.ts --answers agent-low      # re-judge, no new questions
 *   options: --only <id-prefix>[,<id-prefix>…] · JUDGE_MODEL=<model> (default: judge.ts DEFAULT_JUDGE_MODEL)
 *
 * ⚠️ **Next to `run-golden.ts`, not instead of it (Alon, 01.10: "in other files, then we
 * compare").** Nothing here changes how the golden set is judged today; it shows, case by case,
 * where the two methods disagree — and why.
 *
 * Every answer is saved (reports/golden-judged/<label>.jsonl), so the judge can be re-run, or
 * changed, without asking Tim again.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { addUsage, costLine, DEFAULT_JUDGE_BACKEND, DEFAULT_JUDGE_MODEL, DEFAULT_JUDGE_THINKING, type JudgeBackend, judge, type Judgement, type JudgeUsage } from "../apps/server/src/eval/judge";
import { evaluate, needsRow, type Case, type TimReply, type Verdict } from "../apps/server/src/eval/checks";
import { rideLookup } from "./ride-lookup";
import { ROOT } from "./paths";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SERVER = arg("--server") ?? "http://localhost:8787";
const FROM = arg("--answers");
const LABEL = FROM ?? arg("--label") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const ONLY = arg("--only");
const KEY = process.env.GEMINI_API_KEY;
const JUDGE_BACKEND = (process.env.JUDGE_BACKEND?.trim() || DEFAULT_JUDGE_BACKEND) as JudgeBackend;
const JUDGE_MODEL = process.env.JUDGE_MODEL?.trim() || DEFAULT_JUDGE_MODEL[JUDGE_BACKEND];
const JUDGE_THINKING = process.env.JUDGE_THINKING?.trim() || DEFAULT_JUDGE_THINKING;
let spent: JudgeUsage = { input: 0, output: 0, thinking: 0 };
let judgeCalls = 0;
if (!KEY) {
  // Tim's server needs it to answer; the judge needs it only with JUDGE_BACKEND=gemini.
  console.error("🔴 GEMINI_API_KEY is not set");
  process.exit(1);
}

type Judged = { replaces?: string[]; must_convey?: string[]; must_not_convey?: string[] };
const cases = (parse(readFileSync(join(ROOT, "evals", "golden.yaml"), "utf8")) as { cases: Case[] }).cases
  .filter((c) => !ONLY || ONLY.split(",").some((p) => c.id.startsWith(p.trim())));
const judged = (parse(readFileSync(join(ROOT, "evals", "judged.yaml"), "utf8")) as { cases: Record<string, Judged> }).cases;

const OUT = join(ROOT, "reports", "golden-judged");
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `${LABEL}.jsonl`);

// ── The answers: asked now, or read from a saved run ─────────────────
// ⚠️ Each answer is saved as it arrives, and a run with the same label resumes: those already
// answered are judged again, not asked again. (Saved only at the end, a crash at case 28 lost 28.)
type Saved = { id: string; reply: TimReply };
const saved = new Map<string, TimReply>();
if (FROM && !existsSync(file)) {
  console.error(`🔴 ${file} does not exist`);
  process.exit(1);
}
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const s = JSON.parse(line) as Saved;
    saved.set(s.id, s.reply);
  }
}

async function ask(c: Case): Promise<TimReply> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${SERVER}/tim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: c.ask, history: c.history ?? [] }),
    });
    const body = await res.json().catch(() => ({}));
    return { ...body, status: res.status, ms: Math.round(performance.now() - t0) } as TimReply;
  } catch (err) {
    return { error: `unreachable: ${err instanceof Error ? err.name : "?"}`, ms: Math.round(performance.now() - t0) };
  }
}

const rides = rideLookup({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY, databaseUrl: process.env.DATABASE_URL?.trim() || undefined });
const without = (c: Case, keys: string[]): Case => {
  const expect = { ...(c.expect ?? {}) } as Record<string, unknown>;
  for (const k of keys) delete expect[k];
  return { ...c, expect } as Case;
};

type Row = { id: string; literal: Verdict; judged: Verdict; judgement?: Judgement };
const rows: Row[] = [];
for (const c of cases) {
  let reply = saved.get(c.id);
  if (!reply) {
    if (FROM) continue; // re-judging a saved run: a case it never asked is skipped, not asked now
    reply = await ask(c);
    appendFileSync(file, JSON.stringify({ id: c.id, reply }) + "\n");
  }
  const lookup = needsRow(c.expect ?? {}) ? await rides.lookup(c.ask) : [];
  const literal = evaluate(c, reply, lookup);

  const j = judged[c.id];
  let judgedVerdict = literal;
  let judgement: Judgement | undefined;
  if (j && literal.result !== "not run") {
    // Everything the claims do not replace still runs as code.
    const structural = evaluate(without(c, j.replaces ?? []), reply, []);
    judgement = await judge({
      key: KEY!, backend: JUDGE_BACKEND, model: JUDGE_MODEL, question: c.ask, answer: reply.answer ?? "",
      mustConvey: j.must_convey, mustNotConvey: j.must_not_convey, thinkingLevel: JUDGE_THINKING,
    });
    spent = addUsage(spent, judgement.usage);
    judgeCalls++;
    const why = [
      ...structural.why,
      ...(judgement.error ? [`judge: ${judgement.error}`] : []),
      ...judgement.mustConvey.filter((v) => !v.verified).map((v) => `not conveyed: ${v.claim}${v.conveyed ? " (the judge said yes, but its quote is not in the answer)" : ""}`),
      ...judgement.mustNotConvey.filter((v) => v.verified).map((v) => `trap: ${v.claim} — "${v.quote}"`),
    ];
    judgedVerdict = { result: why.length ? "fail" : "pass", why, ms: literal.ms };
  }
  rows.push({ id: c.id, literal, judged: judgedVerdict, judgement });
  const mark = (v: Verdict) => (v.result === "pass" ? "✅" : v.result === "fail" ? "❌" : "⏸️");
  console.log(`${mark(literal)} ${mark(judgedVerdict)}  ${c.id}${j ? "" : "  (literal only)"}`);
  for (const w of judgedVerdict.why) console.log(`        ${w}`);
}
await rides.end();

const count = (k: "literal" | "judged", r: Verdict["result"]) => rows.filter((x) => x[k].result === r).length;
const flips = (from: Verdict["result"], to: Verdict["result"]) =>
  rows.filter((x) => x.literal.result === from && x.judged.result === to).map((x) => x.id);
console.log(`\nliteral: ${count("literal", "pass")} pass · ${count("literal", "fail")} fail · ${count("literal", "not run")} not run`);
console.log(`judged:  ${count("judged", "pass")} pass · ${count("judged", "fail")} fail · ${count("judged", "not run")} not run   (judge: ${JUDGE_BACKEND}/${JUDGE_MODEL})`);
console.log(`judge cost: ${costLine(spent, judgeCalls, process.env)}`);
console.log(`fail → pass by meaning: ${flips("fail", "pass").join(", ") || "—"}`);
console.log(`pass → fail by meaning: ${flips("pass", "fail").join(", ") || "—"}`);
console.log(`answers: ${file}`);
