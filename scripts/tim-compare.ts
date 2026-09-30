/**
 * Asks Tim the same questions in production and on staging, and compares the answers.
 *
 *   npm run tim:compare -- --target prod      # production's answers → a snapshot
 *   npm run tim:compare -- --target staging   # staging's answers
 *   npm run tim:compare -- --report           # side by side: the latest of each
 *   options: --only <id-prefix>[,<id-prefix>…] · --set golden|robustness|all (default all) · --run <id>
 *
 * 🔴 **Run only when Alon asks (29.09).** A production run writes to production's turn log
 * (an unanswered question is stored with its text) and spends production's rate limit.
 *
 * ⚠️ **Production is asked once, not on every run.** Its code does not change until the
 * cut-over, so its answers are a snapshot; each staging run is compared against the latest.
 *
 * ⚠️ **The rate limit is 20 questions an hour per IP (60 a day).** The runner saves every
 * answer as it arrives and stops at the first 429. Running the same command again resumes
 * the same run — it skips what already has an answer.
 *
 * ⚠️ **No model-as-judge.** Verdicts come from the golden-set checks (`apps/server/src/eval/
 * checks.ts`, shared with `npm run golden`); the answers are compared on their facts — heights,
 * prices, times — never on wording, which an LLM varies from run to run.
 *
 * Env: .env.staging (TIM_SERVER_URL — the base `/tim` lives under: `https://<site>/api` on Netlify,
 *      `https://<project>.vercel.app` on Vercel — SUPABASE_URL, SUPABASE_ANON_KEY) ·
 *      .env.prod-tim (PROD_TIM_URL, PROD_SUPABASE_URL, PROD_SUPABASE_ANON_KEY).
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { answerFacts, diffFacts, evaluate, needsRow, type Case, type Row, type TimReply, type Verdict } from "../apps/server/src/eval/checks";
import { extractHeight, extractRideName } from "../apps/server/src/tim/index";
import { ROOT } from "./paths";

type Target = "prod" | "staging";
type Result = {
  id: string; set: string; ask: string; at: string;
  answer: string | null; error: string | null; status: number | null;
  rides: number | null; chunks: number | null; retrieval: string | null; tiers: string[];
  ms: number; verdict: Verdict["result"]; why: string[]; url_in_answer: boolean;
};

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const OUT = join(ROOT, "reports", "tim-compare");

// ── The questions ─────────────────────────────────────────────────────

function loadCases(which: string): (Case & { set: string })[] {
  const sets = which === "all" ? ["golden", "robustness"] : [which];
  return sets.flatMap((set) => {
    const file = join(ROOT, "evals", `${set}.yaml`);
    return (parse(readFileSync(file, "utf8")) as { cases: Case[] }).cases.map((c) => ({ ...c, set }));
  });
}

// ── Where each Tim is ─────────────────────────────────────────────────

function config(target: Target) {
  const file = join(ROOT, target === "prod" ? ".env.prod-tim" : ".env.staging");
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  process.loadEnvFile(file);
  const need = (k: string) => {
    const v = process.env[k]?.trim();
    // ⚠️ No fallback to another address: asking the wrong Tim and labelling it with this
    // target's name is the silent failure the comparison exists to catch.
    if (!v) throw new Error(`${k} is empty in ${file}`);
    return v.replace(/\/$/, "");
  };
  return target === "prod"
    ? { tim: need("PROD_TIM_URL"), db: need("PROD_SUPABASE_URL"), key: need("PROD_SUPABASE_ANON_KEY") }
    : { tim: `${need("TIM_SERVER_URL")}/tim`, db: need("SUPABASE_URL"), key: need("SUPABASE_ANON_KEY") };
}

type Cfg = ReturnType<typeof config>;

async function ask(cfg: Cfg, c: Case): Promise<TimReply> {
  const t0 = performance.now();
  try {
    // The same headers the web app sends (apps/web/src/lib/tim.ts).
    const res = await fetch(cfg.tim, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ question: c.ask, history: c.history ?? [] }),
    });
    const body = await res.json().catch(() => ({}));
    return { ...body, status: res.status, ms: Math.round(performance.now() - t0) } as TimReply;
  } catch (err) {
    return { error: `unreachable: ${err instanceof Error ? err.name : "?"}`, ms: Math.round(performance.now() - t0) };
  }
}

async function lookup(cfg: Cfg, question: string): Promise<Row[]> {
  const name = extractRideName(question);
  if (!name) return [];
  const res = await fetch(`${cfg.db}/rest/v1/rpc/find_experiences`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_name: name, p_height_cm: extractHeight(question), p_limit: 6 }),
  });
  return res.ok ? ((await res.json()) as Row[]) : [];
}

// ── A run ─────────────────────────────────────────────────────────────

const readRun = (file: string): Result[] =>
  existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

async function runTarget(target: Target) {
  const cfg = config(target);
  const runId = arg("--run") ?? new Date().toISOString().slice(0, 10);
  const dir = join(OUT, target);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${runId}.jsonl`);
  const done = new Set(readRun(file).map((r) => r.id));
  const cases = loadCases(arg("--set") ?? "all").filter((c) => (!arg("--only") || arg("--only")!.split(",").some((p) => c.id.startsWith(p.trim()))) && !done.has(c.id));

  console.log(`▸ ${target} · run ${runId} · ${done.size} already answered · ${cases.length} to ask`);
  console.log(`  started ${new Date().toISOString()} — rows this run writes to ${target}'s turn log fall after this time`);
  for (const c of cases) {
    const rows = needsRow(c.expect ?? {}) ? await lookup(cfg, c.ask) : [];
    const reply = await ask(cfg, c);
    // 🔴 Stop at the rate limit, and don't record the case — the next run asks it again.
    if (reply.status === 429) {
      console.log(`\n⏸  429 (${reply.error ?? "rate limited"}) at ${c.id}. Saved so far: ${file}`);
      console.log("   Run the same command again after the window (an hour) to continue.");
      return;
    }
    const v = evaluate(c, reply, rows);
    const r: Result = {
      id: c.id, set: c.set, ask: c.ask, at: new Date().toISOString(),
      answer: reply.answer ?? null, error: reply.error ?? null, status: reply.status ?? null,
      rides: reply.rides ?? null, chunks: reply.chunks ?? null, retrieval: reply.retrieval ?? null, tiers: reply.tiers ?? [],
      ms: reply.ms, verdict: v.result, why: v.why,
      // Rule 5 of docs/claude-code/golden-set.md: no URL in any answer, ever.
      url_in_answer: /https?:\/\//.test(reply.answer ?? ""),
    };
    appendFileSync(file, JSON.stringify(r) + "\n");
    const mark = v.result === "pass" ? "✅" : v.result === "fail" ? "❌" : "⏸️";
    console.log(`${mark} ${c.id} · ${(r.ms / 1000).toFixed(1)}s${v.why.length ? "  " + v.why.join(" · ") : ""}`);
  }
  console.log(`\n✅ ${target} run ${runId} complete → ${file}`);
}

// ── The report ────────────────────────────────────────────────────────

function latest(target: Target): { runId: string; results: Map<string, Result> } | null {
  const dir = join(OUT, target);
  if (!existsSync(dir)) return null;
  const runs = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  const pick = arg(`--${target}-run`) ? `${arg(`--${target}-run`)}.jsonl` : runs.at(-1);
  if (!pick) return null;
  return { runId: pick.replace(/\.jsonl$/, ""), results: new Map(readRun(join(dir, pick)).map((r) => [r.id, r])) };
}

function report() {
  const prod = latest("prod");
  const staging = latest("staging");
  if (!prod || !staging) throw new Error("need at least one prod run and one staging run");
  const cases = loadCases("all");
  const cell = (r?: Result) => (!r ? "—" : r.verdict === "pass" ? "✅" : r.verdict === "fail" ? "❌" : "⏸️");
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ");
  const tally = { better: 0, worse: 0, same: 0, factDiffs: 0 };
  const rows: string[] = [];
  const details: string[] = [];

  for (const c of cases) {
    const p = prod.results.get(c.id);
    const s = staging.results.get(c.id);
    // Only the questions that ran on at least one side — a row of dashes says nothing.
    if (!p && !s) continue;
    const change = !p || !s ? "" : p.verdict === s.verdict ? "" : s.verdict === "pass" ? "⬆️ better" : p.verdict === "pass" ? "🔻 worse" : "";
    if (change.includes("better")) tally.better++;
    else if (change.includes("worse")) tally.worse++;
    else if (p && s) tally.same++;
    const facts = p?.answer && s?.answer ? diffFacts(answerFacts(p.answer, c.ask), answerFacts(s.answer, c.ask)) : [];
    if (facts.length) tally.factDiffs++;
    const url = p?.url_in_answer || s?.url_in_answer ? " 🔴URL" : "";
    rows.push(`| \`${c.id}\` | ${cell(p)} | ${cell(s)} | ${change}${url} | ${facts.length ? esc(facts.join("; ")) : ""} | ${p ? (p.ms / 1000).toFixed(1) : "—"} / ${s ? (s.ms / 1000).toFixed(1) : "—"} |`);
    details.push(
      `### \`${c.id}\` ${change}\n**שאלה:** ${c.ask}\n\n` +
      `| | production | staging |\n|---|---|---|\n` +
      `| verdict | ${cell(p)} ${esc(p?.why.join(" · ") ?? "")} | ${cell(s)} ${esc(s?.why.join(" · ") ?? "")} |\n` +
      `| rides · chunks · retrieval | ${p ? `${p.rides} · ${p.chunks} · ${p.retrieval}` : "—"} | ${s ? `${s.rides} · ${s.chunks} · ${s.retrieval}` : "—"} |\n` +
      `| answer | ${esc(p?.answer ?? p?.error ?? "—")} | ${esc(s?.answer ?? s?.error ?? "—")} |\n` +
      (c.note ? `\n> ${esc(c.note)}\n` : ""),
    );
  }

  const out = join(OUT, `compare-prod-${prod.runId}-staging-${staging.runId}.md`);
  writeFileSync(out, [
    `# Tim: production vs staging`,
    ``,
    `production run \`${prod.runId}\` · staging run \`${staging.runId}\` · ${rows.length} questions`,
    ``,
    `**⬆️ better on staging: ${tally.better} · 🔻 worse: ${tally.worse} · same verdict: ${tally.same} · facts differ: ${tally.factDiffs}**`,
    ``,
    `⚠️ Verdicts are the golden-set checks, not a judgement of quality. "Facts differ" compares heights, prices, times and percentages stated in the two answers — read those rows.`,
    ``,
    `| case | prod | staging | change | facts that differ | seconds prod / staging |`,
    `|---|---|---|---|---|---|`,
    ...rows,
    ``,
    `## Answers side by side`,
    ``,
    ...details,
  ].join("\n"));
  console.log(`✅ ${out}\n   better ${tally.better} · worse ${tally.worse} · same ${tally.same} · facts differ ${tally.factDiffs}`);
}

// ── Main ──────────────────────────────────────────────────────────────

const target = arg("--target") as Target | undefined;
if (process.argv.includes("--report")) report();
else if (target === "prod" || target === "staging") await runTarget(target);
else {
  console.error("usage: npm run tim:compare -- --target prod|staging  ·  or  --report");
  process.exit(1);
}
