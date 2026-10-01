import { afterEach, describe, expect, it } from "vitest";
import { AGENT } from "./agent";
import { handle } from "./index";
import { newTrace } from "./log";
import type { DirectQueries, ExperienceRow } from "./lookup";
import { ask, stub, FULL } from "./test-helpers";

/**
 * The loop (agent.ts), with a Gemini that follows a script: each generateContent call gets the
 * next scripted reply, and every request body is kept, so what went back to Gemini is checked.
 */
const RIDE = {
  id: "sm", name: "Space Mountain", name_he: null, park: "Magic Kingdom Park", land: "Tomorrowland", status: "open",
  status_note: null, intensity: 3, height_cm: 112, max_height_cm: null, gets_wet: "none", skip_line: "multi_pass",
  last_verified: "2026-09-01", fits: null,
} as ExperienceRow;

const text = (t: string, usage = { promptTokenCount: 100, candidatesTokenCount: 20 }) =>
  ({ candidates: [{ content: { role: "model", parts: [{ text: t }] }, finishReason: "STOP" }], usageMetadata: usage });
/** A tool call as Gemini 3 sends it — with an id and a thought signature that must come back as they are. */
const call = (name: string, args: Record<string, unknown>, id = `c-${name}`) =>
  ({ functionCall: { name, args, id }, thoughtSignature: `sig-${id}` });
const calls = (...parts: unknown[]) =>
  ({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } });

