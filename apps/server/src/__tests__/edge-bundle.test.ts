import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **מה שנפרס ל-Supabase הוא קובץ שנבנה, ולכן הוא נבדק כמו כל קובץ נגזר.**
 * הלוגיקה בשרת; Supabase מקבל כניסה (src/edge/<שם>.ts) ואת הלוגיקה, מאוחדות
 * בידי esbuild. שבירה כאן לא הייתה נראית באף בדיקה של השרת — היא הייתה
 * מתגלה בפריסה, בייצור.
 */
const SRC = join(__dirname, "..");
const bundle = async (name: string) =>
  (await build({
    entryPoints: [join(SRC, "edge", `${name}.ts`)],
    bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false,
  })).outputFiles[0]!.text;

describe("החבילות ל-Supabase", () => {
  for (const name of ["tim", "embed", "aliases"]) {
    it(`${name}: קובץ אחד, בלי ייבואים, ועם Deno.serve`, async () => {
      const code = await bundle(name);
      // ⚠️ ייבוא שנשאר היה נופל ב-Supabase — הקובץ שם עומד לבדו.
      expect(code.match(/^import /gm)).toBeNull();
      expect(code).toContain("Deno.serve(");
    });
  }

  it("החותם של טים בחבילה הוא החותם שבמקור", async () => {
    const src = readFileSync(join(SRC, "tim", "index.ts"), "utf8").match(/DEPLOY_STAMP = "([0-9a-f]{12})"/)![1];
    expect(await bundle("tim")).toContain(`DEPLOY_STAMP = "${src}"`);
  });

  // ⚠️ השרת עצמו אינו מכיר את Deno. הכניסות הן המקום היחיד.
  it("הלוגיקה אינה נוגעת ב-Deno", () => {
    for (const name of ["tim", "embed", "aliases"]) {
      const code = readFileSync(join(SRC, name, "index.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, name).not.toMatch(/\bDeno\./);
    }
  });
});
