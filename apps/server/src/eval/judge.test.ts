import { afterEach, describe, expect, it, vi } from "vitest";
import { costLine, judge, normalize, quoteIsIn } from "./judge";

/**
 * The judge with a scripted Gemini. What is tested is the part that is ours: a "yes" counts only
 * with a quote that is really in the answer, a judge that misbehaves fails the case, and the
 * request is the strict one (temperature 0, JSON).
 */
const ANSWER = "היי! **אין הבטחה** להחזר כספי אוטומטי. ההחלטה היא של Guest Services, באופן פרטני.";
const reply = (verdicts: unknown, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify(ok
    ? { candidates: [{ content: { parts: [{ text: JSON.stringify({ verdicts }) }] }, finishReason: "STOP" }] }
    : { error: { message: "quota" } }), { status: ok ? 200 : 429 }));

afterEach(() => vi.unstubAllGlobals());

const run = (fetchImpl: ReturnType<typeof reply>, mustNotConvey: string[] = []) => {
  vi.stubGlobal("fetch", fetchImpl);
  return judge({
    key: "k", question: "מובטח לי החזר?", answer: ANSWER,
    mustConvey: ["a refund is not guaranteed", "Guest Services decides case by case"], mustNotConvey,
  });
};

describe("the judge", () => {
  it("passes when every claim is conveyed with a quote that is in the answer", async () => {
    const j = await run(reply([
      { index: 1, conveyed: true, quote: "אין הבטחה להחזר כספי אוטומטי", reason: "says it" },
      { index: 2, conveyed: true, quote: "ההחלטה היא של Guest Services, באופן פרטני", reason: "says it" },
    ]));
    expect([j.pass, j.mustConvey.map((v) => v.verified)]).toEqual([true, [true, true]]);
  });

  // 🔴 The whole point: a "yes" the judge cannot point to is a "no".
  it("fails a 'yes' whose quote is not in the answer — an invented quote", async () => {
    const j = await run(reply([
      { index: 1, conveyed: true, quote: "ההחזר לא מובטח בשום מקרה", reason: "says it" },
      { index: 2, conveyed: true, quote: "ההחלטה היא של Guest Services", reason: "says it" },
    ]));
    expect([j.pass, j.mustConvey[0]!.conveyed, j.mustConvey[0]!.verified]).toEqual([false, true, false]);
  });

  it("fails a 'yes' with no quote at all", async () => {
    const j = await run(reply([{ index: 1, conveyed: true, quote: null, reason: "" }, { index: 2, conveyed: true, quote: "Guest Services", reason: "" }]));
    expect(j.pass).toBe(false);
  });

  it("fails a case when a trap is conveyed — and only on a verified quote", async () => {
    const sprung = await run(reply([
      { index: 1, conveyed: true, quote: "אין הבטחה להחזר כספי אוטומטי", reason: "" },
      { index: 2, conveyed: true, quote: "באופן פרטני", reason: "" },
      { index: 3, conveyed: true, quote: "אין הבטחה", reason: "" },
    ]), ["a refund is guaranteed"]);
    expect(sprung.pass).toBe(false);
    const unproven = await run(reply([
      { index: 1, conveyed: true, quote: "אין הבטחה להחזר כספי אוטומטי", reason: "" },
      { index: 2, conveyed: true, quote: "באופן פרטני", reason: "" },
      { index: 3, conveyed: true, quote: "you will get your money back", reason: "" },
    ]), ["a refund is guaranteed"]);
    expect(unproven.pass).toBe(true);
  });

  // A check that cannot run is not a pass.
  it("fails closed — an error, a skipped claim, an answer that is not JSON", async () => {
    expect((await run(reply(null, false))).error).toMatch(/judge HTTP 429/);
    const skipped = await run(reply([{ index: 1, conveyed: true, quote: "אין הבטחה", reason: "" }]));
    expect([skipped.pass, skipped.error]).toEqual([false, "the judge skipped a claim"]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "yes" }] } }] }), { status: 200 })));
    expect((await judge({ key: "k", question: "q", answer: ANSWER, mustConvey: ["x"] })).error).toMatch(/not JSON/);
  });

  // 🔴 One ECONNRESET took a whole golden run down (01.10).
  it("never throws: a network failure is retried once, then fails the case", async () => {
    const down = vi.fn(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }); });
    vi.stubGlobal("fetch", down);
    const j = await judge({ key: "k", question: "q", answer: ANSWER, mustConvey: ["x"] });
    expect([j.pass, j.error, down.mock.calls.length]).toEqual([false, "judge unreachable: ECONNRESET", 2]);
  });

  it("a transient error that clears on the retry is not a failure", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (n++ === 0
      ? new Response("{}", { status: 503 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdicts: [{ index: 1, conveyed: true, quote: "אין הבטחה", reason: "" }] }) }] } }] }), { status: 200 }))));
    const j = await judge({ key: "k", question: "q", answer: ANSWER, mustConvey: ["x"] });
    expect([j.pass, n]).toEqual([true, 2]);
  });

  it("asks strictly — temperature 0, JSON out, the claims numbered", async () => {
    const f = reply([{ index: 1, conveyed: false, quote: null, reason: "" }, { index: 2, conveyed: false, quote: null, reason: "" }]);
    await run(f);
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect([body.generationConfig.temperature, body.generationConfig.responseMimeType]).toEqual([0, "application/json"]);
    expect(body.contents[0].parts[0].text).toContain("1. a refund is not guaranteed\n2. Guest Services decides case by case");
  });
});

