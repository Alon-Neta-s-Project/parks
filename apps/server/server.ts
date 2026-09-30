/**
 * Vercel's entry for the server — Vercel detects a Hono app by a default export here
 * (a root-level `server.ts`, docs: "Hono on Vercel").
 *
 * ⚠️ A trial next to Netlify (Alon, 30.09), not a replacement for O1's decision. The logic
 * is in apps/server/src; the Node entry is apps/server/src/index.ts, Netlify's is
 * apps/server/netlify/functions/api.ts, Supabase's is apps/server/src/edge/tim.ts.
 */
import { waitUntil } from "@vercel/functions";
import { createApp } from "./src/app";

const app = createApp({
  // The object itself, not a copy: read per request.
  env: process.env,
  platform: "vercel",
  // 🔴 Vercel overwrites `x-real-ip` and `x-forwarded-for` at its edge "to prevent IP
  // spoofing" (its request-headers docs), so this is the client, not a caller's claim.
  remoteAddress: (c) => c.req.header("x-real-ip"),
  requestId: (c) => c.req.header("x-vercel-id"),
  // Keeps the turn log's write alive after the response (Fluid compute), like Netlify's.
  waitUntil: () => waitUntil,
});

export default app;
