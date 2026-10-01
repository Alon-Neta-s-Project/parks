import { AGENT_SYSTEM } from "./agent-prompt";
import { composeContext } from "./context";
import type { Limit } from "./deadline";
import { generate, readAnswer, readUsage, type Content } from "./gemini";
import { isFail, type Fail } from "./http";
import type { Trace } from "./log";
import type { DirectQueries, ExperienceRow, KnowledgeChunk, ParkCandidate } from "./lookup";
import { TOOLS, argsForLog, runTool } from "./tools";
import type { Turn } from "./understand";

/**
 * Tim as an agent (O13) — Gemini decides which of the four tools to call (tools.ts), the
 * server runs them, and the results go back until Gemini answers.
 *
 * Why: the classic flow understood a question with a regex — one ride name, from the question
 * only. A follow-up whose ride is in the history, two rides in one question, a set question,
 * a recommendation: each fell through (evals: the six agent cases, 01.10).
 *
 * The guardrails, decided in O13:
 *   - **Knowledge is fetched up front**, in parallel with nothing to wait for — most questions
 *     need it, and it costs no round.
 *   - **At most two tool rounds.** Then one more call with the tools off: "answer with what
 *     you have". Running out of rounds means a shorter answer, not no answer.
 *   - **The deadline decides too** (deadline.ts): with less than `minLeftForToolsMs` left, the
 *     next call goes out with the tools off.
 *   - `rides` / `candidates` / `chunks` are counted from the tool results, so the golden set's
 *     checks keep working.
 *
 * 🔴 **The model's turn goes back exactly as it came** — Gemini 3 attaches thought signatures
 * to tool calls, and a turn sent back without them is rejected.
 */
export const AGENT = {
  maxToolRounds: 2,
  /** More calls than this in one round are answered "not run" — a model looping on itself is capped. */
  maxCallsPerRound: 4,
  /** Below this much time left, the next call goes out without tools. */
  minLeftForToolsMs: 20_000,
  /**
   * 🔴 **Set, not left to the model (01.10).** Unset, Gemini thought ~1,965 of its 2,048 output
   * tokens and the answer was cut after ~80 — mid-list, on every set question, live on staging.
   * Measured on the same question (three runs each): unset 11–13s, cut · "low" 6–7s, whole ·
   * "minimal" 4–5s, whole. "low" until the golden set says "minimal" answers as well.
   * `GEMINI_THINKING_*` in the env still wins.
   */
  thinkingLevel: "low",
};

/** One tool call, as the log line holds it (log.ts) — what was asked, never the family's words. */
export interface AgentCall {
  round: number;
  tool: string;
  args: Record<string, unknown>;
  ms: number;
  /** Rows the tool returned (rides, candidates or chunks). */
  rows: number;
  ok: boolean;
  timeout?: true;
}

export interface AgentTrace {
  /** Tool rounds run. */
  rounds: number;
  /** Calls to Gemini, including the last one. */
  model_calls: number;
  /** Why the loop ended. */
  stop: "answered" | "max_rounds" | "deadline" | "error";
  calls: AgentCall[];
  /**
   * Gemini asked for a tool after the tools were turned off, and one more call went out with no
   * tools at all (the results as text). A signal worth watching: the model ignoring `NONE`.
   */
  fallback?: true;
}

/** The last word to the model when the tools are off. */
// ⚠️ "In Hebrew" said here too: measured 01.10, an answer written after English-only tool turns
// and this line came out in English.
const ANSWER_NOW = "Answer now, in Hebrew, with the information above. Do not call any tool.";

type Usage = { input: number; output: number; thinking: number; cached_input: number };

