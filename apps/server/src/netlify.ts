import { Hono } from "hono";
import { createApp, type Env } from "./app";

/**
 * The part of Netlify's function context the server uses.
 *
 * ⚠️ Declared here and not imported from `@netlify/functions`: two fields do not
 * justify a dependency, and the function file is the only place that knows Netlify.
 */
export interface NetlifyContext {
  /** The client address as Netlify's edge saw it. Not a header — the caller cannot set it. */
  ip: string;
}

type Bindings = { ip: string };

/**
 * The server on Netlify: the same app as on Node, mounted under `/api`.
 *
 * ⚠️ `/api` because the web app is served from the same site. Netlify passes the
 * full path, so the mount — not app.ts — owns the prefix.
 */
export function createNetlifyHandler(env: Env) {
  // `context.ip` travels as a Hono binding, the way the socket address does on Node.
  const inner = createApp({ env, remoteAddress: (c) => (c.env as Bindings | undefined)?.ip });
  const app = new Hono().route("/api", inner);
  return (req: Request, context: NetlifyContext) => app.fetch(req, { ip: context.ip } satisfies Bindings);
}
