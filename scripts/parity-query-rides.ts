/**
 * Parity: `query_rides` on the server (the database) against the web app's filter (its JSON),
 * over many filter combinations.
 *
 *   PARITY_DATABASE_URL=postgresql://… npx tsx scripts/parity-query-rides.ts
 *   npm run parity:query-rides            # reads DATABASE_URL from .env.staging
 *
 * 🔴 **Both sides run the same rules (packages/shared/src/filters.ts), so a difference is in
 * what feeds them:** the mapping of each side's row (apps/web/src/lib/ride-facts.ts,
 * apps/server/src/db/query-rides.ts `rowFacts`), or the data itself — the JSON the web app
 * ships against the database Tim reads. Either fails.
 *
 * Compared: which rides match (by id), and how many are held back as unknown (unrated,
 * unchecked sensitivity, unknown height). Park by the park each ride belongs to on each side;
 * land is not compared (the lookup is by name, and the names are the lookup's business).
 * Read-only.
 */
import { connect } from "../apps/server/src/db/client";
import { selectRides } from "../apps/server/src/db/query-rides";
import { experiences } from "../apps/web/src/data";
import { rideFacts } from "../apps/web/src/lib/ride-facts";
import { classify, type SearchFilters } from "../packages/shared/src/filters";

const url = process.env.PARITY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("🔴 PARITY_DATABASE_URL (or DATABASE_URL) is not set");
  process.exit(1);
}
const sql = connect(url);

// Each side names parks its own way; the rides' ids are the same on both, so they give the map.
const dbPark = new Map((await sql`select id, park_id from experience`).map((r) => [r.id as string, r.park_id as string]));
const parkIds = [...new Set(dbPark.values())].sort();

const presets: SearchFilters[] = [
  {}, { includeUnrated: true }, { includeClosed: true }, { excludeSinglePass: true },
  { kinds: ["attraction"] }, { kinds: ["entertainment"] },
  { intensityMax: 1 }, { intensityMax: 2 }, { intensityMin: 3 }, { intensityMin: 2, intensityMax: 3, includeUnrated: true },
  { avoidSensitivities: ["dark"] }, { avoidSensitivities: ["loudSudden", "strobe"] }, { avoidSensitivities: ["heights"] },
  { avoidSensitivities: ["accessibility"] }, { avoidSensitivities: ["motionSickness"] },
  { avoidSensitivities: ["dark", "loudSudden"], includeUncheckedSensitivity: true },
  { hasMotionSicknessWarning: true }, { hasMotionSicknessWarning: false },
  { heightCm: 95 }, { heightCm: 110 }, { heightCm: 125 }, { heightCm: 140 },
  { heightCm: 100, intensityMax: 2, avoidSensitivities: ["dark"] },
  { heightCm: 120, kinds: ["attraction"], hasMotionSicknessWarning: false, excludeSinglePass: true },
];

let same = 0;
const diffs: string[] = [];
const inputs = [null, ...parkIds].flatMap((park) => presets.map((f) => ({ park, f })));
for (const { park, f } of inputs) {
  const server = await selectRides(sql, { ...f, park });
  const web = experiences.filter((e) => park === null || dbPark.get(e.id) === park);
  const webHeld = { unrated: 0, sensitivityUnchecked: 0, heightUnknown: 0 };
  const webIds: string[] = [];
  for (const e of web) {
    const v = classify(rideFacts(e), f);
    if (v === "match") webIds.push(e.id);
    else if (v !== "no") webHeld[v]++;
  }
  const a = JSON.stringify([webIds.sort(), webHeld]);
  const b = JSON.stringify([server.matches.map((r) => r.id!).sort(), server.heldBack]);
  if (a === b) same++;
  else {
    const sIds = new Set(server.matches.map((r) => r.id!));
    const onlyWeb = webIds.filter((id) => !sIds.has(id));
    const onlyServer = [...sIds].filter((id) => !webIds.includes(id));
    diffs.push(`park=${park} ${JSON.stringify(f)}\n    only web: ${onlyWeb.join(", ") || "—"}\n    only server: ${onlyServer.join(", ") || "—"}\n    held back web ${JSON.stringify(webHeld)} · server ${JSON.stringify(server.heldBack)}`);
  }
}
await sql.end();

console.log(`${same}/${inputs.length} identical · ${diffs.length} differ`);
for (const d of diffs.slice(0, 12)) console.log("  ✗ " + d);
process.exit(diffs.length ? 1 : 0);
