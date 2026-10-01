import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createApp } from "./app";
import { directQueries } from "./db/index";
import { noteStore } from "./db/tester-note";
import { emit } from "./tim/index";

const app = createApp({
  env: process.env,
  // ⚠️ Off unless DATABASE_URL is set: then find_experiences runs here, not in the database.
  direct: directQueries(process.env.DATABASE_URL),
  notes: noteStore(process.env.DATABASE_URL),
  remoteAddress: (c) => getConnInfo(c).remote.address,
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`park-server listening on :${info.port}`);
});

// ⚠️ A crash outside any request has no request line to land in. It gets a `fatal`
// line of its own before the process exits — only the name and the stack's frames:
// there is no request here to redact against, so no message.
const frames = (e: unknown) =>
  (e instanceof Error ? e.stack ?? "" : "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).slice(0, 6);
for (const event of ["uncaughtException", "unhandledRejection"] as const) {
  process.on(event, (err: unknown) => {
    emit({ level: "fatal", platform: "node", event, error: { name: err instanceof Error ? err.name : typeof err, stack: frames(err) } });
    process.exit(1);
  });
}
