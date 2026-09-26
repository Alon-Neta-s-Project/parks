import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **What's deployed to Supabase is a built file, so it's tested like any derived file.**
 * The logic is in the server; Supabase gets an entry (src/edge/<name>.ts) and
 * the logic, merged by esbuild. A break here wouldn't show in any server test —
 * it would surface at deploy time, in production.
 */
const SRC = join(__dirname, "..");
const bundle = async (name: string) =>
  (await build({
    entryPoints: [join(SRC, "edge", `${name}.ts`)],
    bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false,
  })).outputFiles[0]!.text;

describe("החבילות ל-Supabase", () => {
  for (const name of ["tim"]) {
    it(`${name}: קובץ אחד, בלי ייבואים, ועם Deno.serve`, async () => {
      const code = await bundle(name);
      // ⚠️ A leftover import would fail in Supabase — the file there stands alone.
      expect(code.match(/^import /gm)).toBeNull();
      expect(code).toContain("Deno.serve(");
    });
  }

  it("החותם של טים בחבילה הוא החותם שבמקור", async () => {
    const src = readFileSync(join(SRC, "tim", "stamp.ts"), "utf8").match(/DEPLOY_STAMP = "([0-9a-f]{12})"/)![1];
    expect(await bundle("tim")).toContain(`DEPLOY_STAMP = "${src}"`);
  });

  // ⚠️ The server itself doesn't know Deno. The entries are the only place that does.
  it("הלוגיקה אינה נוגעת ב-Deno", () => {
    for (const name of readdirSync(join(SRC, "tim")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const code = readFileSync(join(SRC, "tim", name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, name).not.toMatch(/\bDeno\./);
    }
  });
});
