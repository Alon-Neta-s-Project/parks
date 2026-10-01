/**
 * A model as judge — for what an answer **means**, not the words it used (Alon, 01.10).
 *
 * Why: the golden set's phrase checks fail an answer that says the right thing in other words —
 * "אין הבטחה להחזר" for "לא מובטח". Most of the cases that failed on both flows on 01.10 failed
 * on wording, not on content.
 *
 * 🔴 **The judge has to quote.** For every claim it returns yes or no **and the exact sentence of
 * the answer that conveys it** — and code checks that the sentence is really in the answer. A
 * "yes" without a quote that is there is a "no". That is what stops a judge from passing an answer
 * on an impression.
 *
 * ⚠️ **What stays in code, not here:** facts that are numbers, no URL, never "0 ס\"מ", brand
 * names in English, the length cap — the product's hard rules (checks.ts). A judge might let one
 * slide; a regex does not.
 *
 * ⚠️ A different, stronger model than the one under test (`JUDGE_MODEL`, default a Pro model),
 * temperature 0, JSON out. Calibrated before it is trusted: scripts/calibrate-judge.ts.
 * 🔴 **Found by the calibration (01.10):** told "not what it implies", the judge still passed
 * "זה תלוי במצב" ("it depends") as "a refund is not guaranteed" — three runs of three, quoting
 * it. Deduction is not statement; the instructions now say so, with that example.
 */

export const DEFAULT_JUDGE_MODEL = "gemini-3.1-pro-preview";

export interface ClaimVerdict {
  claim: string;
  /** The judge's yes or no. */
  conveyed: boolean;
  /** The sentence of the answer it pointed to — verbatim, or null. */
  quote: string | null;
  /** Its reason, one line. */
  reason: string;
  /** Code's check: a "yes" whose quote is really in the answer. Only this counts. */
  verified: boolean;
}

export interface Judgement {
  pass: boolean;
  mustConvey: ClaimVerdict[];
  mustNotConvey: ClaimVerdict[];
  /** Set when the judge could not be asked or did not answer in shape — the case fails. */
  error?: string;
  /** Tokens this judgement cost — thinking is billed as output (scripts print the totals). */
  usage?: JudgeUsage;
}

export interface JudgeUsage {
  input: number;
  output: number;
  thinking: number;
}

/**
 * The judge's thinking. "low" by default: the judgement is narrow — find a sentence, decide —
 * and a Pro model's default thinking is most of what a call costs. `JUDGE_THINKING` (or the
 * caller) can change it; the calibration decides whether a setting is good enough.
 */
export const DEFAULT_JUDGE_THINKING = "low";

/**
 * The same text, give or take the formatting a model adds: markdown, quote marks, spacing.
 * Applied to both the answer and the quote before the quote is looked for.
 */
