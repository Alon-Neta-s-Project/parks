/**
 * Supabase entry for tim — the only file here that knows about Deno.
 *
 * ⚠️ **The logic lives in apps/server/src/tim/, and the server runs it directly.**
 * Supabase gets a single file built from this entry and the logic together
 * (npm run build:edge → apps/server/dist/edge/tim/index.ts), so there's one
 * source for both — not a copy someone forgets to update. In Supabase: quick-worker.
 *
 * ⚠️ Until the cutover (step 4 in the refactor doc) production answers from
 * here. After it, this file is deleted.
 */
import { handle, logged } from "../tim/index";

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { toObject(): Record<string, string | undefined> };
};

// ⚠️ The same log line as in Node and Netlify (tim/log.ts), and it catches
// exceptions — the browser gets a request ID, not the exception message.
Deno.serve((req) => logged(req, { platform: "supabase", route: "/tim" }, (r, host) => handle(r, Deno.env.toObject(), host)));
