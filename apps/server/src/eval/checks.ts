/**
 * The golden-set checks, as functions — shared by `npm run golden` and `npm run tim:compare`.
 *
 * ⚠️ **One implementation.** The comparison runner asks two Tims the same questions and
 * judges both answers; a second copy of these checks would drift from the golden runner's,
 * and the two reports would disagree about the same answer without anyone noticing.
 *
 * ⚠️ **No model-as-judge** (evals/golden.yaml): every check is deterministic — the same
 * answer always gets the same verdict.
 */

export type Expect = {
  ride?: string; rides?: number; rides_gt?: number; chunks_gt?: number;
  height_cm?: number; fits?: boolean; tiers?: string[];
  must_contain?: string[]; must_not_contain?: string[];
  /** Groups of alternatives: each group passes if **any** of its strings appears. For
   *  robustness.yaml, where the same fact has several correct wordings. Additive — the
   *  golden set's own vocabulary (approved by Paula, 07.09) is unchanged. */
  must_contain_any?: string[][];
  /** One pattern or a list. ⚠️ golden.yaml writes a single string; looping over it
   *  as a list tested each character as its own pattern. */
  must_not_match?: string | string[];
  must_ask_clarifying?: boolean; max_words?: number; should_refuse?: boolean;
};

export type Turn = { role: "user" | "model"; text: string };

export type Case = {
  id: string; kind: string; ask: string; expect: Expect;
  /** Earlier turns, sent as Tim's `history` — for follow-up questions. */
  history?: Turn[];
  status?: string; tags?: string[]; note?: string;
};

export type TimReply = {
  answer?: string; error?: string; status?: number; rides?: number; chunks?: number;
  tiers?: string[]; retrieval?: string;
  /** Wall-clock time of the call, measured by the runner. */
  ms: number;
};

// ⚠️ The function's names, not the table's: `height_cm`, not `height_requirement_cm`.
// The first version read the table name, got undefined, and failed a correct row.
export type Row = { name: string; height_cm: number | null; fits: boolean | null };

export type Verdict = { result: "pass" | "fail" | "not run"; why: string[]; ms: number };

/** Does the case need the table lookup (`find_experiences`) to be judged? */
export const needsRow = (e: Expect) => e.ride !== undefined || e.height_cm !== undefined || e.fits !== undefined;

/**
 * Judges one reply. `rows` is the table lookup for the question (empty when not needed).
 *
 * ⚠️ **A case whose answer never arrived is `not run`, not `fail` and not `pass`.**
 * Gemini returning 503 says nothing about Tim. Counting it either way would make
 * the number mean something it does not.
 */
export function evaluate(c: Case, reply: TimReply, rows: Row[]): Verdict {
  const e = c.expect ?? {};
  const why: string[] = [];

  if (e.ride !== undefined) {
    const hit = rows.find((r) => r.name === e.ride);
    if (!hit) why.push(`ride "${e.ride}" not found (got: ${rows.map((r) => r.name).join(", ") || "none"})`);
    else {
      if (e.height_cm !== undefined && hit.height_cm !== e.height_cm) why.push(`height ${hit.height_cm} ≠ ${e.height_cm}`);
      if (e.fits !== undefined && hit.fits !== e.fits) why.push(`fits ${hit.fits} ≠ ${e.fits}`);
    }
  }

  if (typeof reply.answer !== "string") {
    // The table checks above are real; the answer checks were never made.
    return { result: "not run", why: [...why, `no answer: ${reply.error ?? "?"} ${reply.status ?? ""}`.trim()], ms: reply.ms };
  }
  const a = reply.answer;
  if (e.rides !== undefined && reply.rides !== e.rides) why.push(`rides ${reply.rides} ≠ ${e.rides}`);
  if (e.rides_gt !== undefined && !((reply.rides ?? 0) > e.rides_gt)) why.push(`rides ${reply.rides} ≯ ${e.rides_gt}`);
  if (e.chunks_gt !== undefined && !((reply.chunks ?? 0) > e.chunks_gt)) why.push(`chunks ${reply.chunks} ≯ ${e.chunks_gt}`);
  for (const t of e.tiers ?? []) if (!reply.tiers?.includes(t)) why.push(`tier ${t} missing`);
  for (const s of e.must_contain ?? []) if (!a.includes(s)) why.push(`missing "${s}"`);
  for (const s of e.must_not_contain ?? []) if (a.includes(s)) why.push(`contains "${s}"`);
  for (const g of e.must_contain_any ?? []) if (!g.some((s) => a.includes(s))) why.push(`missing any of ${JSON.stringify(g)}`);
  for (const p of [e.must_not_match ?? []].flat()) if (new RegExp(p).test(a)) why.push(`matches /${p}/`);
  if (e.max_words !== undefined) {
    const n = a.trim().split(/\s+/).length;
    if (n > e.max_words) why.push(`${n} words > ${e.max_words}`);
  }
  if (e.must_ask_clarifying) {
    if (!a.trim().endsWith("?")) why.push("does not end with a question");
    if (reply.rides !== 0 || reply.chunks !== 0) why.push(`clarifying, yet rides ${reply.rides} / chunks ${reply.chunks}`);
  }
  return { result: why.length ? "fail" : "pass", why, ms: reply.ms };
}

