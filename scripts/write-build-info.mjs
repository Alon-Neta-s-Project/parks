// Writes the commit this build is made from into apps/server/src/build-info.ts.
//
//   node scripts/write-build-info.mjs [file]
//
// Netlify: COMMIT_REF · GitHub Actions (the Supabase deploy): GITHUB_SHA. With neither — a
// local build — the file is left as it is ("dev"). Runs in the build, before bundling.
//
// ⚠️ The value is written into source code, so anything but a hex hash is refused — not quoted.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "server", "src", "build-info.ts");
const sha = (process.env.COMMIT_REF || process.env.GITHUB_SHA || "").trim();

if (!sha) {
  console.log("build-info: no commit from the host — left as \"dev\"");
  process.exit(0);
}
if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
  console.error("build-info: refusing a commit value that is not a hex hash");
  process.exit(1);
}
const src = readFileSync(file, "utf8");
const out = src.replace(/export const COMMIT = "[^"]*";/, `export const COMMIT = "${sha}";`);
if (out === src && !src.includes(`"${sha}"`)) {
  console.error(`build-info: no COMMIT line found in ${file}`);
  process.exit(1);
}
writeFileSync(file, out);
console.log(`build-info: COMMIT = ${sha.slice(0, 12)}`);
