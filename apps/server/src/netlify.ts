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
  /**
   * Keeps a promise alive after the response is sent — the turn log needs it.
   * Optional in the type: Netlify has it for functions deployed since 20.03.2025.
   */
  waitUntil?: (p: Promise<unknown>) => void;
}

type Bindings = { ip: string; waitUntil?: NetlifyContext["waitUntil"] };

/**
 * The server on Netlify: the same app as on Node, mounted under `/api`.
 *
 * ⚠️ `/api` because the web app is served from the same site. Netlify passes the
 * full path, so the mount — not app.ts — owns the prefix.
 */
export function createNetlifyHandler(env: Env) {
  // `context.ip` and `context.waitUntil` travel as Hono bindings, the way the socket
  // address does on Node.
  const inner = createApp({
    env,
    remoteAddress: (c) => (c.env as Bindings | undefined)?.ip,
    waitUntil: (c) => (c.env as Bindings | undefined)?.waitUntil,
  });
  const app = new Hono().route("/api", inner);
  return (req: Request, context: NetlifyContext) =>
    app.fetch(req, {
      ip: context.ip,
      // Bound: a method taken off its object must not lose it.
      waitUntil: context.waitUntil?.bind(context),
    } satisfies Bindings);
}