export async function runAgent(p: {
  key: string;
  model: string;
  env: Record<string, string | undefined>;
  history: Turn[];
  question: string;
  /** The knowledge fetched up front for the question itself. */
  chunks: KnowledgeChunk[];
  direct: DirectQueries;
  limit?: Limit;
  trace?: Trace;
}): Promise<Fail | {
  data: any;
  rides: ExperienceRow[];
  candidates: ParkCandidate[];
  /** Chunks the agent searched for itself — beyond the ones fetched up front. */
  chunks: KnowledgeChunk[];
  usage: Usage | null;
}> {
  const at: AgentTrace = { rounds: 0, model_calls: 0, stop: "answered", calls: [] };
  if (p.trace) p.trace.agent = at;

  const contents: Content[] = [
    ...p.history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    // The knowledge up front, and the question — the same context the classic flow builds.
    { role: "user", parts: [{ text: composeContext({ rides: [], candidates: [], chunks: p.chunks, question: p.question }) }] },
  ];
  const found = { rides: [] as ExperienceRow[], candidates: [] as ParkCandidate[], chunks: [] as KnowledgeChunk[] };
  /** What the tools said, as text — for the fallback call, which carries no tool turns. */
  const toolTexts: string[] = [];
  let usage: Usage | null = null;
  const ctx = { direct: p.direct, key: p.key, limit: p.limit };

  for (let round = 0; ; round++) {
    const dl = p.limit?.deadline;
    const roundsLeft = round < AGENT.maxToolRounds;
    const timeLeft = !dl || dl.left() >= AGENT.minLeftForToolsMs;
    const tools = roundsLeft && timeLeft;
    if (!tools) {
      at.stop = roundsLeft ? "deadline" : "max_rounds";
      // 🔴 `mode: NONE` alone was ignored (measured 01.10, the real API): said in words too.
      const last = contents.at(-1)!;
      if (last.role === "user") last.parts.push({ text: ANSWER_NOW });
      else contents.push({ role: "user", parts: [{ text: ANSWER_NOW }] });
    }

    const res = await generate({
      key: p.key, model: p.model, env: p.env, system: AGENT_SYSTEM, contents,
      tools: TOOLS, toolMode: tools ? "AUTO" : "NONE",
      trace: p.trace, limit: p.limit,
      thinkingDefault: { thinkingLevel: AGENT.thinkingLevel },
    });
    at.model_calls++;
    if (isFail(res)) {
      at.stop = "error";
      return res;
    }
    usage = addUsage(usage, readUsage(res.data));

    const content = res.data?.candidates?.[0]?.content;
    const parts: any[] = Array.isArray(content?.parts) ? content.parts : [];
    const calls = parts.filter((part) => part?.functionCall).map((part) => part.functionCall);
    if (!calls.length) return { data: res.data, ...found, usage };
    if (!tools) {
      // ⚠️ A call made after the tools were turned off is not run. If it came with text, that is
      // the answer. If not — one more call with **no tools declared and no tool turns**: the
      // results as plain text, so there is nothing left to call. Never an empty answer for this.
      if (readAnswer(res.data).raw) return { data: res.data, ...found, usage };
      at.fallback = true;
      const plain = await generate({
        key: p.key, model: p.model, env: p.env, system: AGENT_SYSTEM,
        contents: [
          ...p.history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          {
            role: "user",
            parts: [{
              text: [
                composeContext({ rides: [], candidates: [], chunks: p.chunks, question: p.question }),
                toolTexts.length ? `Data from the tools:\n\n${toolTexts.join("\n\n")}` : null,
                ANSWER_NOW,
              ].filter(Boolean).join("\n\n---\n\n"),
            }],
          },
        ],
        trace: p.trace, limit: p.limit,
        thinkingDefault: { thinkingLevel: AGENT.thinkingLevel },
      });
      at.model_calls++;
      if (isFail(plain)) {
        at.stop = "error";
        return plain;
      }
      return { data: plain.data, ...found, usage: addUsage(usage, readUsage(plain.data)) };
    }

    at.rounds++;
    contents.push({ role: "model", parts }); // verbatim — the thought signatures with it
    const run = calls.slice(0, AGENT.maxCallsPerRound);
    const results = await Promise.all(run.map(async (call) => {
      const t0 = performance.now();
      const r = await runTool(String(call.name ?? ""), call.args ?? {}, ctx);
      at.calls.push({
        round: round + 1,
        tool: String(call.name ?? ""),
        args: argsForLog(call.args ?? {}),
        ms: Math.round(performance.now() - t0),
        rows: r.rides.length + r.candidates.length + r.chunks.length,
        ok: r.ok,
        ...(r.timedOut ? { timeout: true as const } : {}),
      });
      found.rides.push(...r.rides);
      found.candidates.push(...r.candidates);
      found.chunks.push(...r.chunks);
      toolTexts.push(`[${String(call.name ?? "")}]\n${r.text}`);
      return r;
    }));
    // Every call gets a response, or Gemini rejects the turn — the ones over the cap say so.
    contents.push({
      role: "user",
      parts: calls.map((call, i) => ({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: { result: i < results.length ? results[i]!.text : "Not run — too many calls in one round." },
        },
      })),
    });
  }
}

function addUsage(sum: Usage | null, u: ReturnType<typeof readUsage>): Usage | null {
  if (!u) return sum;
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  const s = sum ?? { input: 0, output: 0, thinking: 0, cached_input: 0 };
  return {
    input: s.input + n(u.input),
    output: s.output + n(u.output),
    thinking: s.thinking + n(u.thinking),
    cached_input: s.cached_input + n(u.cached_input),
  };
}
