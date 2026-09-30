import type { DirectQueries } from "../tim/lookup";
import { connect } from "./client";
import { findExperiences } from "./find-experiences";

/**
 * The direct queries, for a host that has `DATABASE_URL`. Without it: `undefined`, and
 * Tim uses the database functions over PostgREST exactly as before.
 */
export function directQueries(url: string | undefined): DirectQueries | undefined {
  if (!url?.trim()) return undefined;
  const sql = connect(url);
  return { findExperiences: (p) => findExperiences(sql, p) };
}