function gemini(script: unknown[]) {
  const bodies: any[] = [];
  const s = stub((url, init) => {
    if (url.includes("/rpc/check_rate_limit")) return new Response('"ok"', { status: 200 });
    if (url.includes(":embedContent")) {
      return new Response(JSON.stringify({ embedding: { values: Array.from({ length: 1536 }, () => 0.01) } }), { status: 200 });
    }
    if (url.includes("generateContent")) {
      bodies.push(JSON.parse(String(init!.body)));
      const next = script.shift();
      return next instanceof Response ? next : new Response(JSON.stringify(next ?? text("(script ran out)")), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  });
  restore = s.restore;
  return bodies;
}
let restore = () => {};
afterEach(() => restore());

const direct = (over: Partial<DirectQueries> = {}): DirectQueries => ({
  findExperiences: async () => [RIDE],
  matchKnowledge: async () => [],
  parkCandidates: async () => [],
  queryRides: async () => ({ rides: [RIDE], matched: 1, heldBack: { unrated: 0, sensitivityUnchecked: 0, heightUnknown: 0 } }),
  ...over,
});

const run = async (question: string, d: DirectQueries = direct(), extra: Record<string, unknown> = {}) => {
  const trace = newTrace();
  const res = await handle(ask({ question }), FULL, { direct: d, trace, ...extra });
  return { res, body: await res.json(), trace };
};

// Measured 01.10: with the agent's rules in English, an answer came out in English.
it("tells the model to answer in Hebrew — in the rules every call carries", async () => {
  const bodies = gemini([text("שלום")]);
  await run("hi");
  expect(bodies[0].systemInstruction.parts[0].text).toContain("Always answer the family in Hebrew");
});

describe("the loop", () => {
  it("answers in one call when no tool is needed — the tools offered, none run", async () => {
    const bodies = gemini([text("שלום!")]);
    const { body, trace } = await run("היי");
    expect([body.answer, body.rides]).toEqual(["שלום!", 0]);
    expect(bodies[0].tools[0].functionDeclarations.map((t: { name: string }) => t.name))
      .toEqual(["find_ride", "query_rides", "park_candidates", "search_knowledge"]);
    expect(bodies[0].toolConfig.functionCallingConfig.mode).toBe("AUTO");
    expect(trace.agent).toMatchObject({ rounds: 0, model_calls: 1, stop: "answered", calls: [] });
  });

  it("runs the tool Gemini asked for, and sends its turn back exactly — thought signature and all", async () => {
    const bodies = gemini([calls(call("find_ride", { name: "Space Mountain" })), text("112 ס\"מ.")]);
    const { body, trace } = await run("ויש שם מגבלת גובה?");
    expect([body.answer, body.rides]).toEqual(["112 ס\"מ.", 1]);
    const turns = bodies[1].contents;
    // 🔴 The model's turn, verbatim: Gemini 3 rejects a tool call sent back without its signature.
    expect(turns.at(-2)).toEqual({ role: "model", parts: [call("find_ride", { name: "Space Mountain" })] });
    // Its result, under the same id and name.
    const response = turns.at(-1).parts[0].functionResponse;
    expect([response.id, response.name, response.response.result.includes("112")]).toEqual(["c-find_ride", "find_ride", true]);
    expect(trace.agent).toMatchObject({ rounds: 1, model_calls: 2, stop: "answered" });
    expect(trace.agent!.calls[0]).toMatchObject({ round: 1, tool: "find_ride", rows: 1, ok: true, args: { name: "‹14 chars›" } });
  });

  it("runs two calls of one round together — two rides in one question", async () => {
    const asked: string[] = [];
    gemini([calls(call("find_ride", { name: "TRON" }, "a"), call("find_ride", { name: "Space Mountain" }, "b")), text("TRON is stronger.")]);
    const { body, trace } = await run("מה יותר מפחיד, טרון או ספייס מאונטיין?", direct({
      findExperiences: async (p) => { asked.push(p.name!); return [{ ...RIDE, name: p.name! }]; },
    }));
    expect(asked.sort()).toEqual(["Space Mountain", "TRON"]);
    expect([body.rides, trace.agent!.rounds, trace.agent!.calls.length]).toEqual([2, 1, 2]);
  });

  it("stops offering tools after two rounds — the third call answers with what it has", async () => {
    const bodies = gemini([
      calls(call("find_ride", { name: "A" }, "1")),
      calls(call("find_ride", { name: "B" }, "2")),
      text("answer"),
    ]);
    const { body, trace } = await run("q");
    expect(body.answer).toBe("answer");
    expect(bodies.map((b) => b.toolConfig.functionCallingConfig.mode)).toEqual(["AUTO", "AUTO", "NONE"]);
    expect(trace.agent).toMatchObject({ rounds: AGENT.maxToolRounds, model_calls: 3, stop: "max_rounds" });
  });

  // 🔴 Measured 01.10 against the real API: told `mode: NONE`, Gemini asked for a tool anyway,
  // and the family got an empty answer. Now: an explicit "answer now", and if it still calls —
  // one more call with **no tools at all**, the results as plain text, nothing left to call.
  it("when Gemini calls a tool after they were turned off — one call with no tools, the results as text", async () => {
    let ran = 0;
    const bodies = gemini([
      calls(call("find_ride", { name: "A" }, "1")),
      calls(call("find_ride", { name: "B" }, "2")),
      calls(call("find_ride", { name: "C" }, "3")),
      text("final answer"),
    ]);
    const { res, body, trace } = await run("q", direct({ findExperiences: async () => { ran++; return [RIDE]; } }));
    expect(ran).toBe(2); // the call made after the tools were off was not run
    expect([res.status, body.answer]).toEqual([200, "final answer"]);
    // The NONE call carried the explicit instruction.
    expect(JSON.stringify(bodies[2].contents.at(-1))).toContain("Answer now, in Hebrew");
    // The last one: no tools declared, no tool turns, the results inside the text.
    const last = bodies[3];
    expect([last.tools, last.toolConfig]).toEqual([undefined, undefined]);
    expect(JSON.stringify(last.contents)).not.toContain("functionCall");
    expect(JSON.stringify(last.contents)).toContain("112");
    expect(trace.agent).toMatchObject({ model_calls: 4, stop: "max_rounds", fallback: true });
  });

  it("answers 'not run' to calls over the per-round cap — every call gets a response", async () => {
    let ran = 0;
    const many = Array.from({ length: AGENT.maxCallsPerRound + 2 }, (_, i) => call("find_ride", { name: `R${i}` }, `id${i}`));
    const bodies = gemini([calls(...many), text("ok")]);
    await run("q", direct({ findExperiences: async () => { ran++; return [RIDE]; } }));
    expect(ran).toBe(AGENT.maxCallsPerRound);
    const responses = bodies[1].contents.at(-1).parts.map((p: any) => p.functionResponse.response.result);
    expect(responses.length).toBe(many.length);
    expect(responses.at(-1)).toBe("Not run — too many calls in one round.");
  });

  it("with little time left, answers without tools from the first call", async () => {
    const bodies = gemini([text("short answer")]);
    const { trace } = await run("q", direct(), { limits: { totalMs: AGENT.minLeftForToolsMs - 1 } });
    expect(bodies[0].toolConfig.functionCallingConfig.mode).toBe("NONE");
    expect(trace.agent!.stop).toBe("deadline");
  });

  it("returns Gemini's failure as is, mid-loop", async () => {
    gemini([calls(call("find_ride", { name: "A" })), new Response("{}", { status: 400 })]);
    const { res, body, trace } = await run("q");
    expect([res.status, body.error]).toEqual([502, "upstream_error"]);
    expect(trace.agent!.stop).toBe("error");
  });

  it("adds up the tokens of every call", async () => {
    gemini([calls(call("find_ride", { name: "A" })), text("x", { promptTokenCount: 300, candidatesTokenCount: 30 })]);
    const { body } = await run("q");
    expect([body.usage.input, body.usage.output]).toEqual([400, 40]);
  });
});

// 🔴 Measured 01.10 on staging: with no thinking setting, Gemini thought ~1,965 of its 2,048
// output tokens and the answer was cut after ~80 — mid-list, every time, on set questions.
describe("thinking", () => {
  it("asks for low thinking on every agent call by default", async () => {
    const bodies = gemini([calls(call("find_ride", { names: ["A"] })), text("x")]);
    await run("q");
    expect(bodies.map((b) => b.generationConfig.thinkingConfig)).toEqual([{ thinkingLevel: "low" }, { thinkingLevel: "low" }]);
  });

  it("an operator's setting in the env still wins", async () => {
    const bodies = gemini([text("x")]);
    const trace = newTrace();
    await handle(ask({ question: "q" }), { ...FULL, GEMINI_THINKING_LEVEL: "minimal" }, { direct: direct(), trace });
    expect(bodies[0].generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
  });
});

// A cut answer is never sent as if it were whole — it is marked, and the log line says so.
it("marks an answer Gemini cut off (MAX_TOKENS) as truncated", async () => {
  gemini([{ candidates: [{ content: { role: "model", parts: [{ text: "מתקנים קלאסיים ללא מגבל" }] }, finishReason: "MAX_TOKENS" }] }]);
  const { res, body } = await run("q");
  expect([res.status, body.answer, body.truncated]).toEqual([200, "מתקנים קלאסיים ללא מגבל", true]);
});

it("does not mark a whole answer", async () => {
  gemini([text("שלום")]);
  const { body } = await run("q");
  expect(body.truncated).toBeUndefined();
});

// 🔴 Measured 01.10 on a real question: Gemini wrote its reasoning as a plain text part, in English,
// before the Hebrew answer — not flagged as a thought — and it reached the screen.
describe("reasoning that leaks into the answer", () => {
  const reply = (...texts: string[]) =>
    ({ candidates: [{ content: { role: "model", parts: texts.map((text) => ({ text })) }, finishReason: "STOP" }] });

  it("drops an English-only part next to the Hebrew answer, and logs that it did", async () => {
    gemini([reply("Let's analyze the results: Magic Kingdom has 17, Islands of Adventure 13. Structure: …", "ב-**Magic Kingdom** יש יותר מתקנים: 17 מול 13.")]);
    const { body, trace } = await run("q");
    expect(body.answer).toBe("ב-**Magic Kingdom** יש יותר מתקנים: 17 מול 13.");
    expect(trace.agent!.dropped_parts).toBe(1);
  });

  it("keeps an answer that is only in English — dropping it would leave nothing", async () => {
    gemini([reply("Space Mountain: 112 cm.")]);
    const { body, trace } = await run("q");
    expect([body.answer, trace.agent!.dropped_parts]).toEqual(["Space Mountain: 112 cm.", undefined]);
  });

  it("keeps every Hebrew part, brand names inside them and all", async () => {
    gemini([reply("רשימה ראשונה: **Dumbo**", "ועוד: **The Barnstormer**")]);
    const { body } = await run("q");
    expect(body.answer).toBe("רשימה ראשונה: **Dumbo**\nועוד: **The Barnstormer**");
  });
});

// 🔴 Measured again 01.10: the reasoning came **in the same part** as the Hebrew answer, in all three
// runs, at every thinking level. A part-level guard cannot see it; a boundary inside the text can.
describe("reasoning inside the same part", () => {
  const one = (t: string) => ({ candidates: [{ content: { role: "model", parts: [{ text: t }] }, finishReason: "STOP" }] });

  it("keeps only what follows the marker", async () => {
    gemini([one("Let's count: Magic Kingdom has 17.\nStructure: list both.\n<<<answer>>>\nב-**Magic Kingdom** יש 17 מתקנים.")]);
    const { body, trace } = await run("q");
    expect(body.answer).toBe("ב-**Magic Kingdom** יש 17 מתקנים.");
    expect(trace.agent!.trimmed).toMatchObject({ by: "marker" });
  });

  it("without the marker, drops the opening lines that hold no Hebrew", async () => {
    gemini([one("We have:\nMagic Kingdom: 17 rides match.\n- Dumbo\n\nב-**Magic Kingdom** יש 17 מתקנים:\n* **Dumbo**")]);
    const { body, trace } = await run("q");
    expect(body.answer).toBe("ב-**Magic Kingdom** יש 17 מתקנים:\n* **Dumbo**");
    expect(trace.agent!.trimmed).toMatchObject({ by: "no-hebrew-lines" });
  });

  it("leaves a clean answer alone — English names inside it and all", async () => {
    gemini([one("ב-**Magic Kingdom** יש 17 מתקנים:\n* **Dumbo**\n* **The Barnstormer**")]);
    const { body, trace } = await run("q");
    expect([body.answer, trace.agent!.trimmed]).toEqual(["ב-**Magic Kingdom** יש 17 מתקנים:\n* **Dumbo**\n* **The Barnstormer**", undefined]);
  });

  it("a marker with nothing after it — the marker never reaches the screen, what came before stays", async () => {
    gemini([one("שלום\n<<<answer>>>\n")]);
    const { body } = await run("q");
    expect(body.answer).toBe("שלום");
  });
});

it("tells the model never to write its reasoning in the answer", async () => {
  const bodies = gemini([text("שלום")]);
  await run("hi");
  expect(bodies[0].systemInstruction.parts[0].text).toContain("never your reasoning");
  expect(bodies[0].systemInstruction.parts[0].text).toContain("<<<answer>>>");
});
