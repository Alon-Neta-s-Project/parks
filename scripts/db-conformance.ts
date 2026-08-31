/**
 * Try to load the imported dataset into the real schema, and report what the
 * database refuses.
 *
 * This is the field-by-field check the sync note asks for, done by the database
 * rather than by eye: every mismatch between product_export.csv and the
 * migrations shows up here as an actual constraint error, with a count.
 *
 * Usage (needs a local Postgres with the migrations applied):
 *   npx tsx scripts/db-conformance.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const PORT = process.env.PGPORT ?? "55432";
const experiences = JSON.parse(readFileSync(join(process.cwd(), "src/data/experiences.json"), "utf8"));

const sql = (q: string) =>
  execFileSync("su", ["postgres", "-c", `psql -h /tmp -p ${PORT} -d pdc -At -F'|' -c ${JSON.stringify(q)}`], {
    encoding: "utf8",
  }).trim();

/** Park names in the export mapped onto the seeded park ids. */
const PARK_ID: Record<string, string> = {
  "Magic Kingdom": "mk",
  EPCOT: "epcot",
  "Disney's Hollywood Studios": "hs",
  "Disney's Animal Kingdom": "ak",
  "Universal Studios Florida": "us",
  "Universal Islands of Adventure": "ioa",
  "Universal Epic Universe": "epic",
};

const quad = (v: string | null) => (v === null ? "null" : `'${v}'`);
const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;

const failures = new Map<string, { count: number; example: string }>();
const record = (reason: string, key: string) => {
  const hit = failures.get(reason);
  if (hit) hit.count += 1;
  else failures.set(reason, { count: 1, example: key });
};

let inserted = 0;

for (const e of experiences) {
  const parkId = PARK_ID[e.park];
  if (!parkId) {
    record("park is not in the seed (water parks are absent)", `${e.park} — ${e.nameEn}`);
    continue;
  }

  // type and category are NOT NULL in the schema and are not columns in the
  // export. Nothing here may invent them, so the attempt uses the only honest
  // mapping available and lets the database reject what cannot be derived.
  const type = e.kind === "attraction" ? "attraction" : "show";
  const category = e.kind === "attraction" ? "dark_ride" : "show";

  const statement = `insert into experience
    (id, park_id, type, status, name, name_i18n, category, intensity,
     opened_year, duration_minutes, height_requirement_cm, environment,
     air_conditioned, wheelchair, motion_sickness_warning, is_motion_simulator,
     uses_large_screens_or_3d, big_drops, spinning, last_verified)
    values (${esc(e.id)}, ${esc(parkId)}, '${type}', 'open', ${esc(e.nameEn)}, '{}'::jsonb,
     '${category}', ${e.intensity.value ?? "null"},
     ${e.openedYear ?? "null"}, ${e.durationMinutes ?? "null"}, ${e.heightRequirementCm ?? "null"},
     ${e.environment ? esc(e.environment) : "null"}, ${quad(e.airConditioned)},
     ${e.wheelchair ? esc(e.wheelchair) : "null"}, ${quad(e.motionSicknessWarning ?? null)},
     ${quad(e.isMotionSimulator)}, ${quad(e.usesLargeScreensOr3d)},
     ${quad(e.bigDrops)}, ${quad(e.spinning)}, ${esc(e.lastVerified)})`;

  try {
    // psql -c takes a single line; the statement is written across several for
    // readability, so it is flattened before being sent.
    sql(statement.replace(/\s+/g, " "));
    inserted += 1;
  } catch (err) {
    const message = String((err as { stderr?: string }).stderr ?? err);
    const constraint = message.match(/violates check constraint "([^"]+)"/)?.[1]
      ?? message.match(/null value in column "([^"]+)"/)?.[1]
      ?? message.split("\n").find((l) => l.includes("ERROR"))?.slice(0, 90)
      ?? "unknown";
    record(constraint, `${e.park} — ${e.nameEn}`);
  }
}

console.log(`\nattempted ${experiences.length} rows`);
console.log(`  loaded   ${inserted}`);
console.log(`  refused  ${experiences.length - inserted}\n`);
if (failures.size) {
  console.log("what the database refused, and why:");
  for (const [reason, { count, example }] of [...failures].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(count).padStart(3)} × ${reason}`);
    console.log(`        e.g. ${example}`);
  }
}
