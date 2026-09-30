/**
 * Tim — the model's endpoint.
 *
 * ⛔ The reason this function exists at all: the Gemini key can never sit in
 * the frontend. A variable with the VITE_ prefix goes into the browser bundle
 * **by definition** — anyone who opens dev tools sees it. The key lives in
 * this function's environment variables, on the server, and never leaves
 * them. The browser talks to the function; the function talks to Gemini.
 *
 * What this function **isn't** yet: Tim. It has no retrieval and no tools, so
 * it knows nothing about the parks. That's deliberate — the first iron rule
 * is that what isn't in the knowledge base isn't answered, so the
 * instructions below forbid it from inventing a fact. Retrieval is stage 3,
 * and the full Tim is stage 4.
 *
 * ⚠️ And deliberately without any import. The function talks to the database
 * through PostgREST with plain fetch, not through the client library. The
 * reason is practical: a file with no dependencies can be fully tested and
 * run locally, and this is a file Neta pastes by hand into the browser. A
 * dependency that can't be verified in such a file is exactly what breaks on
 * her side and not on mine.
 */

/**
 * ⚠️ **This file is the interface, not the implementation.** Until 26.09 all
 * of Tim lived here — 1,516 lines. Now each part has its own file; whoever
 * imports from here doesn't need to know which.
 *   handler.ts  the flow · prompt.ts the instructions · context.ts what the model sees ·
 *   lookup.ts / understand.ts retrieval · gemini.ts the call · safety.ts the filtering
 */
export { looksLikeGeminiKey, thinkingConfig } from "./config";
export { formatCandidates, formatChunks, formatExperiences } from "./context";
export { handle, type Host } from "./handler";
export { emit, logged } from "./log";
export type { DirectQueries, ExperienceRow, KnowledgeChunk, ParkCandidate } from "./lookup";
export { todayLine } from "./prompt";
export { bucketKey } from "./rate-limit";
export { scrubAnswer } from "./safety";
export { extractHeight, extractRideName, wantsRecommendation } from "./understand";
