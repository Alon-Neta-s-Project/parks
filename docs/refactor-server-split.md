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
| 2 | Migrations with dbmate, run from CI with an approval gate | ✅ In the repo, 26.09 · marking production (one file) waits on O2 |
| 3 | Port Tim, `embed` and `aliases` to the Node server, running alongside the Edge Function | 3a ✅ workspaces · 3b ✅ server + Tim · 3c ✅ embed + aliases · 3d ✅ Docker (local) · deployment waits on O1 |
| 4 | Point the frontend at the server, retire the Edge Functions, revoke the anon grants | Not started |
| 5 | Shared logic in `packages/shared`, a browse API, close direct table reads | Not started |

## Target: no logic in the database · decided by Alon (26.09)
**The database holds schema only** — tables, constraints, indexes, RLS, and the one integrity trigger. **All logic lives in the server**, and what must run next to the data (atomic updates, vector search) is a SQL statement the server sends, not a function stored in the database. Why: logic in SQL is hard to test, is deployed by a migration someone has to run, is invisible to the log, and already duplicates the web app (the fit is computed in `fitFor` and in `find_experiences`).

| Today | Target |
|---|---|
| `find_experiences`, `park_candidates` | a query from the server; the fit and the candidate policy in `packages/shared` |
| `match_knowledge` | a query from the server (`ORDER BY embedding <=> $1`); the pgvector index stays |
| `check_rate_limit` | 🔴 **one atomic statement** (`INSERT … ON CONFLICT … DO UPDATE … RETURNING`), never read-check-write in code — two parallel requests would both pass. ⚠️ **Today's function is not atomic either** (O16) — the move is where that gets fixed, not where it starts |
| `log_turn` | an `INSERT`; **the privacy `CHECK` stays** as a constraint; the 90-day cleanup becomes a scheduled job |
| `ingest_*`, `alias_*` | pipeline code with its own role — no secret in the arguments |
| `save_tester_note`, `tester_notes`, `unanswered_sample` | server / CI endpoints |
| `record_migration`, `is_admin`, `rate_limit_*` constants | removed, or config |
| trigger `knowledge_chunk_content_changed` | **stays** — integrity that must hold whoever writes |

**Prerequisites:** the server connects to Postgres directly with its own role — on Netlify through **Supabase's connection pooler (transaction mode)**, or every invocation opens a connection · a query layer (Kysely / Drizzle / plain `postgres.js` — to decide) · query tests against a real database (`npm run db:local-pg`) · Guy (O2): the connection string is a stronger secret than the anon key.

**Order — each function moves when it is touched anyway, never all at once:** the fit with `packages/shared` → `query_rides` born in the server (O13) → Tim's functions at stage 4 (with the anon grants revoked) → the pipeline when it gets its own role. **New code never adds a function to the database.**

