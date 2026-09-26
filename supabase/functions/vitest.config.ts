import { defineConfig } from "vitest/config";

/**
 * The Edge Functions' tests, on Node — no Deno needed to develop or test.
 *
 * ⚠️ The functions themselves still deploy to Supabase (Deno) until the cut-over
 * (docs/refactor-server-split.md, stage 4). They use only web standards, which is
 * why the same file runs under both, and why these tests exercise the deployed code.
 */
export default defineConfig({
  root: __dirname,
  test: { include: ["*/index.test.ts"] },
});
