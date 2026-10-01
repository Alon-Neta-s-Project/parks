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

  it("does not run a tool call made after the tools were turned off", async () => {
    let ran = 0;
    gemini([
      calls(call("find_ride", { name: "A" }, "1")),
      calls(call("find_ride", { name: "B" }, "2")),
      calls(call("find_ride", { name: "C" }, "3")),
    ]);
    const { res, body } = await run("q", direct({ findExperiences: async () => { ran++; return [RIDE]; } }));
    expect(ran).toBe(2);
    // No text came back — an empty answer, with its reason, not a silent one.
    expect([res.status, body.error]).toEqual([502, "empty_answer"]);
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
