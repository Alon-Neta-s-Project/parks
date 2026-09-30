/**
 * The commit this build was made from — which exact version is running.
 *
 * ⚠️ **`"dev"` in the repo, on purpose.** `scripts/write-build-info.mjs` replaces it at build
 * time from the host's own variable (Netlify `COMMIT_REF`, GitHub `GITHUB_SHA`); a local run
 * stays `"dev"`. Netlify's `COMMIT_REF` exists only during the build, not when the function
 * runs — so it is written into the code, not read at runtime.
 *
 * ⚠️ **Outside `tim/`, on purpose.** `DEPLOY_STAMP` hashes everything in `tim/`; a file the build
 * rewrites there would make the live stamp stop matching the repo's.
 */
export const COMMIT = "dev";

/** The baked commit — `"dev"` when no host wrote one. */
export function commit(): string {
  return COMMIT;
}
