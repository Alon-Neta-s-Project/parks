import { defineConfig } from "vitest/config";

// packages/shared runs in `npm test` like every app — a test that does not run is not a test.
export default defineConfig({
  root: __dirname,
  test: {
    include: ["src/**/*.test.ts"],
  },
});
