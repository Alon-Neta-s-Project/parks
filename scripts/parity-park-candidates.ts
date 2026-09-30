/**
 * Parity: the database function `park_candidates` against the server's copy of it
 * (apps/server/src/db/park-candidates.ts), on the same database.
 *
 *   PARITY_DATABASE_URL=postgresql://… npx tsx scripts/parity-park-candidates.ts [--fixtures]
 *   npm run parity:park-candidates            # reads DATABASE_URL from .env.staging
 *
 * 🔴 **Any difference fails** — which rides, in which order, every field.
 *
 * Inputs: the one parameter, over every value that means something — null (the default, 4),
 * negative and 0 (clamped to 1), 1–10, and far above any park's count.
 * Read-only: two SELECTs per input.
 *
 * 🔴 **`--fixtures` (local only): the intensity rule.** Every ride is rated on both databases,
 * so the data alone cannot tell whether an unrated ride is kept out (CLAUDE.md) — a copy
 * without `e.intensity is not null` would pass. In one transaction that is rolled back, an
 * open theme-park attraction loses its rating: both sides must match and **neither may return
 * it**. Refused on any host but localhost — it writes, even if rolled back.
 *
 * ⚠️ **Only on a database that still has the function.**
 */
import { connect } from "../apps/server/src/db/client";
import { parkCandidates } from "../apps/server/src/db/park-candidates";

const url = process.env.PARITY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("🔴 PARITY_DATABASE_URL (or DATABASE_URL) is not set");
  process.exit(1);
}
// Before connecting: --fixtures writes (and rolls back), so only on a local database.
const host = new URL(url).hostname;
if (process.argv.includes("--fixtures") && host !== "127.0.0.1" && host !== "localhost") {
  console.error(`🔴 --fixtures writes (and rolls back) — refused on ${host}`);
  process.exit(1);
}
const sql = connect(url);

const inputs: (number | null)[] = [null, -5, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 50, 1000];

const old = (db: typeof sql, perPark: number | null) => db`
  select park, name, name_he, land, category, intensity, height_cm, max_height_cm, gets_wet
  from public.park_candidates(${perPark}::int)`;

let same = 0;
let rows = 0;
const diffs: string[] = [];
for (const perPark of inputs) {
  const [a, b] = await Promise.all([old(sql, perPark), parkCandidates(sql, { perPark })]);
  rows += a.length;
  if (JSON.stringify([...a]) === JSON.stringify([...b])) same++;
  else diffs.push(`perPark=${perPark}: function ${a.length} rows · server ${b.length} rows`);
}

// ── Fixtures: an unrated ride (local only) ──
const fixtures: string[] = [];
if (process.argv.includes("--fixtures")) {
  await sql.begin(async (tx) => {
    const db = tx as unknown as typeof sql;
    // A ride that is a candidate today at perPark=1000, so only the rule can keep it out.
    const [pick] = await db`
      select e.id, e.name from experience e join park p on p.id = e.park_id
      where p.park_kind = 'theme' and e.kind = 'attraction' and e.status = 'open' and e.intensity is not null
      order by e.id limit 1`;
    await db`update experience set intensity = null where id = ${pick!.id}`;
    const a = await old(db, 1000);
    const b = await parkCandidates(db, { perPark: 1000 });
    const leaked = (rs: readonly { name?: unknown }[]) => rs.some((r) => r.name === pick!.name);
    const match = JSON.stringify([...a]) === JSON.stringify([...b]);
    fixtures.push(`${match && !leaked(a) && !leaked(b) ? "✅" : "✗"} unrated ride: function leaked=${leaked(a)} · server leaked=${leaked(b)} · same=${match}`);
    throw new Error("rollback");
  }).catch((e: Error) => { if (e.message !== "rollback") throw e; });
}
await sql.end();

console.log(`${same}/${inputs.length} identical · ${rows} rows compared · ${diffs.length} differ`);
for (const d of diffs) console.log("  ✗ " + d);
for (const f of fixtures) console.log("  " + f);
process.exit(diffs.length || fixtures.some((f) => f.startsWith("✗")) ? 1 : 0);
