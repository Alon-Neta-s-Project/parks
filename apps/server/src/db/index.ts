import type { DirectQueries } from "../tim/lookup";
import { connect } from "./client";
import { findExperiences } from "./find-experiences";
import { matchKnowledge } from "./match-knowledge";
import { parkCandidates } from "./park-candidates";

/**
 * The direct queries, for a host that has `DATABASE_URL`. Without it: `undefined`, and
 * Tim uses the database functions over PostgREST exactly as before.
 * Covers find_experiences, match_knowledge and park_candidates.
 */
export function directQueries(url: string | undefined): DirectQueries | undefined {
  if (!url?.trim()) return undefined;
  const sql = connect(url);
  return {
    findExperiences: (p) => findExperiences(sql, p),
    matchKnowledge: (p) => matchKnowledge(sql, p),
    parkCandidates: (p) => parkCandidates(sql, p),
  };
}
