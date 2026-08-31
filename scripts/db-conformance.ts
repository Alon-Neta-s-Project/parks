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

/** Park names in the export mapped onto the seeded park ids, water parks included. */
const PARK_ID: Record<string, string> = {
  "Magic Kingdom": "mk",
  EPCOT: "epcot",
  "Disney's Hollywood Studios": "hs",
  "Disney's Animal Kingdom": "ak",
  "Universal Studios Florida": "us",
  "Universal Islands of Adventure": "ioa",
  "Universal Epic Universe": "epic",
  "Disney's Blizzard Beach": "bb",
  "Disney's Typhoon Lagoon": "tl",
  "Universal Volcano Bay": "vb",
};

const quad = (v: string | null) => (v === null ? "null" : `'${v}'`);
const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;

// Start from empty every run. Without this a second run reports every row as
// refused on a duplicate key, which reads like a regression and is not one.
sql("truncate experience cascade");

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

  // Both come from the approved subtype map, applied at import. Nothing is
  // derived here.
  const { type, category } = e;

  const statement = `insert into experience
    (id, park_id, type, status, name, name_i18n, category, intensity,
     opened_year, duration_minutes, height_requirement_cm, environment,
     air_conditioned, wheelchair, motion_sickness_warning, is_motion_simulator,
     uses_large_screens_or_3d, big_drops, spinning, gets_wet, intensity_factors, last_verified)
    values (${esc(e.id)}, ${esc(parkId)}, '${type}', 'open', ${esc(e.nameEn)}, '{}'::jsonb,
     '${category}', ${e.intensity.value ?? "null"},
     ${e.openedYear ?? "null"}, ${e.durationMinutes ?? "null"}, ${e.heightRequirementCm ?? "null"},
     ${e.environment ? esc(e.environment) : "null"}, ${quad(e.airConditioned)},
     ${e.wheelchair ? esc(e.wheelchair) : "null"}, ${quad(e.motionSicknessWarning)},
     ${quad(e.isMotionSimulator)}, ${quad(e.usesLargeScreensOr3d)},
     ${quad(e.bigDrops)}, ${quad(e.spinning)},
     ${e.getsWet ? esc(e.getsWet) : "null"},
     ${esc(JSON.stringify({ max_speed_kmh: e.maxSpeedKmh, inversions: e.inversions }))}::jsonb,
     ${esc(e.lastVerified)})`;

  try {
    // psql -c takes a single line; the statement is written across several for
    // readability, so it is flattened before being sent.
    sql(statement.replace(/\s+/g, " "));
    inserted += 1;
  } catch (err) {
    const message = String((err as { stderr?: string }).stderr ?? err);
    const constraint = message.match(/violates check constraint "([^"]+)"/)?.[1]
      ?? message.match(/null value in column "([^"]+)"/)?.[1]
      ?? message.match(/violates foreign key constraint "([^"]+)"/)?.[1]
      ?? message.match(/duplicate key value violates unique constraint "([^"]+)"/)?.[1]
      ?? message.match(/ERROR:\s*(.{0,90})/)?.[1]
      ?? "unknown";
    record(constraint, `${e.park} — ${e.nameEn}`);
  }
}

/**
 * Loading without error is not the same as storing what was given. Postgres
 * coerces a fraction into an integer column silently, so the values are read
 * back and compared.
 */
const altered: string[] = [];
for (const e of experiences) {
  if (e.durationMinutes === null) continue;
  const stored = sql(`select duration_minutes from experience where id = ${esc(e.id)}`);
  if (stored !== "" && Number(stored) !== e.durationMinutes) {
    altered.push(`${e.nameEn}: duration ${e.durationMinutes} stored as ${stored}`);
  }
}

console.log(`\nattempted ${experiences.length} rows`);
console.log(`  loaded   ${inserted}`);
console.log(`  refused  ${experiences.length - inserted}\n`);
if (altered.length) {
  console.log(`values changed on the way in — loaded, but not as given:`);
  for (const line of altered) console.log(`  ${line}`);
  console.log("");
}
if (failures.size) {
  console.log("what the database refused, and why:");
  for (const [reason, { count, example }] of [...failures].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(count).padStart(3)} × ${reason}`);
    console.log(`        e.g. ${example}`);
  }
}
