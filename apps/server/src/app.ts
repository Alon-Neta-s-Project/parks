import { Hono, type Context } from "hono";
// ⚠️ Until the cut-over (docs/refactor-server-split.md, stage 4) the server and the
// Edge Function run the *same file*. A copy here would be a second Tim that drifts
// from the one that is live, and the file is stamped (DEPLOY_STAMP), so it is not
// edited to move it either. In stage 4 it moves into apps/server for real.
import { handle as tim } from "./tim/index";
import { handle as embed } from "./embed/index";
import { handle as aliases } from "./aliases/index";

export type Env = Record<string, string | undefined>;

export interface AppOptions {
  env: Env;
  /** The socket's address. Injected, so the app is testable without a network. */
  remoteAddress?: (c: Context) => string | undefined;
}

/**
 * The client IP that the rate limit is keyed on.
 *
 * 🔴 **Tim reads the first entry of `x-forwarded-for`.** On Supabase that header is
 * written by their edge. On our own server any caller can send it, and a different
 * value per request is a fresh rate-limit bucket per request — the limit is gone.
 * So the header the caller sent is never trusted: the IP comes from the header the
 * host sets (`CLIENT_IP_HEADER`, e.g. `fly-client-ip`), or from the socket.
 */
export function clientIp(req: Request, env: Env, socket: string | undefined): string {
  const header = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (header) {
    const v = req.headers.get(header)?.split(",")[0]?.trim();
    if (v) return v;
  }
  return socket ?? "unknown";
}

async function withClientIp(req: Request, ip: string): Promise<Request> {
  const headers = new Headers(req.headers);
  headers.set("x-forwarded-for", ip);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(req.url, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
  });
}

export function createApp({ env, remoteAddress }: AppOptions): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  // `all`, not `post`: Tim answers OPTIONS (CORS) and 405 itself, as it does on Supabase.
  app.all("/tim", async (c) => {
    const req = await withClientIp(c.req.raw, clientIp(c.req.raw, env, remoteAddress?.(c)));
    try {
      return await tim(req, env);
    } catch (err) {
      // The same shape as the Deno.serve wrapper in the function file.
      return c.json({ error: "unhandled", detail: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Called by CI (ci-content.sh) and by hand, never by the browser. Each checks
  // x-ingest-secret itself, exactly as on Supabase — the route adds nothing and
  // removes nothing.
  for (const [path, fn] of [["/internal/embed", embed], ["/internal/aliases", aliases]] as const) {
    app.post(path, async (c) => {
      try {
        return await fn(c.req.raw, env);
      } catch (err) {
        return c.json({ error: "unhandled", detail: err instanceof Error ? err.message : String(err) }, 500);
      }
    });
  }

  return app;
}
