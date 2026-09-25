# Refactor: independent server, split web / server

_Opened 25.09.2026 · maintained by Claude Code · open items for the refactor live **here**, not in GitHub Issues (Alon's decision, 25.09)._

## Why
The backend is currently split between three Supabase Edge Functions (Deno) and about 24 Postgres functions. The browser reads the `experience` table directly, and business logic (`recommend`, `intent`, `acknowledge`) runs in the browser against a bundled JSON file. The team is about to build a much larger backend. So the logic moves to an **independent server that is the only way into the data**.

**Decisions:** Node + TypeScript + Hono · migrations with dbmate · all stages, rolled out in phases so each ships on its own.

## Target layout
```
apps/web/        frontend (today's src/, html files, vite, public/)
apps/server/     server: src/, content/ (knowledge, source), db/ (migrations, seed)
packages/shared/ code both sides use: schema, from-db, sensitivity, group, profile...
scripts/         repo tooling
```

## Stages
| # | Stage | Status |
|---|---|---|
| 0 | Decisions: hosting, security review, the gap in the Tim file (see open items) | Open |
| 1 | npm workspaces and moving folders into the layout above, with no behavior change | ✅ Done 25.09 (workspaces and `packages/shared` deferred to 3) |
| 2 | Migrations with dbmate, run from CI with an approval gate | Not started |
| 3 | Port Tim, `embed` and `aliases` to the Node server, running alongside the Edge Function | 3a ✅ workspaces · 3b ✅ server + Tim · 3c ✅ embed + aliases · 3d ✅ Docker (local) · deployment waits on O1 |
| 4 | Point the frontend at the server, retire the Edge Functions, revoke the anon grants | Not started |
| 5 | Shared logic in `packages/shared`, a browse API, close direct table reads | Not started |

## Rule: tests after every step
After every step (a separate commit): `npm run qa`, plus `npm run build` if the build is touched. Compare the test count with the previous step. **A drop in the count is a failure**, even if everything is green. Nothing moves on until it's green.

### Baseline, 25.09.2026 (commit `307c648`, before any change)
| Check | Result |
|---|---|
| Pre-test gate steps | All pass |
| vitest | 282 passed · 1 skipped · **1 failed** (`deploy-stamp.test.ts`, see O3) |
| deno (Tim) | 72 passed |
| `build:tim` | Passes, 0 attraction rows in the bundle |
| `build` | Passes, 253 pages |

### Starting point for Stage 1, 25.09.2026 (after merging `tim-test`) · all green
| Check | Result |
|---|---|
| `npm run qa` | Passes (exit 0) |
| vitest | **287 passed · 1 skipped** (35 files) |
| deno (Tim) | **75 passed** |
| `build:tim` | Passes, 0 attraction rows in the bundle |
| `build` | Passes, 253 pages |

These are the numbers every step in Stage 1 is compared against.

---

## Stage log

### 1a ✅ The paths module (25.09.2026)
- **The only place that says where things live: [scripts/paths.json](../scripts/paths.json).** Thin loaders read it: `paths.py` (Python), `paths.ts` (TypeScript) and `python3 scripts/paths.py KEY` (bash). One list, not three.
- **Moved to reading from it:** 12 Python scripts, 4 TypeScript scripts, 2 shell scripts (`ci-content.sh`, `verify-probes.sh`) and 20 tests. `process.cwd()` and the three-`..` `__dirname` roots are gone.
- **Deliberately not changed:** text written into generated files (e.g. `נוצר מ-knowledge/...` in the seeds), static JSON imports (`prerender.ts`; `tsc` fails loudly on those in a move), and `mapping.source` inside `content-mapping.json`. The last two are handled in 1b.
- **New guard:** [paths.test.ts](../src/lib/__tests__/paths.test.ts). Every key in `paths.json` must exist. Seen failing with a wrong key before it passed.
- **Tests:** `npm run qa` passes · vitest **288 passed** + 1 skipped (+1 new, the guard) · deno 75 · `build` 253 pages · `npm run import` (dry run) identical · the scripts run correctly from a different working directory · **no generated file changed**.

### 1b-1 ✅ Moving the content (25.09.2026)
- `knowledge/` → `apps/server/content/knowledge/` · `data/source/` → `apps/server/content/source/` · `content-mapping.json` → `apps/server/content/`. All with `git mv`, so history is kept.
- **The `source` field in `content-mapping.json` is now relative to the mapping file** (`source/product_export.csv`), not to the repo root. Otherwise it would be a second copy of paths outside `paths.json`. The gap report still prints the full path.
- Updated: `paths.json`, `.gitignore` (the master rules), the `content-and-verify.yml` trigger, the importer's messages, `CLAUDE.md`, `README.md`, `apps/server/db/README.md`.
- **Tests:** `npm run qa` passes · vitest 288 + 1 skipped · deno 75 · `build` 253 pages · the importer reads from the new location (239/242 pages complete, as before). The only change in a generated file is the `source` path in the gap report.
- `doc-paths` caught one reference that was missed (`$manifest` inside `content-mapping.json`) before the commit.

⚠️ **Two things to know when this is pushed:**
1. **`ci-content.sh` loads only the knowledge documents that changed.** In the move commit, git sees all 66 as new, so the first run on `release` would reload them all and re-embed about 309 chunks. That's harmless but costs Gemini calls, and there's a window where content isn't retrievable. Options: push the move when a full reload is acceptable, or run the script once with a `BEFORE` that points after the move.
2. **Text inside generated files still says `knowledge/`** (e.g. `נוצר מ-knowledge/...` in the seeds and in `data/deploy/*.txt`, and inside migration `041`, which is signed). It's descriptive text, not a path anything reads. The migrations stay as they are (signatures). The seeds get updated whenever a document is next rebuilt.

### 1b-2 ✅ Moving the database (25.09.2026)
- `db/` → `apps/server/db/` with `git mv`: migrations, `pending/`, seeds, `local/`, `verify.sql`, the READMEs.
- **Not one migration changed.** They all appear as pure renames, so the signatures hold (`migration-log.py --check`: 48 signed).
- Updated: 6 keys in `paths.json`, the `content-and-verify.yml` trigger, live references in `CLAUDE.md`, `.env.example`, the db READMEs, comments in scripts and tests. Including Hebrew prefixes like `מ-db/seed`, which the first pass missed.
- **`doc-paths.test.ts`, two changes:**
  1. **`apps/` added to the checked roots.** Until now, a reference to `apps/...` wasn't checked at all, so the new structure would have been exposed to exactly the breakage the test exists to catch.
  2. **`FROZEN` + `MOVED`:** a path in a frozen file (the brief as received, the conformance response, `supabase-bundle.sql`) resolves through the move map. **Only there**, so a live document with an old path still fails. The map checks itself (an old path that exists again, or a frozen file that disappeared, is a failure).
  3. Seen failing: removing a file from `FROZEN` flags its reference, and a broken `apps/` reference is caught.
- **Tests:** `npm run qa` passes · vitest **292** + 1 skipped (+4, the map's self-checks) · deno 75 · `build` 253 pages.

### 1b-3 ✅ Moving the frontend (25.09.2026)
- `src/`, `public/`, `index.html`, `tim.html`, `tim-test.html` and the three `vite*.config.ts` → `apps/web/` with `git mv`.
- **Each Vite config got `root: __dirname`.** Without it, Vite treats the directory it was run from as the root, and `/src/main.tsx` in the HTML would resolve against the repo root.
- `package.json`: the scripts point to `--config apps/web/...`. `tsconfig.json`: `include` covers `apps/web/src` and all three configs. Two of those configs weren't type-checked before.
- `netlify.toml`: `publish = "apps/web/dist-tim"` / `"apps/web/dist-tim-test"`. The test that checks this now takes the value from `paths.json` rather than a hard-coded string.
- Relative imports: 23 files in `apps/web/src` (mostly `scripts/paths`) and 2 scripts (`../apps/web/src/...`).
- `doc-paths`: `src/` → `apps/web/src/` in the moves map. **Frozen:** the signed migrations (`SIGNED`, a pattern rather than a list), `supabase-bundle.sql`, three dated sync records and measurements, and **`supabase/functions/tim/index.ts` until Stage 3** (it's stamped, and a comment edit would force a new stamp and a redeploy). Live references updated in CLAUDE.md, README.md, the team 1 agent, `docs/README.md`, 3 architecture docs and more.
- `content-seed`: the header line (`נוצר ... מתוך ...`) is now derived from `paths.json`, and was rebuilt. One line changed in each file.
- **Tests:** `npm run qa` passes · vitest **298** + 1 skipped (+6 self-checks) · deno 75 · `build` 253 pages · `build:tim` · `build:tim-test` · **the dev server**: the page, `main.tsx` and the report outside `apps/web` all return 200.

⚠️ **Deviation from the approved plan: npm workspaces and `packages/shared` are deferred to Stage 3.** Right now `apps/web` would be the only package and `packages/shared` would be empty. They'd bring a new `package-lock`, a change to how Netlify installs dependencies, and another thing that can't be checked locally, for no benefit yet. They become necessary once `apps/server` has dependencies of its own. The resulting tree is identical. `package.json` stays at the root, and so does `reports/` (the import report that `AdminPage` shows).

⚠️ **Netlify wasn't checked against a real build.** What was checked: the `publish` values match where Vite writes, and the builds run. Before pushing this to `release`, a branch deploy on `tim-test` confirms that Netlify serves from the new path.

### 1b-4 ✅ Tidying the root (25.09.2026)
- The ten numbered files at the root (`1-skip-line.txt` … `9-content-part2.txt`) → `docs/archive/deploy-2026-09-early/`, with a README that says **do not run**.
- 🔴 **`6-tim-function.txt` is an old copy of the Tim function** (362 lines, from 02.09; today it's about 1,500). Pasting it into Supabase would roll Tim back weeks, without the rate limit, retrieval or the CORS fix. That's why it isn't just moved but marked explicitly in the archive.
- `claude/` → `docs/claude-code/` (the golden set, infra status, handoffs). Nothing referenced them.
- **Tests:** `npm run qa` passes · vitest **299 passed, 0 skipped** (the skipped test runs now that `build:tim-test` produced its output) · deno 75 · `build` 253 pages.

### Stage 1 — summary
```
apps/web/          src/, public/, html, vite configs
apps/server/       content/ (knowledge, source, mapping) · db/ (migrations, seeds, bundle)
scripts/           tooling + paths.json (the only place that says where things live)
supabase/          the Edge Functions, until Stage 3–4
data/deploy/       Neta's deploy files, until Stage 2
docs/              + archive/, claude-code/
```
Starting point → end: vitest 287 → 299 (+12 guards and self-checks, none removed) · deno 75 → 75 · generated files: only the path text in their headers, plus the bundle that was stale.

### 3a ✅ npm workspaces (25.09.2026)
- `package.json` at the root: `workspaces: [apps/web, apps/server]`. The frontend's dependencies moved to `apps/web/package.json`, and the server's (`hono`, `@hono/node-server`) are in `apps/server/package.json`. The dev tools stay at the root.
- **`package-lock`: no existing package changed version.** Only the workspaces and the two new packages were added. `npm ci` passes. `netlify.toml` didn't change, because the build runs from the root.
- `packages/shared` is still deferred, to Stage 5, when code moves into it. An empty package adds nothing.

### 3b ✅ The server, and Tim in it (25.09.2026)
- **`apps/server/src/app.ts`:** a Hono app with `GET /health` and `/tim`. `index.ts` runs it on Node (`PORT`, default 8787). `npm run dev:server` runs it in development.
- 🔴 **The server runs the same Tim file as the Edge Function** (`supabase/functions/tim/index.ts`), through an import, not a copy. Until the cut-over there's no second Tim that could drift from the live one, and the stamped file isn't touched. **Checked on a running server:** `diagnose` returns `deploy_stamp` `bfd501af7bd8` and `fit_stamp` `73db7652fca2`, identical to the repo.
- 🔴 **Client IP:** Tim builds the rate-limit bucket from the first entry of `x-forwarded-for`. On Supabase their edge sets it, but on our server anyone can send it, and a different value per request would mean a new bucket per request, i.e. no limit. So the server **overwrites** the header with an IP it trusts: from the header the host sets (`CLIENT_IP_HEADER`, e.g. `fly-client-ip`) or from the socket. The tests check that the bucket reaching the database is built from the real IP. **Seen failing:** with the protection disabled, both spoofing tests fail.
- **Tests:** 7 new server tests (`apps/server/src/__tests__/app.test.ts`) in `npm test`, so also in the QA gate. `/health`, routing with the env, OPTIONS, the body passing through, and the three IP checks.
- `doc-paths`: in a workspace's `package.json`, a path can also resolve relative to the package (the server's entry file). Only there. And the test caught its own explanatory comment, which quoted the example, on the first try.
- **Tests:** `npm run qa` passes · web 299 · **server 7** · deno 75 · `build` 253 pages.

### 3c ✅ `embed` and `aliases` (25.09.2026)
- 🔴 **Their tests had never run.** `Deno.serve` ran at module load, so `deno test` crashed before a single test ran. **0 of 29.** It's the same bug Tim had and that CLAUDE.md records ("a test that didn't run isn't a test"). **Seen failing:** "FAILED | 0 passed | 1 failed (uncaught error)" before the fix.
- The fix: the same guard as Tim's (`typeof Deno !== "undefined" && import.meta.main`). On Supabase the server comes up exactly as before. After it: **embed 14, aliases 15, all passing.** `test:edge` now runs all three, so they're in `npm test` and the QA gate.
- ⚠️ This is a change to two files that are **deployed manually from the dashboard**. It changes nothing in their behavior on Supabase, but whoever redeploys them there will be pasting a new version.
- The server: `POST /internal/embed` and `POST /internal/aliases`. The secret (`x-ingest-secret`) is checked inside the function itself, exactly as on Supabase, and the route adds and removes nothing. 4 new server tests: 403 without the secret or with a wrong one, `not_configured` without an env value, POST only.
- CLAUDE.md: the test counts updated (they said 221/66, already stale before) plus `npm run dev:server`.
- **Tests:** `npm run qa` passes · web 299 · server **11** · deno **104** (75 + the 29 that had never run).

### 3d ✅ Docker, built and tested locally (25.09.2026)
- **`apps/server/Dockerfile`, two stages.** The build stage bundles with esbuild into a single `server.mjs` (195 KB: Hono plus the three functions). The image that runs has **Node plus one file**: no `node_modules` at all, and it runs as `node`, not root. `HEALTHCHECK` on `/health`.
- **Build from the repo root** (`npm run docker:server`), because the server imports from `supabase/functions`. `.dockerignore` keeps `.env*`, `node_modules`, content and docs out of the context.
- esbuild is declared explicitly in the server (`^0.28.2`, already installed by `tsx`). The lock: no existing package changed.
- **Tested on a running container:**
  | Check | Result |
  |---|---|
  | `/health` · Docker status | `{"ok":true}` · `healthy` |
  | `diagnose` stamps | `bfd501af7bd8` / `73db7652fca2`, identical to the repo |
  | No question · GET · OPTIONS | `empty_question` · 405 · 200 |
  | `embed` without a secret | `not_configured` (closed) |
  | 🔴 **3 requests, 3 spoofed IPs** (fake database on the host that records the bucket) | **one bucket.** The 4th request: `rate_limited` |
  | User · `node_modules` | `node` · doesn't exist |
- Image size: **346 MB**, almost all of it the `node:22-slim` base. `node:22-alpine` would cut it to about half. It isn't worth it before choosing a host.

**Not done yet in Stage 3:**
- Deployment (Dockerfile + workflow) waits on O1, hosting.
- Comparing answers against the golden set on a live server needs keys (Gemini, database), so it happens on deployment.

---

## Open items

### O1 — Where the server is hosted · waiting on: Neta
Fly.io / Render / Railway / Cloud Run. A new account, a monthly cost, and new secrets (DB connection string, Gemini key). Blocks the Stage 3 deployment. Stages 1 and 2 aren't blocked.

### O2 — Security review · waiting on: Guy
A new public endpoint, CORS, the DB role the server connects with, a DDL role for dbmate, an approval gate (GitHub Environment) for migrations, and revoking the anon grants on the RPCs and on `experience`. Category 1. Blocks Stages 2 through 4.

### O3 — ✅ Closed 25.09 · the Tim file's stamp doesn't match the file, and a CORS fix appears to be missing
**Decided by Alon (25.09):** merge `tim-test` into the refactor branch. After the merge the stamp matches, and the CORS fix, the removal of the opening questions (`d06cb81`) and the Netlify fix (`ba3260c`) are all on this branch. The merge brought in one type error in `status-vocabulary.test.ts` (from `62501f8`; `tsc` would fail on `tim-test` too), fixed with `!` on the capture groups.

**Where the work lives (Alon, 25.09):** the refactor is on a local branch, `refactor/server-split`, which isn't pushed. `claude/new-session-w47twu` was returned to `307c648`, as it was before the refactor, and it contains none of these changes.

<details><summary>Background</summary>

**What the stamp is:** [tim/index.ts:99](../supabase/functions/tim/index.ts) holds `DEPLOY_STAMP`, a fingerprint of the file's own content. The deployed function returns it from `diagnose`, and `tim-live-check.yml` compares it with the repo, to answer one question: "is what's live the same as what's in the repo?" Every edit to the file requires running `python3 scripts/build-deploy-stamp.py` to update the fingerprint, and `deploy-stamp.test.ts` fails if someone forgot.

**What happened:** in the last commit (`307c648`) the file holds `bfd501af7bd8`, but its actual content gives `8e89d07a8678`. So the file changed after it was stamped, and the stamp wasn't refreshed.

**Why not just re-stamp:** the same commit says the CORS fix (several allowed origins, and `allowed_origins` returned from `diagnose`) was never deployed. That fix doesn't exist in the repo either: `corsFor` accepts a single origin, and `diagnose` doesn't return `allowed_origins`. Meanwhile `tim-live-check.yml` already requires it. The fix may have been lost before it was committed. Re-stamping would make the test green and hide that question.

**Checked 25.09:** the fix wasn't lost. It's on the `tim-test` branch, in commit `2f571ad` ("ALLOWED_ORIGIN: סלאש בסוף חוסם הכול, ומקור יחיד חוסם את גרסת הבדיקה", 23.09). On `tim-test` the stamp is correct: the file there gives exactly `bfd501af7bd8`. The stamp commit (`efa81d2` on `tim-test`) was copied to this branch as `307c648`, **without the CORS commit that came before it**. That's why the stamp here describes a file that doesn't exist on this branch.

The branches have diverged: `tim-test` has 7 commits this branch doesn't have, and this branch has 4 that `tim-test` doesn't.

**Proposal:** bring `2f571ad` (and whatever else is needed out of the 7) into this branch before Stage 1. Then the stamp matches with no manual re-stamping, and the port in Stage 3 copies the fixed version. Needs a decision: which branch is the base for the refactor, and whether to merge `tim-test` or cherry-pick just the fix.

</details>

### O4 — Port the Python scripts to TypeScript · proposal, not decided
13 tooling scripts in `scripts/` are Python, and the QA gate and 5 tests depend on them. With a Node server that's a second toolchain, and it already caused a false failure (the system Python 3.9 is too old). Proposal: a step after Stage 1, porting one script at a time with the same `--check` output and a test run after each.

### O5 — ✅ Closed 25.09 · `supabase-bundle.sql` is stale, and nothing checks it
**Decided by Alon (25.09): keep the bundle with the full migration history.** It was rebuilt: all 48 migrations (`000` to `046`, both `034`s) plus 2 seeds plus the verification block, 290 KB. `build-supabase-bundle.py` got a `--check` mode, and `seed-freshness.test.ts` runs it, so the bundle can't go stale silently again. The test was seen failing on the stale bundle before the rebuild. The bundle came out of `FROZEN` in `doc-paths`, because its text now points to the new paths.

⚠️ **Not checked:** actually running the bundle against Postgres. There's no local Postgres on this machine (`verify-probes.sh` and `db-conformance.ts` need one). What's checked is that the bundle is identical to what gets built from the migrations, not that it runs cleanly on an empty database.

<details><summary>Background</summary>

`apps/server/db/supabase-bundle.sql` (a single file of every migration plus seed plus verification block, for setting up a database) was last updated on 07.09. Rebuilding it with `build-supabase-bundle.py` adds about 2,700 lines: every migration since, starting with `000`. **Anyone who sets up a database from it today gets a schema that's weeks old, with no warning.** This is exactly the pattern CLAUDE.md warns about: "a derived file goes stale silently". The seeds have `seed-freshness.test.ts`, and the bundle has nothing.

It wasn't rebuilt during the move so as not to slip a large, unrelated change into a commit of renames only. It's marked `FROZEN` in `doc-paths` for now.

**Proposal:** rebuild it in a separate commit and add a freshness check (like `seed-freshness`). Or, if nobody uses it since the switch to dbmate (Stage 2), delete it along with its script. Needs a decision: is anyone still setting up a database from the bundle?

</details>

### 3e ✅ The first real answer, locally (25.09.2026)
**Server → local database → embeddings → Gemini, all on this machine:**
> היי! לצערי היא לא תוכל לעלות על Space Mountain, מכיוון שגובה המינימום הנדרש למתקן הוא 112 ס"מ. החדשות הטובות הן שאתם יכולים להשתמש בשירות Child Swap בפארק…

Correct (112 cm, the child is 110). `retrieval: ok` · 5 chunks · 1 attraction · tier T1 · nothing filtered · `gemini-3.5-flash`.

**Golden set:** `scripts/run-golden.ts` (`npm run golden`), the first runner the set has had. In the first run all **28 were "not run"**: Google was overloaded (502), and an unanswered case isn't counted as either a pass or a failure. The table checks did run, and they match the file (the Hebrew description of Everest and "ולוצירפטור" have no match, as recorded). A bug in the runner itself was found and fixed: `find_experiences` returns `height_cm`, not the table's column name. **The full run is still pending, waiting for Google's load to ease.**

**To run locally again:**
1. `supabase --workdir apps/server/db/supabase-local start -x gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`. The data is kept in a Docker volume between runs.
2. `npm run build:server && node --env-file=.env.server apps/server/dist/server.mjs`. `.env.server` isn't in the repo: the Gemini key plus local values.
3. `npm run golden`.
4. To stop: `supabase --workdir apps/server/db/supabase-local stop`.

⚠️ **In the local database only:** the per-user rate limit was raised to 1000 (in production it's 20), so that 28 questions from one IP don't block the test. It's documented in the function's comment inside the database.

### O6 — The migrations can't build a database from scratch · found 25.09 on a local database
While setting up a local database (`supabase start`, config in `apps/server/db/supabase-local/`), the setup file stopped **at migration 038**. That's the practical check O5 left open, and it failed.

**Three causes, all the same pattern: the migrations assume a database that was built by hand, not by the migrations:**
1. **038, 039, 040:** their self-check copies an existing attraction (`select * from experience limit 1`) to create a test row. On an empty database there's nothing to copy, the check gets NULL, and the migration rolls back. In production it passed only because the content was already there. The content can't be loaded before 038 either, because it includes the column 038 adds.
2. **046** grants permissions to the role `ci_verify`, which isn't created by any migration. It was created by hand from `data/deploy/ci-roles.txt`.
3. **`content-seed`:** `land.sql` has to run before `content-*.sql`, and alphabetical order puts it after them. Nothing in the directory says so.

**How the local database was built anyway** (a local workaround, nothing changed in the repo): migrations 000–037 → seeds → a placeholder attraction → 038–040 ran **their real checks** and passed → the placeholder was deleted → `ci-roles.txt` → 041–046 → `land.sql` → content → knowledge → `park-intro`. Result: 48 migrations, 242 attractions (verification passes), 66 documents / 314 chunks. Tim's queries were checked through the local REST layer: `check_rate_limit` "ok", `find_experiences` (Space Mountain, 110 cm → fits false), `park_candidates` 58, knowledge closed to anon.

**Why it matters:** the same thing will hit dbmate (Stage 2) on any new database, whether a test database, a Supabase branch, or recovery after a disaster. **The migration history is currently not a way to rebuild the database.**

**Proposal (needs a decision, since these are signed migrations that already ran in production):**
- Don't edit 038–040 (their signatures and history). Instead, a new migration `047`, or a local setup script that explicitly does what's written above.
- Or, when moving to dbmate: a "baseline", a single schema file taken from production (`pg_dump --schema-only`) that replaces 000–046 for new databases, with the old migrations kept as history. That's the standard approach, and it also solves the 034 duplicate.
- `ci_verify` / `ci_content`: a migration that creates them if missing (`if not exists`), without passwords, which get set separately.

### O7 — Tim's fallback model no longer exists, and `diagnose` says it does · found 25.09 on the local server
With a real Gemini key, against the local database (all 314 chunks embedded):
- **`gemini-3.5-flash` (the production model) returned 503**, "high demand", several times over about 10 minutes. `gemini-3.8-flash` did the same. That's Google-side load, not a setup error.
- 🔴 **The fallback in Tim's error message is out of date.** On a 503 the message says to set `GEMINI_MODEL` to `gemini-2.5-flash`. For this key it returns **404: "no longer available to new users"**. Anyone following the hint in the middle of an outage would move from one error to another.
- ⚠️ **`{"diagnose":"models"}` lists `gemini-2.5-flash` as available**, even though it returns 404. So the list answers "which models exist", not "which will work for this key". The comment in the code treats it as the authority on the latter.
- The embeddings (`gemini-embedding-001`) worked. The free-tier limit is about 100 a minute, handled with a one-minute wait.

**Proposal:** update the hint in the code to a model that actually works (and check it with a real call, not from the list), and consider an automatic fallback to a second model on a 503. That's a product change to Tim, so it waits for the move in Stage 4 (the file is stamped).
