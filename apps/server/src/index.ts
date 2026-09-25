import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createApp } from "./app";

const app = createApp({
  env: process.env,
  remoteAddress: (c) => getConnInfo(c).remote.address,
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`park-server listening on :${info.port}`);
});
