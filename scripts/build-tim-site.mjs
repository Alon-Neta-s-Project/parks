/**
 * The site's build — the regular Tim, or the test version (with a note box under every answer)
 * when the site sets TIM_SITE=test.
 *
 * ⚠️ **Why a script and not netlify.toml:** netlify.toml is shared with production, and its
 * `publish` folder is fixed (apps/web/dist-tim). A context keyed on "production" would reach the
 * real production site once this branch merges. An environment variable set only on the staging
 * site does not (Alon, 01.10: staging tests the agent, with notes).
 *
 * The test build goes through the same checks as the regular one: the prompt is in sync with
 * he.json, and no ride rows end up in the bundle (scripts/verify-tim-build.ts).
 */
import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const web = join(import.meta.dirname, "..", "apps", "web");

if (process.env.TIM_SITE === "test") {
  console.log("▸ TIM_SITE=test — the test version, with a note on every answer");
  run("python3 scripts/build-tim-prompt.py --check");
  run("npm run build:tim-test");
  rmSync(join(web, "dist-tim"), { recursive: true, force: true });
  cpSync(join(web, "dist-tim-test"), join(web, "dist-tim"), { recursive: true });
  run("npx tsx scripts/verify-tim-build.ts");
} else {
  run("npm run build:tim");
}
