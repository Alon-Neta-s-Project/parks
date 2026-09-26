import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **מה שמודבק ל-Supabase הוא קובץ שנבנה.** embed ו-aliases עדיין נקראות שם
 * (ci-content.sh קורא ל-embed), ונפרסות ביד מ-dist/edge. שבירה כאן הייתה
 * מתגלה רק כשמישהו מדביק — ראו apps/server/src/__tests__/edge-bundle.test.ts.
 */
const SRC = __dirname;
const bundle = async (name: string) =>
  (await build({
    entryPoints: [join(SRC, "edge", `${name}.ts`)],
    bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false,
  })).outputFiles[0]!.text;

describe("החבילות של הצנרת ל-Supabase", () => {
  for (const name of ["embed", "aliases"]) {
    it(`${name}: קובץ אחד, בלי ייבואים, ועם Deno.serve`, async () => {
      const code = await bundle(name);
      expect(code.match(/^import /gm)).toBeNull();
      expect(code).toContain("Deno.serve(");
    });

    it(`${name}: הלוגיקה אינה נוגעת ב-Deno`, () => {
      const code = readFileSync(join(SRC, "enrich", `${name}.ts`), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code).not.toMatch(/\bDeno\./);
    });
  }
});