export const normalize = (s: string) =>
  s.replace(/[*_`#>]/g, "")
    .replace(/[״“”„"]/g, '"')
    .replace(/[׳‘’']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** A quote counts only if it is non-trivial and really appears in the answer. */
export function quoteIsIn(answer: string, quote: string | null | undefined): boolean {
  if (typeof quote !== "string") return false;
  const q = normalize(quote);
  return q.length >= 3 && normalize(answer).includes(q);
}

const INSTRUCTIONS = `You grade an answer that a travel assistant ("Tim") gave a family, in Hebrew, about Orlando theme parks.

You get the family's question, Tim's answer, and a numbered list of claims. For each claim, decide whether the ANSWER conveys it.

Rules:
- Judge only what the answer actually says. Not what it implies, not what a reader might infer, not what is true in the world.
- A claim is conveyed only if the answer **states it directly**. A statement from which the claim could be deduced does not count: "it depends on the situation" does not state "it is not guaranteed"; "check the official site" does not state any fact about the policy.
- Meaning, not wording: a claim stated directly counts in any words, in any language — "אין הבטחה להחזר" and "לא מובטח החזר" both state that a refund is not guaranteed.
- A claim conveyed only partly, or hedged into its opposite, is not conveyed.
- For every claim you mark as conveyed, copy the shortest exact span of the answer that conveys it — verbatim, character for character, contiguous. If you cannot point to such a span, the claim is not conveyed.
- Answer every claim, in order — one verdict per claim, numbered as given. A claim about something the answer does not mention at all is answered, with conveyed: false; it is never left out.`;

/**
 * The verdicts' shape — with exactly as many as there are claims.
 * 🔴 Found 01.10: asked about a trap the answer never mentions ("Hagrid's suits both" against an
 * answer naming only the Hippogriff), the judge sometimes returned one verdict instead of two.
 * The case failed closed — right, but on the judge, not on the answer.
 */
const schema = (n: number) => ({
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      minItems: n,
      maxItems: n,
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          conveyed: { type: "boolean" },
          quote: { type: "string", nullable: true },
          reason: { type: "string" },
        },
        required: ["index", "conveyed", "reason"],
      },
    },
  },
  required: ["verdicts"],
});

/**
 * Asks the judge about a list of claims. Never throws: a network failure or a transient error
 * (429 / 5xx) gets one retry, and then becomes an `error` — the case fails, the run goes on.
 * 🔴 Found 01.10: one ECONNRESET from Google took a whole golden run down at case 28.
 */
async function ask(p: { key: string; model: string; thinkingLevel: string; question: string; answer: string; claims: string[] }, attempt = 1): Promise<
  | { error: string; verdicts?: undefined; usage?: JudgeUsage }
  | { verdicts: { index: number; conveyed: boolean; quote?: string | null; reason?: string }[]; error?: undefined; usage?: JudgeUsage }
> {
  const retry = async (why: string) => {
    if (attempt >= 2) return { error: why };
    await new Promise((r) => setTimeout(r, 1500));
    return ask(p, attempt + 1);
  };
  const claims = p.claims.map((c, i) => `${i + 1}. ${c}`).join("\n");
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": p.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
      contents: [{
        role: "user",
        parts: [{ text: `QUESTION:\n${p.question}\n\nANSWER:\n${p.answer}\n\nCLAIMS:\n${claims}` }],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: schema(p.claims.length),
        thinkingConfig: { thinkingLevel: p.thinkingLevel },
      },
    }),
    });
  } catch (e) {
    return retry(`judge unreachable: ${e instanceof Error ? (e.cause as { code?: string } | undefined)?.code ?? e.name : "?"}`);
  }
  const body = await res.json().catch(() => null);
  const u = body?.usageMetadata;
  const usage: JudgeUsage | undefined = u
    ? { input: u.promptTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, thinking: u.thoughtsTokenCount ?? 0 }
    : undefined;
  if (res.status === 429 || res.status >= 500) return retry(`judge HTTP ${res.status}: ${String(body?.error?.message ?? "").slice(0, 200)}`);
  if (!res.ok) return { error: `judge HTTP ${res.status}: ${String(body?.error?.message ?? "").slice(0, 200)}` };
  const text = (body?.candidates?.[0]?.content?.parts ?? [])
    .map((x: { text?: string }) => x?.text ?? "").join("");
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed?.verdicts)) return { error: "judge answered without verdicts", usage };
    return { verdicts: parsed.verdicts, usage };
  } catch {
    return { error: `judge answered something that is not JSON (finish: ${body?.candidates?.[0]?.finishReason ?? "?"})`, usage };
  }
}

/**
 * Judges one answer: every `mustConvey` claim conveyed, no `mustNotConvey` claim conveyed.
 *
 * ⚠️ **Fails closed.** A judge that cannot be asked, answers out of shape, or skips a claim fails
 * the case — a check that cannot run is not a pass.
 */
export async function judge(p: {
  key: string;
  model?: string;
  question: string;
  answer: string;
  mustConvey?: string[];
  mustNotConvey?: string[];
  thinkingLevel?: string;
}): Promise<Judgement> {
  const yes = p.mustConvey ?? [];
  const no = p.mustNotConvey ?? [];
  const all = [...yes, ...no];
  if (!all.length) return { pass: true, mustConvey: [], mustNotConvey: [] };
  const fail = (error: string): Judgement => ({ pass: false, mustConvey: [], mustNotConvey: [], error });
  if (!p.answer.trim()) return fail("no answer to judge");

  const r = await ask({
    key: p.key, model: p.model ?? DEFAULT_JUDGE_MODEL, thinkingLevel: p.thinkingLevel ?? DEFAULT_JUDGE_THINKING,
    question: p.question, answer: p.answer, claims: all,
  });
  if (r.error !== undefined) return { ...fail(r.error), usage: r.usage };

  const verdicts: ClaimVerdict[] = all.map((claim, i) => {
    const v = r.verdicts!.find((x) => x.index === i + 1);
    const conveyed = v?.conveyed === true;
    const quote = typeof v?.quote === "string" && v.quote ? v.quote : null;
    return {
      claim,
      conveyed,
      quote,
      reason: v ? String(v.reason ?? "") : "the judge skipped this claim",
      verified: conveyed && quoteIsIn(p.answer, quote),
    };
  });
  if (verdicts.some((v) => v.reason === "the judge skipped this claim")) {
    // Which numbers came back — so a skipped claim is diagnosable from the output alone.
    const got = r.verdicts!.map((x) => JSON.stringify(x.index)).join(",") || "none";
    return { ...fail(`the judge skipped a claim (asked 1–${all.length}, got ${got})`), usage: r.usage };
  }

  const mustConvey = verdicts.slice(0, yes.length);
  const mustNotConvey = verdicts.slice(yes.length);
  // A trap counts as sprung only on a verified quote too — an unproven "yes" does not fail a case.
  const pass = mustConvey.every((v) => v.verified) && mustNotConvey.every((v) => !v.verified);
  return { pass, mustConvey, mustNotConvey, usage: r.usage };
}

/**
 * Tokens added up, and — only when the caller gives a price — what they cost. No price is
 * built in: it changes, and a guessed one would print a number that looks measured.
 */
export function costLine(total: JudgeUsage, calls: number, env: Record<string, string | undefined>): string {
  const tokens = `${calls} calls · ${total.input.toLocaleString()} in · ${total.output.toLocaleString()} out · ${total.thinking.toLocaleString()} thinking`;
  const pin = Number(env.JUDGE_PRICE_IN), pout = Number(env.JUDGE_PRICE_OUT);
  if (!(pin > 0) || !(pout > 0)) return `${tokens} (set JUDGE_PRICE_IN / JUDGE_PRICE_OUT, $ per 1M tokens, for a cost)`;
  // Thinking is billed as output.
  const usd = (total.input * pin + (total.output + total.thinking) * pout) / 1_000_000;
  return `${tokens} · ≈ $${usd.toFixed(3)}`;
}

export const addUsage = (a: JudgeUsage, b?: JudgeUsage): JudgeUsage =>
  b ? { input: a.input + b.input, output: a.output + b.output, thinking: a.thinking + b.thinking } : a;