// ── Facts in an answer ────────────────────────────────────────────────

export type Facts = { cm: number[]; usd: number[]; times: string[]; percents: number[] };

/**
 * The checkable facts in an answer — heights, prices, times, percentages — so two answers
 * worded differently can still be compared on what they claim.
 *
 * ⚠️ **Only numbers with a unit.** A bare number is not a fact here: "3 days" and
 * "intensity 3" are not heights, and comparing them would flag noise as a regression.
 */
export function extractFacts(answer: string): Facts {
  const nums = (re: RegExp) => [...answer.matchAll(re)].map((m) => Number(m[1]!.replace(/,/g, "")));
  const uniq = <T>(xs: T[]) => [...new Set(xs)].sort();
  return {
    cm: uniq(nums(/(\d{2,3})\s*(?:ס"מ|ס״מ|סמ|סנטימטר|cm)/g)),
    usd: uniq([...nums(/\$\s?(\d[\d,]*(?:\.\d+)?)/g), ...nums(/(\d[\d,]*(?:\.\d+)?)\s*(?:דולר|\$|USD)/g)]),
    times: uniq([...answer.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => m[1]!)),
    percents: uniq(nums(/(\d{1,3})\s*%/g)),
  };
}

/**
 * The facts an answer **claims** — without the ones the family gave in the question.
 *
 * ⚠️ "Which rides fit a child of 100 cm?" answered with "…fits a height of 100 cm" repeats
 * the question; it is not a fact about a ride. Counting it flagged two answers that disagreed
 * on nothing (30.09). A bare "בגובה 100" in the question counts as given too — families
 * rarely write the unit.
 */
export function answerFacts(answer: string, question: string): Facts {
  const q = extractFacts(question);
  const bare = [...question.matchAll(/(?:בגובה|גובה|גובהה|גובהו)\s*(?:של\s*)?(\d{2,3})/g)].map((m) => Number(m[1]));
  const given = new Set<number>([...q.cm, ...bare]);
  const a = extractFacts(answer);
  return { ...a, cm: a.cm.filter((x) => !given.has(x)), usd: a.usd.filter((x) => !q.usd.includes(x)) };
}

/** The facts one answer states and the other doesn't, per kind. Empty when they agree. */
export function diffFacts(a: Facts, b: Facts): string[] {
  const out: string[] = [];
  for (const k of Object.keys(a) as (keyof Facts)[]) {
    const onlyA = (a[k] as (number | string)[]).filter((x) => !(b[k] as (number | string)[]).includes(x));
    const onlyB = (b[k] as (number | string)[]).filter((x) => !(a[k] as (number | string)[]).includes(x));
    if (onlyA.length || onlyB.length) out.push(`${k}: ${JSON.stringify(onlyA)} → ${JSON.stringify(onlyB)}`);
  }
  return out;
}