## The path from staging to no logic in the database · decided by Alon (29.09)
1. **The Netlify staging site works** (O1).
2. **The gate — staging vs production, `npm run tim:compare`.** Staging passes only if all of these hold:
   | Criterion | Threshold |
   |---|---|
   | The golden set (31: Paula's 28, + 3 agent-only cases added by Alon 01.10, pending her approval) | **0 cases worse** on staging than in production — the 3 are expected to fail on both until the agent, so they do not move this criterion; they are what the agent must improve |
   | Facts that differ (cm, $, times, %) | only known ones — O15's two water rides, and deliberate code changes |
   | Errors | no 5xx, no timeouts, no URL in any answer |
   | Time | p95 under 15s (staging's database is in Singapore — a floor, not a production measurement) |
   | Operations | a log line per request in Netlify, and rows in staging's turn log |
   `evals/robustness.yaml` does **not** count — some cases are expected to fail today; it is the baseline for improvement.
3. **Timeouts** (O1 step 3) — they also protect the new database connection.
4. **The database functions move to the server, one at a time** — each followed by a direct parity check on staging (the old function's output against the new code's) and `tim:compare`:
   `match_knowledge` → `find_experiences` + the fit (`fitFor` into `packages/shared`) → `park_candidates` → `log_turn` (an `INSERT`; the privacy `CHECK` stays; cleanup becomes a job) → `check_rate_limit` (one atomic statement, with a concurrency test).
   - **Query layer: `postgres.js`, plain SQL** (Alon, 29.09). The functions being moved are already SQL, so they move as they are and are compared line by line; it does not compete with dbmate for the schema (Drizzle would); Kysely can be added on the same connection later if types are wanted. On Netlify the connection goes through Supabase's pooler in **transaction mode** (6543), so `prepare: false`.
   - **Before the first move:** a database role for the server instead of the anon key — **Guy (O2)**.
   - **`find_experiences` — moved, staging only (Alon, 30.09).** The query is in `apps/server/src/db/find-experiences.ts`, a copy of the function's body. The only changes: bound parameters, output aliases (a function's `RETURNS TABLE` names columns by position), `last_verified::text` like PostgREST, and no comments. Tim takes it when the host passes `direct`, i.e. when `DATABASE_URL` is set (Node, Netlify); a failed query is a soft failure with **no fallback** to the RPC. Local parity: **1312/1312 inputs identical**, 2055 rows; a negative control (one prefix letter removed) caught 40 differences. Migration `20260930170000_drop_find_experiences.sql` drops the function; its `down` was checked to restore the definition and the grants exactly. **Applied on staging 30.09**, after the function on Netlify was seen to have `DATABASE_URL` and to answer with rides; afterwards the RPC returns 404 and Tim still answers (Space Mountain 112 cm, 3 rides · Big Thunder 97 cm, fits 110). `tim:compare` and `run-golden` look rides up the same way (`scripts/ride-lookup.ts`), and a failed lookup now throws instead of judging against `[]`.
     ⚠️ **Deviations from the path above, all Alon's call (30.09):** it went before `match_knowledge`; the parity check on staging was not run (after the drop it can't be — `scripts/parity-find-experiences.ts` needs the function); `tim:compare` was not run before the drop; and **there is no server role yet** — staging's `DATABASE_URL` is the `postgres` user through the transaction pooler. That last one is O2's and was written to Guy the same day. **Production is unchanged:** its Tim still calls the function, and the migration must not run there before the cut-over.
   - **`match_knowledge` — moved, staging only (30.09).** `apps/server/src/db/match-knowledge.ts`, a copy of the body with the same kinds of change, plus one more: `extensions.vector` and `operator(extensions.<=>)` are named, because the function pins `search_path` and a query takes the connection's — today's `postgres` role has `extensions` in it, the server's own role (O2) may not. Wired through the same `direct` (a failure is `retrieval: "failed"`, no fallback). `npm run parity:match-knowledge`, with no Gemini call: every stored embedding and blends of pairs as queries, × every resort filter × limits including null, 0 and above the cap — **2512/2512 identical, 16,104 rows locally.** Negative controls: cap 20→21 caught (418), resort filter removed caught (1276).
     🔴 **The data could not test the approval filter** — every document and chunk is approved, locally and on staging, so a copy without `d.review_status = 'approved'` passed. `--fixtures` (local only, refused on any other host before connecting) sets one document and one chunk to `pending_review` in a rolled-back transaction: both sides return neither, and removing either filter from the copy is caught. Migration `20260930180000_drop_match_knowledge.sql`, `down` checked exact like the last one. **On staging, before the drop** (Alon asked for it this time): **2512/2512 identical, 16,104 rows** (22 min — one input at a time to Singapore). Then applied on staging: the RPC returns 404, and Tim still retrieves (`retrieval: "ok"`, 5 chunks, T3 + T1).
     ⚠️ Team 1's verifier was to check retrieval through this function once Guy approved a grant for `team1_content` (`.github/workflows/team1-publish.yml`); the grant was never written, and after the drop that check belongs to the server's query.
   - **`park_candidates` — moved, staging only (30.09).** `apps/server/src/db/park-candidates.ts`, a copy: the parameter bound and the output columns aliased, nothing else. `npm run parity:park-candidates` runs the one parameter over every value that means something (null, negative, 0, 1–10, 50, 1000): **16/16 identical, 1153 rows locally.** Negative controls: status filter removed, ranking order reversed, clamp 1→0 — all caught.
     🔴 **Every ride is rated, so the data could not test the intensity rule (CLAUDE.md)** — without `e.intensity is not null` the comparison still read 16/16. `--fixtures` (local only) takes one ride's rating away in a rolled-back transaction: neither side returns it, and removing the rule from the copy is caught. Migration `20260930190000_drop_park_candidates.sql`, `down` checked exact. **On staging, before the drop: 16/16 identical, 1153 rows.** Applied on staging: the RPC returns 404, and Tim still answers (rides and retrieval as before). ⚠️ That the server's candidates reach an answer could not be seen live — no question reaches the path (O17).
     ⚠️ **The tests call `findCandidates` directly** — no real question reaches it through the handler (O17).
   - **The fit — one rule, `packages/shared/src/fit.ts` (30.09).** It was written twice and the two disagreed: the web app's `fitFor` ignored the ceiling, and the SQL `CASE` in `find_experiences` said "fits" on a ceiling with an unchecked floor. **Alon's decisions (30.09):**
     1. **The ceiling applies on the screen too** — a 140 cm child no longer "fits" a 122 cm toddler area.
     1b. **An adult clears every floor unmeasured, and no ceiling** — adults' heights are not collected, and no adult fits a toddler area.
     2. **Option C — a ceiling with an unchecked floor is never "fits".** Below the ceiling is said in words ("לא גבוהים מדי"), and the floor stays "לא ידוע אם קיים". Affects Tike's Peak, Runamukka Reef, Tot Tiki Reef; **production's Tim says "fits" there today** (migration 038's "a ceiling alone is an answer"), which contradicts 038's own "no one verified there is no floor".
     Step 1 (the screen): the shared rule with its own tests in `npm test` (18; the 6 for the decisions seen failing on the old rules), `fitFor` in `apps/web/src/lib/group.ts` feeds it both limits, and `FitTag`'s words come from `fitLabel` (`apps/web/src/lib/fit-label.ts`), tested on the real five ceiling rides (4 seen failing on the old `fitFor`). `packages/shared` is a directory imported by relative path, not a workspace package — no install change for Netlify until one is needed.
     Step 2 (Tim): `withFit` in `lookup.ts` applies the shared rule to every ride row, on both paths, and **overwrites the database's `fits`** — the RPC's `true` on a ceiling with an unchecked floor never reaches the model (tests through `handle()`, 4 seen failing first). The context says the new state as "לא גבוה מדי לגובה שנמסר — אבל לא ידוע אם יש גובה מינימום", never "מתאים". The server query lost the `CASE` and no longer takes the height (parity without the fit column: still 1312/1312). The eval scripts judge `fits` by the same `withFit`. Tim's generated fit rules now name **four** states (`FIT_STAMP` 73db7652fca2 → 3bcf648d801f). `DEPLOY_STAMP` covers `packages/shared/src/*.ts` (17 files) — a test pins it, seen failing without. ⚠️ **In production nothing changes until the cut-over**: its Tim is the Supabase Edge copy from `release`.
5. **Then** O14 (chunk titles) and the agent (O13) — `query_rides` born in the server.

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
- `doc-paths`: `src/` → `apps/web/src/` in the moves map. **Frozen:** the signed migrations (`SIGNED`, a pattern rather than a list), `supabase-bundle.sql`, three dated sync records and measurements, and **`apps/server/src/tim/index.ts` until Stage 3** (it's stamped, and a comment edit would force a new stamp and a redeploy). Live references updated in CLAUDE.md, README.md, the team 1 agent, `docs/README.md`, 3 architecture docs and more.
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
- 🔴 **The server runs the same Tim file as the Edge Function** (`apps/server/src/tim/index.ts`), through an import, not a copy. Until the cut-over there's no second Tim that could drift from the live one, and the stamped file isn't touched. **Checked on a running server:** `diagnose` returns `deploy_stamp` `bfd501af7bd8` and `fit_stamp` `73db7652fca2`, identical to the repo.
- 🔴 **Client IP:** Tim builds the rate-limit bucket from the first entry of `x-forwarded-for`. On Supabase their edge sets it, but on our server anyone can send it, and a different value per request would mean a new bucket per request, i.e. no limit. So the server **overwrites** the header with an IP it trusts: from the header the host sets (`CLIENT_IP_HEADER`, e.g. `fly-client-ip`) or from the socket. The tests check that the bucket reaching the database is built from the real IP. **Seen failing:** with the protection disabled, both spoofing tests fail.
- **Tests:** 7 new server tests (`apps/server/src/__tests__/app.test.ts`) in `npm test`, so also in the QA gate. `/health`, routing with the env, OPTIONS, the body passing through, and the three IP checks.
- `doc-paths`: in a workspace's `package.json`, a path can also resolve relative to the package (the server's entry file). Only there. And the test caught its own explanatory comment, which quoted the example, on the first try.
- **Tests:** `npm run qa` passes · web 299 · **server 7** · deno 75 · `build` 253 pages.

### 3c ✅ `embed` and `aliases` (25.09.2026)
- 🔴 **Their tests had never run.** `Deno.serve` ran at module load, so `deno test` crashed before a single test ran. **0 of 29.** It's the same bug Tim had and that CLAUDE.md records ("a test that didn't run isn't a test"). **Seen failing:** "FAILED | 0 passed | 1 failed (uncaught error)" before the fix.
- The fix: the same guard as Tim's (`typeof Deno !== "undefined" && import.meta.main`). On Supabase the server comes up exactly as before. After it: **embed 14, aliases 15, all passing.** `test:edge` now runs all three, so they're in `npm test` and the QA gate.
- ⚠️ This is a change to two files that are **deployed manually from the dashboard**. It changes nothing in their behavior on Supabase, but whoever redeploys them there will be pasting a new version.
- (Until 4c.) The server: `POST /internal/embed` and `POST /internal/aliases`. The secret (`x-ingest-secret`) is checked inside the function itself, exactly as on Supabase, and the route adds and removes nothing. 4 new server tests: 403 without the secret or with a wrong one, `not_configured` without an env value, POST only.
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

### O1 — Where the server is hosted · **decided by Alon (26.09): Netlify, on the same site as the web app** · remaining: Neta (secrets), Guy (O2)
**The decision:** the server runs as a Netlify Function under `/api/*` on the site that already serves the web app, not on Fly/Render/Railway/Cloud Run. No new account or vendor, one deploy, and same origin, so no CORS.

**Why it fits (measured 26.09):** Netlify's synchronous limit is **60s and cannot be raised** on any plan. `npm run golden`, 28 cases, locally: median 6.2s · p95 9.0s · **max 9.3s**. Even a Gemini retry (2 × 9.3s + 0.7s) is far below. The real risk is a *hang*: no outgoing call in `tim/` has a timeout, so a stuck Gemini call is cut by Netlify at 60s with Netlify's error page, not Tim's JSON. That is step 3 below.

**Steps** (on this branch, qa after each):
1. ✅ `apps/server/netlify/functions/api.ts` + `apps/server/src/netlify.ts`: `createApp` mounted under `/api`; the rate-limit IP is `context.ip`, not a header (spoofed `x-forwarded-for` and `x-nf-client-connection-ip` are both ignored — tested, seen failing). Bundled with esbuild and called under Node: a real answer through `/api/tim`.
2. ✅ **The turn log survives the response on Netlify.** The write is not awaited (the answer doesn't wait for the log), so someone must keep it alive: `context.waitUntil` travels like `context.ip` — `api.ts` → `netlify.ts` → `app.ts` (`waitUntil` option) → `handle(req, env, host)` → `logTurn(…, waitUntil)`. Without one, `EdgeRuntime.waitUntil` as before, so Supabase is unchanged; the host's wins, and the write is handed over once, not twice. `tim/` still knows no host. 5 tests, 4 seen failing first (the Supabase one passed, as it should). **Checked for real:** the bundled function against the local database — `waitUntil` held 1 write, `turn_log` 45 → 46, and the row is `answered = t` with the question NULL. Also: the comment that said the write "waits at most one second" was wrong (nothing awaits it; the second bounds the write), and a comment about `wantsRecommendation` that the 4d split left at the top of `turn-log.ts` went back to `understand.ts`. `DEPLOY_STAMP` `d3ece6b34e7c` → `4b9a4087d0d5`; production shows the old one until the next deploy.
2b. ✅ **Application logs — one JSON line per request** (`apps/server/src/tim/log.ts`, Alon 26.09). Tim fills a per-request `Trace` (stage times, Gemini attempts, counts) that the host passes in, like `waitUntil`; `logged()` wraps the request, measures it and prints. **The same line on Node, Netlify and Supabase** — so production gets logs with the next Tim deploy, before the move. Levels by console method: `info` · `warn` (4xx, or a 200 whose retrieval failed) · `error` (5xx, exceptions) · `fatal` (Node, a crash outside a request).
   - **Never in a line:** the question, the answer, the IP (nor its hash), keys, Google's error text. The line is built from a **closed list** of response fields, not the body. A test sends a marker in the question and the history and fails if it, the answer, the IP or a key appears anywhere.
   - **Exceptions:** name, message and up to 6 stack frames. 🔴 The message is hidden entirely if it shares an 8-character run with any string in the request (a JSON error quotes the text it failed on). **And the browser no longer gets the exception's message** — `{"error":"unhandled","req":…}` instead of `detail`; the `req` id (also in `x-request-id`) finds the line.
   - **After the response:** a failed turn-log write, swallowed until now, gets a separate `warn` line (`turn_log_failed`) with the same `req`.
   - `/health` is not logged: Docker's health check calls it every 30s.
   - Seen for real through the Netlify bundle: `{"level":"info",…,"ms":4555,"stages_ms":{"rate_limit":41,"retrieval":553,"gemini":3955},"gemini":{"attempts":1,"in":5304,"out":22,"thinking":697,…}}` — Gemini is ~90% of the time.
   - 15 tests + 1 on Netlify, all seen failing first. `DEPLOY_STAMP` → `08bc44059032`.
   - ⚠️ **For Guy (O2):** the log is a new place data leaves the system. Retention is the host's (Netlify 24h–7 days); nothing in it identifies a person.
3. ✅ **Timeouts (01.10).** `apps/server/src/tim/deadline.ts`: **one deadline per request, 45s** (15s below Netlify's 60 to send Tim's own JSON and write the log line), and a cap per call — each gets `min(its cap, the time left)`, so a slow stage leaves less for the next:
   | Call | Cap | On timeout |
   |---|---|---|
   | `check_rate_limit` | 3s | fails closed, as on any failure: `rate_limit_unavailable` |
   | rides / candidates / knowledge (database) | 5s | soft, as before: no rows, `retrieval: "failed"` |
   | the embedding | 5s | soft: `retrieval: "failed"` |
   | one Gemini answer | 20s | **`upstream_timeout`, 504** — Tim's JSON, not Netlify's page |
   | the retry after 429/503 | only with ≥10s left | the first attempt's error |
   The log line gains `timed_out: [stage…]` — before this, a hang wrote **no line at all** (Netlify killed the function first). Direct queries are cancelled **in Postgres** (`apps/server/src/db/client.ts` `withSignal` → `query.cancel()`), not only abandoned; `statement_timeout` is a session setting the transaction pooler does not keep. The web app shows its existing generic message for `upstream_timeout` — no new wording (Paula can add one). 🔴 **Found by the tests:** `AbortSignal.timeout` throws a `RangeError` on a fractional delay, and the time left always is one — so exactly when the deadline mattered (less time left than the cap), the call would have failed as `upstream_unreachable`. Tests: 8 through `handle()` (7 seen hanging first), 3 on `withSignal` and 1 on the log line (seen failing without).
4. `[functions]` in `netlify.toml`. ⚠️ **Last, and only after O11:** without it Netlify deploys no function, so steps 1–3 are safe to merge; with it `/api/tim` is public.
5. The web app: `VITE_TIM_URL=/api/tim`, and the silent fallback to the Edge Function removed.

**Remaining outside the code:** Neta sets `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RATE_LIMIT_SALT` in Netlify's UI (they don't come to me). Guy: O2 now includes a public `/api` on the web app's site. The Dockerfile stays, so a container host is still open if the numbers change.

### Staging — `parks-staging` + a Netlify site on this branch · Alon, 29.09
- **The branch was pushed** (`origin/refactor/server-split`, no PR) so a separate Netlify staging site can build it. Production (`release`, `quick-worker`, the production database) is untouched.
- **Supabase `parks-staging`** (`hnqszijewuphhcjiesfl`, **Singapore** — `ap-southeast-1`), built from empty: `dbmate up` (the baseline, 3.2s) → the seeds in `db-local-pg`'s order → `embed` from the pipeline. Result: 10 parks · 242 experiences · 66 documents · 314 chunks, all embedded · 1 dbmate migration. The connection is the **session pooler** (5432) in `.env.staging` (git-ignored).
- **Checked:** the Netlify bundle, run locally against staging, answered "112 ס"מ" for Space Mountain. ⚠️ **Staging timings are not production's:** Netlify runs in Ohio and the database is in Singapore — the rate limit took 464ms (41ms locally) and retrieval 1013ms (553ms).
- 🔴 **Found while building — for Guy:** on a fresh database **the first caller of `ingest_set_key` claims the pipeline's secret, and `anon` may call it.** On staging it was claimed straight after the baseline (a random secret, in `.env.staging` as `INGEST_SECRET`). Any new environment built from the baseline has the same window until someone claims it.
- ⚠️ **`tester_key()` on staging is the baseline's placeholder** (`YOUR-TESTER-KEY-HERE`), which is in the repo — anyone can write tester notes on staging. Harmless on staging; recorded so nobody copies the pattern to a real environment.
- **Two repos, decided by Alon (30.09) — nothing is deleted:** **`Alon-Neta-s-Project/Park-Planner` = production** (the original, transferred from `netab24/Park-Planner` with its Issues; local `origin`) · **`Alon-Neta-s-Project/parks` = staging** (a copy of the history, pushed 30.09; local remote `staging`; the Netlify staging site builds its `refactor/server-split`). Staging is updated by pushing the branch to `parks` — Netlify deploys it on its own.
- ✅ **Netlify staging works — `https://parksan-staging.netlify.app`** (30.09, public). Project `parksan-staging`, from the new repo `Alon-Neta-s-Project/parks`, branch `refactor/server-split`. Checked from outside: `/api/health` → `{"ok":true}` (the function's path wins over the catch-all rewrite — the question the docs left open); a real question → "112 ס"מ" for Space Mountain, 3 rides · 5 chunks · retrieval ok; `x-request-id` is Netlify's; and the question reached staging's turn log (so `waitUntil` works on the platform, not only in tests). Two things that broke on the way: Netlify set **Package directory = `apps/web`** by itself (npm workspaces), so the build ran inside `apps/web` and every `netlify.toml` path doubled — cleared in Build settings; and a first build without the `VITE_*` variables, where the web app decided it had no server (`not_configured`) and never called one. ⚠️ `access-control-allow-origin: *` — `ALLOWED_ORIGIN` is not set; harmless on the same origin, worth setting to the site's URL. ⚠️ O11 is now reachable from the internet (Alon's decision, 29.09).
- **The Vercel trial — removed (Alon, 30.09: "we dont need vercel anymore").** It was never deployed. Netlify stays the server's host (O1). Removed: the Vercel entry (`server.ts` in apps/server), its `vercel.json`, its 4 tests, the `@vercel/functions` dependency, and `VERCEL_GIT_COMMIT_SHA` in `build-info.ts`; the commit is now only what the build bakes. In git history at `c499569` if it is ever wanted again.
- **Tim, production vs staging — `npm run tim:compare`** (Alon, 29.09; **run only when Alon asks**). The same questions to both Tims: `evals/golden.yaml` (31 — Paula's 28, and 3 agent-only cases Alon moved in on 01.10, pending her approval) + `evals/robustness.yaml` (20, **proposed**: the regressions from `docs/claude-code/golden-set.md` that were not in the golden set, misspellings, Hebrew prefixes, follow-ups, a set question). Verdicts from the golden-set checks (`apps/server/src/eval/checks.ts`, now shared with `npm run golden`), facts compared by unit (cm, $, times, %), never wording. Production is asked once, as a snapshot — its code does not change until the cut-over. Stops at the rate limit (20/hour) and resumes. Results in `reports/tim-compare/` (committed, for the history). ⚠️ A production run writes to production's turn log.
- **O11 is still open** (Alon's decision, 29.09): `diagnose` lists the host's environment variable names. A message to Guy was written.

### O2 — Security review · waiting on: Guy
A new public endpoint, CORS, the DB role the server connects with, a DDL role for dbmate, an approval gate (GitHub Environment) for migrations, and revoking the anon grants on the RPCs and on `experience`. ⚠️ **Including `log_turn`** (found 26.09): Tim writes it with the anon key and `anon` may execute it, so anyone can call it directly and write made-up "unanswered questions" — the table stays insert-only and its `CHECK`s hold, but the knowledge-gap list stops being trustworthy. Also in scope: the application log (a new place data leaves the system, O1 step 2b) and, for the agent (O13), tools that read the database. Category 1. Blocks Stages 2 through 4.

### O3 — ✅ Closed 25.09 · the Tim file's stamp doesn't match the file, and a CORS fix appears to be missing
**Decided by Alon (25.09):** merge `tim-test` into the refactor branch. After the merge the stamp matches, and the CORS fix, the removal of the opening questions (`d06cb81`) and the Netlify fix (`ba3260c`) are all on this branch. The merge brought in one type error in `status-vocabulary.test.ts` (from `62501f8`; `tsc` would fail on `tim-test` too), fixed with `!` on the capture groups.

**Where the work lives (Alon, 25.09):** the refactor is on a local branch, `refactor/server-split`, which isn't pushed. `claude/new-session-w47twu` was returned to `307c648`, as it was before the refactor, and it contains none of these changes.

<details><summary>Background</summary>

**What the stamp is:** [tim/index.ts:99](../apps/server/src/tim/index.ts) holds `DEPLOY_STAMP`, a fingerprint of the file's own content. The deployed function returns it from `diagnose`, and `tim-live-check.yml` compares it with the repo, to answer one question: "is what's live the same as what's in the repo?" Every edit to the file requires running `python3 scripts/build-deploy-stamp.py` to update the fingerprint, and `deploy-stamp.test.ts` fails if someone forgot.

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

**To run locally again: `npm run dev:local`** (added the same day). It brings up the database, the server (reloads on every save) and the frontend in one command: the full site at `http://localhost:5173`, Tim only at `/tim.html`, the server at `:8787`. Ctrl+C stops the server and the frontend; the database stays up. It checks Docker, the environment files and the Gemini key, and **stops if the database is empty** rather than bringing up a frontend that looks like it works. The frontend reaches the local server through `VITE_TIM_URL` (in `apps/web/.env.local`). Without that variable, the question goes to the Edge Function as before, so production isn't affected.

**The manual steps, for reference:**
1. `supabase --workdir apps/server/db/supabase-local start -x gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`. The data is kept in a Docker volume between runs.
2. `npm run build:server && node --env-file=.env.local apps/server/dist/server.mjs`. `.env.local` (named `.env.server` until 29.09) isn't in the repo: the Gemini key plus local values.
3. `npm run golden`.
4. To stop: `supabase --workdir apps/server/db/supabase-local stop`.

⚠️ **In the local database only:** the per-user rate limit was raised to 1000 (in production it's 20), so that 28 questions from one IP don't block the test. It's documented in the function's comment inside the database.

### `design/` → `apps/web/design/`, and one palette instead of two (25.09.2026)
- `design/` (the designer's mockups in `canvas/`, the approval pages in `preview/`) moved into `apps/web/design/`. It's the frontend's design, even though it isn't shipped: Vite bundles only what's imported.
- 🔴 **There were two `tokens.css` files with different palettes, and both called themselves "the only source of truth".** `design/tokens.css` was the old palette (navy background `#0B1220`, purple accent `#A98FF2`). The site ships the warm one (brown `#1A1512`, orange `#FF8156`). `build-preview.py` built the approval page from the old one, **so the page showed Neta colors the product no longer had.**
- The copy was deleted. `build-preview.py` builds from the site's `tokens.css` (`TOKENS_CSS` in `paths.json`). Checked first: all 59 tokens the page uses exist in the site's file.
- `build-preview.py --check`, and a test in `seed-freshness.test.ts`. **Seen failing** on the old page before the rebuild. It also caught a comment edit in `tokens.css`, which gets copied into the page.
- **Tests:** `npm run qa` passes · web **301** (+1) · server 11 · deno 104 · `build` 253 pages.

### Images from `public/` → `src/assets/` (25.09.2026)
- The home photo and the 10 park photos moved to `apps/web/src/assets/`. `HomePage` imports the home photo, and the park photos through `import.meta.glob`, a map Vite builds from the folder, not by hand. The file is still named by `slug`, and `dataset.test.ts` checks every park has one.
- **Why:** files in `public/` keep their name with no hash, so Netlify couldn't cache them permanently, and a swapped image could be served stale. Now: `epcot-BQpbcvIB.webp`, under `/assets/` with `immutable`.
- `publicDir: false` in the Tim configs was removed, because there's no `public/` anymore. Instead, **a test: no image in the Tim build** (`test-build-separation`). Before, the config guaranteed it; now it depends on what gets imported. **Seen failing:** a temporary import in `TimOnlyApp` put `home-hero-U4e2b5tN.jpg` into the build, and the test caught it.
- **Tests:** `npm run qa` passes · web **302** (+1) · server 11 · deno 104 · `build`: 11 images, all hashed, and 0 images in the Tim build.

### 2a + 2b ✅ dbmate: a baseline identical to production (26.09.2026)
Using **read access only** to production (Alon: "complete the migration here, with read access only"). Nothing was written to production.

- **2a:** the 48 migrations → `apps/server/db/migrations-history/`, untouched (48 signed). `migrations/` belongs to dbmate. The history is locked at 48 (a test).
- **2b, the baseline:** `apps/server/db/migrations/20260926000000_baseline.sql`, **generated** by `scripts/baseline/assemble.py`:
  - **The structure:** `pg_dump --schema-only` of a clean database built from the 48, **plus the three deploy files that created schema objects outside any migration**: `ci-roles.txt` (the `unanswered_sample` function and the CI policies), `team1-role.txt`, `team1-policy-fix.txt`. They were discovered when production had a function that no migration creates.
  - **The permissions:** from **production's catalog** (`relacl`/`attacl`/`proacl`) via `scripts/baseline/prod-grants.sql`. Readable by `reviewer_readonly`. 191 statements, including team 1's column-level permissions.
  - Why not `pg_dump` from production: it locks every table, and `reviewer_readonly` deliberately can't read 13 of the 24.
- ✅ **The proof: identical to production.** A clean Postgres 17 in Docker (not Supabase) → `dbmate up` → the comparison (`scripts/baseline/fingerprint.sql`: 782 objects including every permission) against production. **The only differences are the three expected ones:** `rls_auto_enable` (a Supabase platform function), `tester_key` (production holds the real key, the baseline a placeholder), and `dbmate_migrations` (created in production by the marking).
- ✅ **O6 is closed:** on that database the seeds, content, knowledge and park intros loaded **with no workaround**. 242 attractions, 314 chunks. `npm run db:local-pg` builds it from scratch in about half a minute.
- ✅ **A rehearsal of the production step:** `data/deploy/dbmate-baseline.txt` (one row in dbmate's table) ran on the local Supabase database, which was built from the 48 like production. Afterwards `dbmate status` → `Applied: 1, Pending: 0`, and `up` runs nothing. It's safe to run twice, and **it refuses on a database that isn't production** (a check for `tester_note`, seen failing on an empty database).
- `.github/workflows/migrate.yml`: an approval gate (Environment `production-db`), and **it stops if the baseline isn't marked in production**, rather than trying to build a schema on a full database.
- Tests: 3 new ones on the baseline (exactly one; no psql commands; `tester_key` placeholder). **Seen failing,** including a sabotage that first failed to plant a backslash (zsh's `echo` turns `\r` into a carriage return). The test was correct, the sabotage wasn't.
- **Tests:** `npm run qa` passes · web **308** · server 11 · deno 104.

**What's left in production (waits on O2, Guy):**
1. Neta runs `data/deploy/dbmate-baseline.txt` once, in the SQL Editor.
2. Guy defines the role (DDL) → secret `MIGRATE_DATABASE_URL`, and the approvers in the Environment.
From then on, new migrations: `npm run db:new <name>`, and CI with approval.

### 4a ✅ Deno out of development and testing (26.09.2026)
Alon asked to retire Deno. **Stage 1 of 2: development and testing only.** The functions themselves still deploy to Supabase until the cut-over, because production Tim is served from there.
- **104 tests moved from `deno test` to vitest** (a vitest config next to the functions, removed when they moved into the server): tim 75, embed 14, aliases 15. The conversion is `Deno.test(` → `test(` and nothing else. **104 = 104.** **Seen failing:** breaking `extractHeight` fails two of them.
- **Type checking:** the tests joined `tsconfig` (with `allowImportingTsExtensions`). The project is stricter than Deno (`noUncheckedIndexedAccess`), and it found 4 index accesses in `aliases` that were fixed.
- `setup-deno` was removed from 3 workflows (deploy-tim, content-and-verify, team1-publish), and the QA gate label and CLAUDE.md were updated.
- **Proof:** `npm run qa` passes **on a PATH with no Deno at all**.
- 🔴 **A gap that was found and closed:** the secret scanner checked only files tracked by git, so in `e79babb` a file (`db-local-pg.sh`) with a local connection string plus password went in, even though the gate passed before it was added. The scanner now also checks new files that aren't ignored (`--others --exclude-standard`), and the local database runs with no password (`trust`, `127.0.0.1` only).

**Stage 2 (the cut-over, once the server is hosted, O1):** the files move into `apps/server/src/`, the `Deno.serve` wrappers are removed, and `supabase/functions/` and `deploy-tim.yml` are deleted.

### 4b ✅ The Edge Function logic in the server (26.09.2026)
Alon: "I can't see the Tim endpoint in the server, the prompt and the business logic." Until now the server imported them from `supabase/functions/`.
- **4b-1:** `supabase/functions/{tim,embed,aliases}` → `apps/server/src/{tim,embed,aliases}/` with `git mv`, no logic change. The tests came with them (server 115 = 11 + 104). `supabase/functions/` was deleted.
- **4b-2: only one source for the server and production.** The Deno wrapper came out of the logic into `apps/server/src/edge/<name>.ts`, **the only files that know Deno**. `npm run build:edge` combines entry plus logic into one file per function (`apps/server/dist/edge/<name>/index.ts`), with no imports. `deploy-tim.yml` builds and deploys it instead of copying the source.
  - `// @ts-nocheck` at the top of the bundle: esbuild outputs JavaScript without types, and `deno check` failed on it. The types are checked on the source (`tsc`). With the line, `deno check` passes on all three, so the deploy doesn't depend on whether Supabase type-checks.
  - **Checked under Deno, the way Supabase runs it:** Tim → `diagnose` returns the stamps, `empty_question`, 405. embed/aliases → `not_configured` without a secret.
  - `edge-bundle.test.ts` (5): one file with no imports per function; `Deno.serve`; Tim's stamp in the bundle matches the source; the logic doesn't touch Deno. **Seen failing:** an `import "node:crypto"` in the entry survived into the bundle and was caught.
  - `DEPLOY_STAMP`: the move and the wrapper removal changed Tim's file, `ec19a9c84648` → `f08adffa5669`. Production will show the old stamp until the next deploy.
- `docs/architecture/edge-functions-slugs.md`: for a manual deploy of embed/aliases, **paste the file from `dist/edge/`**, not the source (the source alone has no entry and wouldn't answer).
- **Tests:** `npm run qa` passes · web 307 · server **120**.

### 4c ✅ embed and aliases in the pipeline, not in the server (26.09.2026)
Alon: "the embedding should be a separate server and pipeline, not the same BFF." Embeddings and aliases are batch data processing, not serving the site.
- **`apps/pipeline/`**, a third workspace: `src/enrich/{embed,aliases}.ts` (the logic, from the server, with its tests), `src/edge/{embed,aliases}.ts` (the Supabase entries), and **`apps/pipeline/src/cli.ts`, a job runner with no HTTP server in between**: `npm -w apps/pipeline run embed`. It calls the function directly and repeats until `remaining` is 0 (the database is the queue). It waits a minute on a 429 and gives up after 6 in a row. **The first real run against the local database:** one call, `remaining: 0`, `done`.
- **The server (BFF) keeps only Tim:** the `/internal/embed` and `/internal/aliases` routes were removed, along with their 4 tests. `build:edge` in the server builds only Tim; the pipeline builds embed and aliases. `npm run build:edge` at the root builds both.
- Tests: the runner (5: until nothing remains, the secret on every call, waiting on 429, giving up after 6, stopping on any other error, no infinite loop) and the pipeline bundles (4). **Seen failing:** removing the wait on a 429.
- ⚠️ **What hasn't changed yet:** CI (`ci-content.sh`) keeps calling embed **on Supabase**. Switching it to the pipeline requires giving GitHub the Gemini key (a secret), which is a separate decision. The rest of O9 (the content, import, seeds, team 1) stays open.

### 4d ✅ Tim split into modules (26.09.2026)
Alon: "I can't see the prompt and the business logic." Tim was one file of 1,516 lines, and `handle()` inside it was a single function of about 500 lines, with the database calls and the model call written inline.
```
apps/server/src/tim/
  index.ts       public API (importers didn't change)
  handler.ts     the flow, 158 lines: validate → limit → fetch → model → filter → log → answer
  prompt.ts      Tim's instructions + the fit rules from he.json
  context.ts     what the model sees: formatExperiences/Candidates/Chunks, composeContext
  understand.ts  extractHeight, extractRideName, wantsRecommendation, readHistory
  lookup.ts      findRides, findCandidates, retrieveKnowledge (+ the row types)
  gemini.ts      askGemini (retries), readAnswer, readUsage
  rate-limit.ts  dbAccess, checkRateLimit, bucketKey
  safety.ts      scrubAnswer · turn-log.ts logTurn, wasAnswered
  config.ts · diagnose.ts · http.ts (Fail, CORS) · stamp.ts
```
- **4d-1, a move only:** a script on the TypeScript compiler (symbol resolution, not text search). A coverage check confirmed every one of the original's 65,483 characters landed in exactly one module, with no circular dependency. The 75 tests passed unchanged.
- **4d-2, `handle()` as a flow:** each inline block became a function in its module, **with its comments carried verbatim** by line range, not rewritten. A step that can't continue returns `Fail`, exactly the response that was once written inside `handle`. The 75 tests passed, and the test file wasn't touched. The extraction script stopped three times on its own checks (indentation, a check that was too broad, a block boundary), and each time the folder was reset to the committed state before retrying.
- **4d-3, the tests by module:** 75 → handler 50 (the flow through `handle`), context 17, understand 5, config/rate-limit/safety 1 each. Shared helpers in `test-helpers.ts`.
- **The stamp:** it now covers **the whole folder** (every deployed module plus Supabase's entry, including file names), not one file. Otherwise a change in `gemini.ts` would have left it the same, repeating `FIT_STAMP`'s mistake. **Seen failing** when only `gemini.ts` changed. Test helpers are excluded (they aren't deployed), which was also checked. `d3ece6b34e7c`.
- `build-tim-prompt` writes into `prompt.ts`. paths: `TIM_DIR/PROMPT/STAMP/EDGE`.
- **Checked:** the Supabase bundle under Deno (`diagnose`, `empty_question`, 405, missing database). A real question to the local server went through validation, the rate limit and retrieval, and stopped at a 503 from Google.
- **Tests:** `npm run qa` passes · web 307 · server 85 · pipeline 38.

### O6 — ✅ Closed 26.09 (the baseline, Stage 2b) · The migrations can't build a database from scratch · found 25.09 on a local database
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

### O8 — Production compared with what the migrations build · 25.09, read-only access (`reviewer_readonly`)
The system catalog of production compared object by object with the local database built by the 48 migrations. Separating out the measurement artifacts (how `vector` is displayed per `search_path`, and the two rate-limit functions I changed locally), this is what's left:

**✅ The schema is identical.** Every table, column, constraint, index and trigger. **That's strong evidence all 48 migrations ran in production**, even though the log couldn't be read (below).

**Differences, all of which the migrations don't encode:**
1. 🔴 **Table permissions: production is stricter than the migrations.** In production `anon`/`authenticated` have **SELECT only** on the tables. The migrations (plus Supabase's default privileges) give them SELECT+INSERT+UPDATE+DELETE. Row-level security protects in both, but **a database rebuilt from the migrations would be more open than production.** Two exceptions in the other direction: `usage_today` (production SELECT, migrations none) and `unanswered_turns` (production none, migrations everything).
2. **Function execution:** in production `anon` can't run `ingest_check`, `record_migration` or `unanswered_sample`. In the migrations it can.
3. **Roles and policies created by hand in production only:** `team1_content` with 4 policies on the knowledge tables (from `data/deploy/team1-role.txt`), `reviewer_readonly` (Kody, today), and `rls_auto_enable` (apparently a Supabase platform function).
4. Two functions differ only in comments and whitespace (`knowledge_chunk_content_changed`, `save_tester_note`).

🔴 **Security: `tester_key()` holds the real key of the testers' feedback channel in its code.** Function code is readable by **every** user in the database, so `reviewer_readonly`, which has no access to the table, saw it. The key needs rotating, and it should be stored as a hash in a closed table (like `ingest_key`), not in code.

⚠️ **The migration log (`schema_migration`) can't be read:** `reviewer_readonly` has SELECT, but row-level security (forced) hides every row. Needs a read policy for it.

**What this means for the baseline:** the baseline has to encode **production**, not the migrations. That means the stricter permissions, the roles, and the team 1 policies. And it needs a test: a database built from the baseline has to be identical to production in the same catalog comparison.

### O9 — The data pipeline is separate from the server · raised by Alon 25.09 · waiting on: a decision
**Alon's observation:** collecting, processing and embedding data is an independent process, not part of the server. Today it's scattered: part in `scripts/`, the content in `apps/server/content/`, and `embed`/`aliases` as HTTP routes in the server.

**The flow map (checked against the code):**
1. **Attractions:** master Excel (outside the repo) → `build-product-export.py` → `product_export.csv` + patches → `import-content.ts` (zod) → `experiences.json` (also bundled in the browser) → `build-content-seed.py` → ✋ pasted by hand → `experience`/`land` → `aliases` (Gemini suggests) → `alias_candidate` → ✋ Paula's review → `aliases_i18n`.
2. **Official knowledge:** `knowledge/*.md` → `check-knowledge.py` → `build-knowledge-seed.py` → 🤖 CI on push to release (`ci-content.sh`, only what changed) → `knowledge_doc`/`chunk` → a trigger resets the embedding when content changes → `embed` picks up whatever has none (**the database is the queue**) → retrieval check. In parallel: park-character guides → `build-park-intro.py` → `park.intro_he`.
3. **Community (team 1):** Apify/Facebook → `team1-fetch.sh` → `team1-inbox/` → scraper → gatekeeper → organizer (agents) → `team1-write.sh` (`team1_content`: T4, draft) → `embed` → verifier.
4. **Out, at runtime:** Tim → `find_experiences` + `park_candidates` + `match_knowledge` → Gemini → answer → `turn_log`.

**What stands out:** there are 3 paths into the database, each with a different role (manual paste, `ci_content`, `team1_content`). Flow 1 is the most manual. `embed` is shared by flows 2–3 and already works on the "whatever's missing" principle.

**Proposal:** `apps/pipeline/`, **split by flow**: `attractions/`, `knowledge/`, `community/`, plus shared `enrich/` (embed, aliases as CLI jobs, not routes), `verify/`, and `content/` (the sources). Each flow runs source → build (in the repo, deterministic) → load (database role) → enrich (Gemini) → verify. `db/` shared at the root. The server keeps only Tim. `scripts/` keeps only repo tooling.

**Waiting on Alon:** split by flow or by stage, and where `db/` goes. Before this: Stage 2 (a dbmate baseline matching production, O6/O8).

### O10 — `anon` has `TRUNCATE` on the tables in production · found 26.09 · for Guy
While generating the baseline's permissions from production's catalog: `anon` and `authenticated` have `TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` on the content tables (e.g. `experience`, `knowledge_doc`), and **row-level security doesn't apply to `TRUNCATE`.** Practical risk is low: `anon` can't log in directly, and PostgREST doesn't expose `TRUNCATE`. But it's a permission nobody needs. The baseline reproduces it **as it is**, because its job is to describe production, not fix it. **Proposal:** a dbmate migration that revokes `TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` from `anon, authenticated`. That's the first migration dbmate would run, once O2 is approved.

### O11 — `diagnose` lists the host's environment variable names · found 26.09 · for Guy · **blocks O1 step 4**
`{"diagnose": true}` returns `other_names`: the name of every environment variable in the process. On Supabase that is the function's own secrets. On Node, and on Netlify (AWS Lambda), it is **the whole process environment** — seen locally: dozens of names that have nothing to do with Tim. Names only, no values, but it maps the host for anyone who calls it. **Proposal:** return only the names Tim knows (`known`), and drop `other_names`. Changes the stamp.

### O12 — A Gemini quota error is described as temporary load · found 26.09
On a 429 "You exceeded your current quota", Tim's `hint` says Google is busy and it is temporary. A quota does not reset by waiting a minute, so whoever reads the hint waits for something that won't fix itself. **Proposal:** tell quota from overload by the upstream message. Changes the stamp.

### O13 — Tim as an agent with tools · decided by Alon (26.09): **four tools** · ✅ **the agent runs on staging (01.10)**
**Built 01.10, in its own files (Alon):** `apps/server/src/tim/agent.ts` (the loop), `tools.ts` (the four declarations, argument checks, execution), `agent-prompt.ts` (when to call which tool — **in English**, Alon; the answer stays Hebrew), and `generate()` in `gemini.ts` (a call with tools). `handler.ts` runs the agent when the host has a direct connection (staging) and the classic flow when it does not (production on Supabase Edge) — no flag. The classic lookups lost their direct branches: with a direct connection the agent runs instead.
- **The loop:** knowledge fetched up front · Gemini chooses tools · calls of one round run together · **at most 2 tool rounds**, then one call with `mode: NONE` · less than 20s left → no tools · at most 4 calls a round (the rest answered "not run") · **the model's turn sent back verbatim** (Gemini 3 thought signatures) · tokens added up over all calls.
- **Tools never throw:** a failure or a timeout is a result the model reads ("do not answer this from memory"); `query_rides` returns the held-back counts as a sentence the model is told to say.
- **Debug log (Alon):** the line gains `agent: { rounds, model_calls, stop, calls: [{ round, tool, args, ms, rows, ok, timeout? }] }`. **The family's words are not in it:** a ride name / search / land is logged as its length, a child's height as "given"; parks, filters and limits as values. For Guy (O2): it is a new kind of data in the log, built not to identify anyone.
- **Checked:** 14 tool tests, 9 loop tests, 1 log test — 10 seen failing on a broken copy (signature dropped, a third round, no cap, last call's tokens only, name in the log, no clamp, no held-back line, no fit). Against **the real Gemini API** and the local database: the three agent cases that fail today — Epic for 100 cm (`query_rides`, 6 rides), TRON vs Space Mountain (two `find_ride` in one round), and the Hagrid follow-up (name from the history, 122 cm) — **all answered from the data.** 4.5–10s.
- **Measured on staging after it went live (01.10):** set questions took ~20s, and the two-children question took **three rounds and ended with no answer** — the model spent its rounds one height at a time, and on the last call **ignored `mode: NONE`** and asked for a tool anyway.
- **Smarter rounds (01.10, Alon: "the tools need to take a list of cases, not one").** A family's question is about a group:
  - `query_rides` takes `parks`, `categories` (the ride's form), and **`group: [{age, height_cm}]`** with `group_fit: everyone | anyone`. The fit is `fitFor` — **the screen chip's rule** (decisions 1b and C included) — in the shared filters (`classify`), so Tim says what the screen shows. Under each ride, a line says who in the group can ride it and why not. A member with no age is read as a child (as an adult, a minimum would be cleared unmeasured).
  - `find_ride` takes `names` (a comparison in one call) and a `group`; `park_candidates` takes a `group` (only rides one of them can ride; the unknowns counted).
  - Lists reach Postgres as one JSON text parameter — `sql.array` is sent as plain text with `prepare: false`, and a `jsonb`-typed parameter is encoded twice. An injection attempt in a park name returned 0 rows.
  - The instructions: plan every call in the first round, with examples of question → call; always answer in Hebrew (an answer came out in English once the rules were English); never repeat a query without its filters.
  - **The `NONE` bug:** the last call says "answer now" in words too, and if Gemini still calls a tool, one more call goes out with **no tools declared and no tool turns** — the results as text. `agent.fallback` in the log line counts it.
  - **Measured again, the same questions:** Epic for 100 cm — 1 round, 6 rows, 16.8s (was 2 rounds, 20 rows, English, 23.3s); two children — **1 round, 1 row (Hippogriff), 13.6s** (was 3 rounds, no answer); TRON vs Space Mountain — one call with two names, 11.8s. What is left is the answer call's thinking (~1,900 tokens, 8.6–9.7s) — the next step — and the database in Singapore.
  - Parity (`npm run parity:query-rides`) with four group cases: **308/308.** Tests: 6 shared (seen failing first), 10 tools and 1 loop (seen failing on a broken copy / before the fix).
- **`find_ride`'s search made language-neutral (01.10, Alon: "the tools should be generic, not coupled to a language").** Run on all 51 eval questions, the agent passed **clean English names every time** — a Hebrew question, a prefix ("בספייס"), a typo ("velocicoster") all arrived normalised. So the search's Hebrew prefix stripping never fired, and it is gone; and the names it matches are **every name in every language the data holds** (`name`, each `name_i18n` value, each `aliases_i18n` value), not `->>'he'`. The word scoring stays: compared on the agent's 20 real names, it found 19/20 with 24 rows, against plain substring 17/20 (it misses "Tron Lightcycle Run" and a hyphen for an en dash) and `pg_trgm` 19/20 with 35–44 rows (noise). `npm run eval:ride-names` holds the 20 names, three Hebrew names from the data, and `--fixtures` (local, rolled back): **a French name added as data is found — the old Hebrew-only query fails it.** `parity:find-experiences` is retired: the server's search now differs from the function on prefixed Hebrew input, by design. Production's classic Tim keeps the function, prefixes and all, until the cut-over.
- **Not yet:** Paula's review of `agent-prompt.ts`; the golden set and `tim:compare` against production (when Alon asks).
**Why:** today the question is understood by regex (`understand.ts`). It misses Hebrew prefixes, spelling, and follow-ups — retrieval ignores the history entirely. Seen on "מה גובה המינימום ב-Space Mountain לילד בגובה 110?": the extracted "name" was `ב-Space Mountain לילד`, and the database returned Big Thunder Mountain and Expedition Everest alongside Space Mountain.

**The four tools** (read-only, typed parameters, no free SQL):
| Tool | Answers |
|---|---|
| `find_ride(name, height_cm?)` | a named ride — a closed one is returned with its status |
| `query_rides(filters)` — **new** | set questions: park, land, kind, max intensity, height, sensitivities to avoid, open only, `per_park`, capped rows. **Server code, not a database function** (Alon, 26.09 — see below): a plain filtered query, with the fit computed by the shared TypeScript function. 🔴 A filter never turns an unknown into a match. |
| `park_candidates(preferences?)` | "which park suits us" — kept (Alon) |
| `search_knowledge(query, resort?, park?)` | prose; the model may rephrase, e.g. from the history. `resort` (`wdw`/`uor`) uses the `p_resort` filter `match_knowledge` already has and Tim never passes; `park` needs a small migration (a `scope_park` filter — the column exists on every chunk and the search ignores it). |

**Where the logic lives — decided by Alon (26.09): product logic in TypeScript, integrity in the database.**
The database holds logic today because there was no server: the browser talked to it with a public key, so a rule outside the database could be bypassed. Once the server is the only path (stage 4) that reason is gone, and logic in SQL costs what it always costs — hard to test (one SQL test today), deployed by a migration someone has to run, invisible to the log.
- **Stays in the database:** constraints and invariants (the `CHECK`s on `turn_log`), atomic operations (`check_rate_limit`), set queries next to their index (`match_knowledge`), the embedding-invalidation trigger.
- **Belongs in TypeScript:** product decisions that change — the fit computation, the candidate-selection policy.
- 🔴 **The fit is already computed twice:** `fitFor` in `apps/web/src/lib/group.ts`, and a `CASE` inside `find_experiences`. Two sources of truth for one rule. So **`query_rides` depends on moving `fitFor` into `packages/shared`** (part of stage 5) with its NULL rules and tests, and both the web app and the server use it. Building `query_rides` as another SQL function would have deepened the duplication.
- **Existing functions are not rewritten.** Each moves when it is touched anyway: `find_experiences`'s fit with `packages/shared`; `ingest_*` / `alias_*` when the pipeline gets its own role instead of a secret argument; `save_tester_note` through the server.

**`query_rides` — built (30.09), not yet called by anyone.** `apps/server/src/db/query-rides.ts`: park and land are lookups in SQL (id or name, like `find_experiences`); **the rules are the web app's `matchesFilters`, moved to `packages/shared/src/filters.ts`** — its own comment said it was written "so the later model layer calls this", so building a third copy on the server was the thing to avoid. The web app's `recommend.ts` and `sensitivity.ts` keep their APIs and feed the shared rules (`apps/web/src/lib/ride-facts.ts`); their tests passed unchanged. New in the shared rules: a `heightCm` filter (fit.ts — only "fits" is a match), and `classify`, which says **why** a ride is out, so the tool returns `heldBack: { unrated, sensitivityUnchecked, heightUnknown }` next to the rows — the unknowns are counted, never dropped in silence. Capped: 20 rows by default, 40 at most, and `perPark`; `matched` says how many there were before the caps.
**Checked:** `npm run parity:query-rides` runs the same 24 filter sets on all parks and on each park — the web app over its JSON, the server over the database — and compares the matching ride ids and the held-back counts: **264/264 identical locally.** Negative controls on the server's row mapping (coming soon read as closed, dark read from strobe, the ceiling dropped, Single Pass ignored) — all caught (71, 28, 8, 7). Shared tests 32 (4 new-behaviour tests seen failing on the web app's old semantics); `query_rides` tests 5 (seen failing on a broken copy).
**Paula's open question below is answered by what the web app already did:** a ride whose sensitivity nobody checked is **out** by default (`includeUncheckedSensitivity`), and now also **counted**. Still hers to confirm for Tim.

**Why not a generic SQL tool:** raw rows skip `formatExperiences`, where every state gets a word — and NULL read as "no limit" is the pattern CLAUDE.md counts seven times. Also a second source of truth for "fits", source columns reachable, and arbitrary queries (Guy).

**Guardrails:** knowledge is still fetched up front, in parallel with the first call · at most 2 tool rounds · a ride or height in the answer with no `find_ride`/`query_rides` row behind it is flagged in the log (measure first, don't block) · `rides`/`chunks` counted from tool results so the golden set keeps working.

**No `TIM_MODE` — staging runs the agent only (Alon, 01.10).** The comparison is production (today's Tim, a snapshot) against staging (the agent), through `tim:compare`; a flag would only have kept two Tims alive on one branch.
🔴 **A trap for the cut-over:** `deploy-tim.yml` builds `tim/` for Supabase Edge on every push to `release`. The agent needs the direct connection (`query_rides` has no RPC path), which Edge does not have — so merging this branch into `release` would deploy a Tim that cannot run its tools. **The Edge deploy is retired in the same step that moves production to Netlify**, not after it.
**How it is decided with data:** the golden set on both (pass rate, p95, "answered from memory"), plus the follow-up, misspelling and set cases. Cost to expect: 2+ Gemini calls, ~6–9s instead of ~4.5s. (Until 01.10 this said "behind `TIM_MODE=agent|classic`" — superseded above.)

**Open:**
- `query_rides` "avoid" on a sensitivity that was never checked: excluded (proposed) or shown with "לא ידוע" — **Paula**.
- New golden cases, and the change in Tim's behaviour — **Paula**. A tool that reads the database — **Guy (O2)**.
- `park_candidates` as it is today: up to 3 rides **per park and per intensity level** (up to 84 rows), picked **alphabetically** within each level. The comment in `lookup.ts` says "3 per park". Recorded, not changed.

### O14 — The knowledge chunks reach Gemini without their document's title · found 26.09 · next task
`match_knowledge` returns `title`, but `formatChunks` (`apps/server/src/tim/context.ts`) sends only the chunk text, which starts with its `##` heading. So Gemini gets "## למי נדרש כרטיס?" ("who needs a ticket?") without "Child Swap — יוניברסל אורלנדו" — **and can't tell whether a chunk is about Disney or Universal** unless the text says so. That is part of how an unrelated Disney chunk (strollers) sat in the context of a Space Mountain question.

**The fix:** the title in each chunk's label — `[קטע 2 · Child Swap — יוניברסל אורלנדו · יציב · נבדק 2026-09-01]`. One change in `formatChunks`, plus a test seen failing first. Independent of the agent (O13).

⚠️ It changes what Gemini sees, i.e. Tim's behaviour: `npm run golden` before and after, and the change in the stamp.

### O15 — Production's data differs from the repo's seeds · found 29.09 comparing production with staging (read-only)
Every row hashed on both sides (timestamps, chunk ids and embeddings excluded):
| Table | Production | Staging | Identical |
|---|---|---|---|
| `park` | 10 | 10 | 10 ✅ |
| `experience` | 242 | 242 | **240** |
| `land` | 80 | 78 | 78 — production has 2 more |
| `knowledge_doc` / `knowledge_chunk` | **not visible** | 66 / 314 | — |

- 🔴 **Two water rides, `height_requirement_cm`: production `NULL`, the repo `0`.** Bay Slides and Ketchakiddee Creek (Typhoon Lagoon). The repo — `experiences.json` and the content seed — says *checked, no minimum* (with a maximum of 152 and 122 cm); production says *not checked*. So production's Tim says "the height limit was not checked" where the repo has an answer: the content fix never reached production. **Which is right is Paula's; production is not touched from here.**
- **Two lands exist only in production** (`epcot-world-showcase-italy`, `ioa-the-lost-continent`), with **no ride pointing at them**. Orphans outside the seed.
- **Knowledge could not be compared:** `reviewer_readonly` has no RLS policy on `knowledge_doc`/`knowledge_chunk` (only admin, `ci_content`, `team1_content`), so it sees 0 rows — that is the policy, not an empty table. Comparing needs a role that can read them (Guy).

### O16 — `check_rate_limit` counts, then inserts — not atomic · found 30.09 reading the function
The function (`apps/server/db/migrations/20260926000000_baseline.sql`) checks three caps — global 600/24h, per bucket 20/60min and 60/24h — each with `select count(*) from api_call …`, and only then `insert into api_call`. Under `READ COMMITTED` two concurrent requests from the same bucket both count 19, both pass, and the bucket ends at 21. **The race described as a risk of moving it to the server exists today, inside the database.** In practice the overshoot is bounded by how many requests arrive at the same instant, so it is tolerable for a rate limit — but it is not the guarantee it reads like.

**When it moves (the last of the five), it is built atomic from the start:** a counter row per bucket and window updated in one statement (`INSERT … ON CONFLICT (bucket, window_start) DO UPDATE SET n = n + 1 … RETURNING n`), or `pg_advisory_xact_lock(hashtext(bucket))` around the count and the insert — and a **test that fires parallel requests** against a real database (`npm run db:local-pg`) and fails if any bucket passes its cap. Seen failing on today's function first.

Related, for Guy (O10): `anon` has `SELECT` and `TRUNCATE` on `api_call`. Reading exposes only hashes and times; `TRUNCATE` would wipe the rate limit, though PostgREST does not expose it.

### O17 — `park_candidates` is almost never called: the recommendation path has not worked since it was added · found 30.09 moving the function
`findCandidates` runs only when **no ride name** was extracted and the question asks us to choose (`if (asked || !wantsRecommendation(question)) return []`). But `extractRideName` is a stop-word stripper, and it leaves a "name" in nearly every recommendation question: "מעדיפים פארקים עם תפאורה יפה" → "מעדיפים תפאורה יפה", "מה תמליצו לנו?" → "תמליצו", "תכננו לנו יום" → "תכננו יום", "המלצה לפארק למשפחה עם ילדים קטנים" → "המלצה לפארק למשפחה ילדים קטנים". Of eight recommendation questions tried, **none** reached the candidates. The 09.09 version of `extractRideName` (commit `74df843`, the one that added the path as Paula's fix) gives the same results — **so Paula's example, the one the code's comment cites, never got candidates.** No test covered the path through the handler; the tests checked the RPC call, not whether a real question arrives at it.
Also: `wantsRecommendation("איזה פארק מתאים לנו?")` is `false` — the pattern expects `מתאימ`, and the word ends in a final mem (`מתאים`).
**Not fixed in the move** — a copy stays a copy. The fix is its own step, with a test that goes through `handle()` with Paula's question. Two ways: decide recommendation **before** extracting a name (a recommendation question skips `findRides`), or let `find_experiences` return no rows count as "no name". **The agent (O13) removes the problem by design:** the model decides to call `park_candidates`, no regex does. Paula should know her 09.09 fix did not take effect.

### O18 — `find_ride` by meaning when the words are not sure · measured 01.10 · **backlog (Alon)**
**The experiment** (in memory, no database change): the 242 rides embedded with `gemini-embedding-001` (names in all languages + park, land, type — the data has **no description**: `descriptionHe` is empty on every row), against today's word search, on the agent's 20 real names and on 10 descriptions with no name.
| | real names — first / top 6 | descriptions — first / top 6 |
|---|---|---|
| words (today) | 18/20 · 19/20 | **0/10** · 1/10 |
| semantic, names | 19/20 · 20/20 | 6/10 · 9/10 |
| semantic, names + park/land/type | 19/20 · 20/20 | **8/10** · 9/10 |
"Fly on a banshee on Pandora" → Avatar Flight of Passage; "spinning teacups" → Mad Tea Party; "the coaster with the yeti" → Everest — from the model's knowledge of the names alone. Both fail on Hebrew descriptions ("רכבת ההרים עם היטי" → Big Thunder); the agent passes English, as measured.
🔴 **Found on the way — a risk in today's search:** on a description the words do not just miss, they return **a wrong ride as if it matched** — "the coaster with the yeti" → "Living with the Land", because "with" and "the" count. Today the agent passes names, so it has not happened; if it ever passes a description, the model gets the wrong ride.
**The design (not built):** words first; **if every word of the name matched one ride**, that is the answer (3–4ms, the usual case). Otherwise — a partial match or none — by meaning. That sends exactly the "Living with the Land" case to the embedding.
**What it takes:** an embedding column on `experience` (a migration) · a pipeline step that fills it (`apps/pipeline`, like the knowledge chunks) · a freshness test — a derived field goes stale silently (CLAUDE.md) · one embedding call per unsure lookup (300–600ms) · `npm run eval:ride-names` extended with the 10 descriptions, and a threshold for them.
