/**
 * Netlify's entry for the server — the only file here that Netlify loads.
 *
 * ⚠️ The logic is in apps/server/src; Netlify bundles this file with what it imports
 * (esbuild, `[functions]` in netlify.toml). The Node entry is apps/server/src/index.ts, and
 * Supabase's is apps/server/src/edge/tim.ts — one app, one entry per host.
 */
import { createNetlifyHandler } from "../../src/netlify";

export default createNetlifyHandler(process.env);

export const config = { path: "/api/*" };