// Cost is measured, not estimated (Alon, 01.10 — the credits ran out mid-run).
describe("cost", () => {
  it("returns the tokens the judge used — input, output, thinking", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ verdicts: [{ index: 1, conveyed: true, quote: "אין הבטחה", reason: "" }] }) }] } }],
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120, thoughtsTokenCount: 400 },
    }), { status: 200 })));
    const j = await judge({ key: "k", question: "q", answer: ANSWER, mustConvey: ["x"] });
    expect(j.usage).toEqual({ input: 900, output: 120, thinking: 400 });
  });

  it("asks for low thinking by default — the judgement is narrow — and the caller can change it", async () => {
    const f = reply([{ index: 1, conveyed: false, quote: null, reason: "" }]);
    vi.stubGlobal("fetch", f);
    await judge({ key: "k", question: "q", answer: ANSWER, mustConvey: ["x"] });
    await judge({ key: "k", question: "q", answer: ANSWER, mustConvey: ["x"], thinkingLevel: "high" });
    const sent = f.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).generationConfig.thinkingConfig);
    expect(sent).toEqual([{ thinkingLevel: "low" }, { thinkingLevel: "high" }]);
  });
});

describe("the cost line", () => {
  const used = { input: 1_000_000, output: 100_000, thinking: 400_000 };
  it("prints tokens only, without a price — no guessed number that looks measured", () => {
    expect(costLine(used, 25, {})).toBe("25 calls · 1,000,000 in · 100,000 out · 400,000 thinking (set JUDGE_PRICE_IN / JUDGE_PRICE_OUT, $ per 1M tokens, for a cost)");
  });
  it("counts thinking as output when a price is given", () => {
    // 1M × $2 + (0.1M + 0.4M) × $12 = $2 + $6
    expect(costLine(used, 25, { JUDGE_PRICE_IN: "2", JUDGE_PRICE_OUT: "12" })).toMatch(/≈ \$8\.000$/);
  });
});

describe("finding the quote", () => {
  it("ignores markdown, quote marks, dashes and spacing — not the words", () => {
    expect(normalize("**אין  הבטחה** – \"כן\"")).toBe(normalize('אין הבטחה - "כן"'));
    expect(quoteIsIn(ANSWER, "אין הבטחה להחזר")).toBe(true);
    expect(quoteIsIn(ANSWER, "יש הבטחה להחזר")).toBe(false);
    expect(quoteIsIn(ANSWER, "אי")).toBe(false); // too short to prove anything
  });
});
