import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commit } from "../build-info";
import { diagnose } from "../tim/diagnose";
import { logged } from "../tim/log";

const SCRIPT = join(__dirname, "..", "..", "..", "..", "scripts", "write-build-info.mjs");
const PLACEHOLDER = 'export const COMMIT = "dev";\n';
const SHA = "9a166b5c0ffee0123456789abcdef0123456789a";

/** Runs the script on a copy of the placeholder file, with only the given env. */
function write(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "build-info-"));
  const file = join(dir, "build-info.ts");
  writeFileSync(file, PLACEHOLDER);
  try {
    execFileSync(process.execPath, [SCRIPT, file], { env: { PATH: process.env.PATH ?? "", ...env }, stdio: "pipe" });
    return { ok: true, text: readFileSync(file, "utf8") };
  } catch {
    return { ok: false, text: readFileSync(file, "utf8") };
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("scripts/write-build-info.mjs", () => {
  it("writes Netlify's COMMIT_REF into the file", () => {
    expect(write({ COMMIT_REF: SHA }).text).toContain(`"${SHA}"`);
  });

  it("writes GitHub's GITHUB_SHA (the Supabase deploy) the same way", () => {
    expect(write({ GITHUB_SHA: SHA }).text).toContain(`"${SHA}"`);
  });

  it("leaves the placeholder when no host gave a commit — a local build stays 'dev'", () => {
    const r = write({});
    expect([r.ok, r.text]).toEqual([true, PLACEHOLDER]);
  });

  // ⚠️ The value is written into source code. Anything but a hex hash is refused, not quoted.
  it("refuses a value that is not a commit hash, and leaves the file as it was", () => {
    const r = write({ COMMIT_REF: 'abc"; process.exit(1); "' });
    expect([r.ok, r.text]).toEqual([false, PLACEHOLDER]);
  });
});

describe("the commit, where it shows", () => {
  it("is 'dev' locally, and Vercel's runtime variable when there is one", () => {
    expect(commit()).toBe("dev");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    expect(commit()).toBe(SHA);
  });

  it("comes back from diagnose, next to the stamp", () => {
    expect(diagnose({}).commit).toBe("dev");
  });

  it("is on every log line", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((s: string) => { out.push(s); });
    await logged(new Request("http://x/tim", { method: "GET" }), { platform: "test", route: "/tim" }, async () => new Response("ok"));
    expect(JSON.parse(out[0]!).commit).toBe("dev");
  });
});

// 🔴 The repo's copy stays "dev". The script rewrites the file in place during a build, and a
// baked hash committed by mistake would make every local run claim to be that version
// (it nearly happened while this was being written, 30.09).
it("the committed build-info.ts holds the placeholder, not a baked hash", () => {
  const src = readFileSync(join(__dirname, "..", "build-info.ts"), "utf8");
  expect(src).toMatch(/^export const COMMIT = "dev";$/m);
});

