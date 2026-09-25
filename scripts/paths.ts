import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import rel from "./paths.json";

/**
 * The one place that says where things live in the repo.
 *
 * ⚠️ The source is `paths.json`, shared with `paths.py` and with bash
 * (`python3 scripts/paths.py KEY`). A move edits that file, not sixty call sites.
 */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export type PathKey = keyof typeof rel;

/** Absolute paths, keyed as in paths.json. */
export const P = Object.fromEntries(
  Object.entries(rel).map(([k, v]) => [k, join(ROOT, v)]),
) as Record<PathKey, string>;

/** Paths relative to the repo root, for messages and git pathspecs. */
export const REL = rel as Record<PathKey, string>;
