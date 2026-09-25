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
| 1 | npm workspaces and moving folders into the layout above, with no behavior change | Not started |
| 2 | Migrations with dbmate, run from CI with an approval gate | Not started |
| 3 | Port Tim, `embed` and `aliases` to the Node server, running alongside the Edge Function | Not started |
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
