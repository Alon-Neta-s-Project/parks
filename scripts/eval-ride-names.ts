/**
 * The ride search (`find_ride`, apps/server/src/db/find-experiences.ts) on the names the agent
 * actually passes — against a real database.
 *
 *   EVAL_DATABASE_URL=postgresql://… npx tsx scripts/eval-ride-names.ts
 *   npm run eval:ride-names            # reads DATABASE_URL from .env.staging
 *
 * 🔴 **The names are not invented.** They are every name the agent passed to `find_ride` when
 * run on all 51 eval questions (golden + robustness, 01.10, gemini-3.5-flash) — Hebrew questions,
 * prefixes and typos included. The model normalised every one to an English name; the hard ones
 * are punctuation ("Tron Lightcycle Run" for "TRON Lightcycle / Run", a hyphen for an en dash)
 * and partial names ("Big Thunder Mountain").
 *
 * ⚠️ **Plus names straight from the data, in Hebrew** — not because the model sends them, but
 * to show the search reads every language the data holds without code for any of them.
 *
 * Fails below 19/20 found on the agent's names, above 24 rows in total (the baseline measured
 * 01.10), or on any data name not found first. Read-only.
 *
 * 🔴 **`--fixtures` (local only): a language the data does not hold yet.** In a transaction that
 * is rolled back, Space Mountain gets a French name; the search must find the ride by it. That is
 * "a new language is data, not code" — checked, not claimed. Refused on any host but localhost.
 */
import { connect } from "../apps/server/src/db/client";
import { findExperiences } from "../apps/server/src/db/find-experiences";

const url = process.env.EVAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("🔴 EVAL_DATABASE_URL (or DATABASE_URL) is not set");
  process.exit(1);
}
if (process.argv.includes("--fixtures") && !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  console.error("🔴 --fixtures writes (and rolls back) — local only");
  process.exit(1);
}
const sql = connect(url);

const EVEREST = "Expedition Everest – Legend of the Forbidden Mountain";
// The name the agent passed → the ride(s) a family meant.
const AGENT: [string, string[]][] = [
  ["TRON", ["TRON Lightcycle / Run"]],
  ["Space Mountain", ["Space Mountain"]],
  ["Expedition Everest", [EVEREST]],
  ["Expedition Everest - Legend of the Forbidden Mountain", [EVEREST]],
  ["Everest", [EVEREST]],
  ["Hagrid's Magical Creatures Motorbike Adventure", ["Hagrid's Magical Creatures Motorbike Adventure"]],
  ["Big Thunder Mountain Railroad", ["Big Thunder Mountain Railroad"]],
  ["Big Thunder Mountain", ["Big Thunder Mountain Railroad"]],
  ["Bay Slides", ["Bay Slides"]],
  ["Buzz Lightyear", ["Buzz Lightyear's Space Ranger Spin"]],
  ["Harry Potter and the Forbidden Journey", ["Harry Potter and the Forbidden Journey"]],
  ["Forbidden Journey", ["Harry Potter and the Forbidden Journey"]],
  // Ambiguous for real: the character meet and the EPCOT walk-through both carry the name.
  ["Moana", ["Meet Moana at Character Landing", "Journey of Water, Inspired by Moana"]],
  ["Meet Moana", ["Meet Moana at Character Landing"]],
  ["VelociCoaster", ["Jurassic World VelociCoaster"]],
  // The model guessing; in the same question it also asked for "VelociCoaster". Expected to miss.
  ["Velociraptor", ["Jurassic World VelociCoaster"]],
  ["Guardians of the Galaxy: Cosmic Rewind", ["Guardians of the Galaxy: Cosmic Rewind"]],
  ["Guardians of the Galaxy", ["Guardians of the Galaxy: Cosmic Rewind"]],
  ["Mario Kart", ["Mario Kart: Bowser's Challenge"]],
  ["Tron Lightcycle Run", ["TRON Lightcycle / Run"]],
];
// Names the data itself holds, in Hebrew — a Hebrew name and an alias.
const DATA: [string, string][] = [
  ["ספייס מאונטיין", "Space Mountain"],
  ["האגריד", "Hagrid's Magical Creatures Motorbike Adventure"],
  ["ולוסיקוסטר", "Jurassic World VelociCoaster"],
];

let found = 0, first = 0, rows = 0;
const misses: string[] = [];
for (const [name, want] of AGENT) {
  const got = (await findExperiences(sql, { name, park: null, limit: 6 })).map((r) => r.name);
  rows += got.length;
  if (got.some((g) => want.includes(g))) found++; else misses.push(`${name} → ${got.join(" · ") || "∅"}`);
  if (want.includes(got[0]!)) first++;
}
const dataMisses: string[] = [];
for (const [name, want] of DATA) {
  const got = (await findExperiences(sql, { name, park: null, limit: 6 })).map((r) => r.name);
  if (got[0] !== want) dataMisses.push(`${name} → ${got.join(" · ") || "∅"}`);
}
let fixture: string | null = null;
if (process.argv.includes("--fixtures")) {
  await sql.begin(async (tx) => {
    await tx`update experience set name_i18n = coalesce(name_i18n, '{}'::jsonb) || '{"fr": "Montagne de l''Espace"}'::jsonb
             where name = 'Space Mountain'`;
    const got = (await findExperiences(tx as unknown as typeof sql, { name: "Montagne de l'Espace", park: null, limit: 6 })).map((r) => r.name);
    fixture = got[0] === "Space Mountain" ? null : `Montagne de l'Espace → ${got.join(" · ") || "∅"}`;
    throw new Error("rollback");
  }).catch((e: Error) => { if (e.message !== "rollback") throw e; });
  console.log(`a new language (fr, rolled back): ${fixture ? "✗ " + fixture : "found first"}`);
}
await sql.end();

console.log(`agent's names: found ${found}/${AGENT.length} · first ${first}/${AGENT.length} · ${rows} rows`);
console.log(`data's Hebrew names: ${DATA.length - dataMisses.length}/${DATA.length} first`);
for (const m of misses) console.log("  ✗ " + m);
for (const m of dataMisses) console.log("  ✗ (data) " + m);
const ok = found >= 19 && rows <= 24 && !dataMisses.length && !fixture;
console.log(ok ? "✅ pass" : "🔴 fail — thresholds: found ≥ 19, rows ≤ 24, every data name first");
process.exit(ok ? 0 : 1);
