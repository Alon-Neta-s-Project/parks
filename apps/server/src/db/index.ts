import type { DirectQueries } from "../tim/lookup";
import { connect } from "./client";
import { findExperiences } from "./find-experiences";
import { matchKnowledge } from "./match-knowledge";
import { parkCandidates } from "./park-candidates";
import { queryRides } from "./query-rides";

/**
 * The direct queries, for a host that has `DATABASE_URL`. Without it: `undefined`, and
 * Tim uses the database functions over PostgREST exactly as before.
 * Covers find_experiences, match_knowledge and park_candidates — and query_rides, which has no
 * database function: it exists only here (O13).
 */
export function directQueries(url: string | undefined): DirectQueries | undefined {
  if (!url?.trim()) return undefined;
  const sql = connect(url);
  return {
    findExperiences: (p, signal) => findExperiences(sql, p, signal),
    matchKnowledge: (p, signal) => matchKnowledge(sql, p, signal),
    parkCandidates: (p, signal) => parkCandidates(sql, p, signal),
    queryRides: (p, signal) => queryRides(sql, p, signal),
  };
}
