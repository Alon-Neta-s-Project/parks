/**
 * Import product_export.csv into the app dataset.
 *
 * product_export.csv is the only content input. There is no master file in this
 * repo and there must not be — the master carries sources, confidence and
 * research notes that the product must never show.
 *
 * Rules that are not negotiable (brief §6a):
 *   - Never guess. A value that does not fit is a line in the gap report.
 *   - Empty is not "no". An unfilled column stays null and shows as a gap.
 *   - Idempotent by Key, so a re-import cannot reshuffle ids.
 *   - Dry run by default. Writing takes --write.
 *
 * Usage:
 *   npx tsx scripts/import-content.ts            # dry run + gap report
 *   npx tsx scripts/import-content.ts --write    # actually write the dataset
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  experienceSchema, parkSchema, REQUIRED_FIELDS,
  type Experience, type Park, type QuadState,
} from "../src/data/schema";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

// ── minimal CSV reader: quoted fields, embedded commas, doubled quotes ──────
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift();
  if (!header) throw new Error("empty CSV");
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// ── readers, one per mapping "kind" ────────────────────────────────────────
const problems: string[] = [];
const note = (key: string, msg: string) => problems.push(`${key}: ${msg}`);

const textOrNull = (v: string) => (v === "" ? null : v);

const list = (v: string) =>
  v === "" ? [] : v.split(/[;|]/).map((s) => s.trim()).filter(Boolean);

/** Four-state (spec §3.1). Empty means unknown, and stays unknown. */
function quadState(v: string, key: string, col: string): QuadState {
  const t = v.trim().toLowerCase();
  if (t === "") return null;
  if (t === "true" || t === "yes") return "true";
  if (t === "false" || t === "no") return "false";
  if (t === "n/a" || t === "na") return "na";
  note(key, `${col} has an unrecognised value ${JSON.stringify(v)} — left unknown`);
  return null;
}

function num(v: string, key: string, col: string, integer: boolean): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) {
    note(key, `${col} is not a ${integer ? "whole " : ""}number: ${JSON.stringify(v)} — left empty`);
    return null;
  }
  return n;
}

/**
 * "none" is an explicit finding that there is no limit, and must never be a
 * default. Empty stays empty.
 */
function height(v: string, key: string): { cm: number | null; none: boolean } {
  const t = v.trim().toLowerCase();
  if (t === "") return { cm: null, none: false };
  if (t === "none") return { cm: null, none: true };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) {
    note(key, `height_requirement_cm is neither a number nor "none": ${JSON.stringify(v)} — left empty`);
    return { cm: null, none: false };
  }
  return { cm: Math.round(n), none: false };
}

function intensity(v: string, key: string) {
  const t = v.trim();
  if (t === "Unknown" || t === "") return { value: null, rated: false };
  const n = Number(t);
  if (![1, 2, 3, 4].includes(n)) {
    note(key, `Intensity is neither 1–4 nor "Unknown": ${JSON.stringify(v)} — treated as unrated`);
    return { value: null, rated: false };
  }
  return { value: n as 1 | 2 | 3 | 4, rated: true };
}

/** Free text with dates inside it. Filtering needs an enum; the sentence still matters. */
function status(v: string) {
  if (v === "Open / current") return { state: "open" as const, note: null };
  const low = v.toLowerCase();
  if (low.includes("temporarily unavailable") || low.includes("closure begins"))
    return { state: "closed" as const, note: v };
  return { state: "check" as const, note: v };
}

const slugify = (park: string, name: string) =>
  `${park} ${name}`
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ── run ─────────────────────────────────────────────────────────────────────
const mapping = JSON.parse(readFileSync(join(ROOT, "content-mapping.json"), "utf8"));
const csv = readFileSync(join(ROOT, mapping.source), "utf8");
const rows = parseCsv(csv);
const headers = Object.keys(rows[0] ?? {});

// A master-only column in the export means the export leaked. Stop.
const leaked = mapping.neverExpected.columns.filter((c: string) => headers.includes(c));
if (leaked.length) {
  console.error("✗ ABORT — the export contains master-only columns:", leaked.join(", "));
  console.error("  Re-run build-product-export against the allow-list before importing.");
  process.exit(1);
}

const missingColumns = mapping.requiredColumns.filter((c: string) => !headers.includes(c));
const unexpectedColumns = headers.filter((h) => !mapping.requiredColumns.includes(h));

const experiences: Experience[] = [];
const rejected: { key: string; reason: string }[] = [];
const seen = new Set<string>();

for (const row of rows) {
  const key = row["Key"] ?? "";
  if (!key) { rejected.push({ key: "(no Key)", reason: "row has no Key" }); continue; }
  if (seen.has(key)) { rejected.push({ key, reason: "duplicate Key" }); continue; }
  seen.add(key);

  const park = row["Park"] ?? "";
  const name = row["Activity"] ?? "";
  const h = height(row["height_requirement_cm"] ?? "", key);
  const llType = (row["Lightning Lane Type"] ?? "").trim();
  const summary = row["Optional Fast Access / Pass"] ?? "";

  const candidate = {
    id: slugify(park, name),
    key,
    nameEn: name,
    nameHe: textOrNull(row["name_he"] ?? ""),
    aliasesHe: list(row["aliases_he"] ?? ""),
    resort: row["Resort"],
    park,
    parkKind: row["Park Type"] === "Water Park" ? "water" : "theme",
    kind: row["Activity Type"] === "Entertainment" ? "entertainment" : "attraction",
    land: row["Area / Land"],
    subtype: row["Subtype"],
    intensity: intensity(row["Intensity"] ?? "", key),
    status: status(row["Status / Seasonality"] ?? ""),
    admission: row["Required Admission / Ticket"] ?? "",
    reservation: row["Reservation / Additional Payment"] ?? "",
    includedWithAdmission: row["Included With Admission?"] ?? "",
    fastAccess: {
      system: llType === "Multi Pass" || llType === "Single Pass" ? llType : null,
      offered: llType === "Multi Pass" || llType === "Single Pass",
      inMultiPass: ["Yes", "No"].includes(row["Included in Multi Pass?"] ?? "")
        ? (row["Included in Multi Pass?"] as "Yes" | "No") : null,
      singlePassRequired: (row["Separate Single Pass Purchase Required?"] ?? "") === "Yes",
      premierIncluded: ["Yes", "No"].includes(row["Premier Pass Included?"] ?? "")
        ? (row["Premier Pass Included?"] as "Yes" | "No") : null,
      extraCost: (row["Extra Cost Beyond Multi Pass?"] ?? "").startsWith("Yes"),
      summary,
      unconfirmed: /not confirmed/i.test(summary),
    },
    openedYear: num(row["opened_year"] ?? "", key, "opened_year", true),
    durationMinutes: num(row["duration_minutes"] ?? "", key, "duration_minutes", false),
    maxSpeedKmh: num(row["max_speed_kmh"] ?? "", key, "max_speed_kmh", false),
    inversions: num(row["inversions"] ?? "", key, "inversions", true),
    bigDrops: quadState(row["big_drops"] ?? "", key, "big_drops"),
    spinning: quadState(row["spinning"] ?? "", key, "spinning"),
    environment: textOrNull(row["environment"] ?? ""),
    airConditioned: quadState(row["air_conditioned"] ?? "", key, "air_conditioned"),
    isMotionSimulator: quadState(row["is_motion_simulator"] ?? "", key, "is_motion_simulator"),
    usesLargeScreensOr3d: quadState(row["uses_large_screens_or_3d"] ?? "", key, "uses_large_screens_or_3d"),
    getsWet: quadState(row["gets_wet"] ?? "", key, "gets_wet"),
    heightRequirementCm: h.cm,
    noHeightLimit: h.none,
    wheelchair: (row["wheelchair"] ?? "").trim() === "" ? null : (row["wheelchair"] as never),
    officialMotionSicknessWarning: quadState(
      row["official_motion_sickness_warning"] ?? "", key, "official_motion_sickness_warning"),
    lastVerified: row["Last Verified"] ?? "",
    youtubeId: null,
    videoCreator: null,
    editorial: null,
  };

  const parsed = experienceSchema.safeParse(candidate);
  if (!parsed.success) {
    rejected.push({ key, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    continue;
  }
  experiences.push(parsed.data);
}

experiences.sort((a, b) => a.park.localeCompare(b.park) || a.land.localeCompare(b.land) || a.nameEn.localeCompare(b.nameEn));

// ── parks ───────────────────────────────────────────────────────────────────
const parkMap = new Map<string, Park>();
for (const e of experiences) {
  const p = parkMap.get(e.park) ?? {
    name: e.park, slug: slugify("", e.park), resort: e.resort, kind: e.parkKind,
    count: 0, rated: 0, lands: [] as string[],
  };
  p.count += 1;
  if (e.intensity.rated) p.rated += 1;
  if (!p.lands.includes(e.land)) p.lands.push(e.land);
  parkMap.set(e.park, p);
}
const parks = [...parkMap.values()]
  .map((p) => ({ ...p, lands: [...p.lands].sort() }))
  .sort((a, b) => a.resort.localeCompare(b.resort) || b.count - a.count);
for (const p of parks) parkSchema.parse(p);

// ── gap report, both directions ─────────────────────────────────────────────
const fieldCoverage = REQUIRED_FIELDS.map((field) => {
  const filled = experiences.filter((e) => {
    const v = e[field as keyof Experience];
    if (field === "intensity") return e.intensity.rated;
    if (field === "heightRequirementCm") return e.heightRequirementCm !== null || e.noHeightLimit;
    return v !== null && v !== "";
  }).length;
  return { field, filled, total: experiences.length };
});

const incomplete = experiences
  .map((e) => ({
    key: e.key,
    missing: REQUIRED_FIELDS.filter((f) => {
      if (f === "intensity") return !e.intensity.rated;
      if (f === "heightRequirementCm") return e.heightRequirementCm === null && !e.noHeightLimit;
      const v = e[f as keyof Experience];
      return v === null || v === "";
    }),
  }))
  .filter((r) => r.missing.length);

const report = {
  ranAt: new Date().toISOString().slice(0, 10),
  source: mapping.source,
  mode: WRITE ? "write" : "dry-run",
  rows: { read: rows.length, accepted: experiences.length, rejected: rejected.length },
  columns: {
    missingFromExport: missingColumns,
    presentButNotMapped: unexpectedColumns,
    heldBackByDecision: Object.keys(mapping.notInExport).filter((k) => k !== "$comment"),
  },
  fieldCoverage,
  valueProblems: problems,
  rejected,
  pagesComplete: experiences.length - incomplete.length,
  incompleteCount: incomplete.length,
  incomplete: incomplete.slice(0, 400),
};

mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/import-gap-report.json"), JSON.stringify(report, null, 2) + "\n");

// ── console summary ─────────────────────────────────────────────────────────
console.log(`\n${WRITE ? "IMPORT" : "DRY RUN"} — ${mapping.source}`);
console.log(`  rows read     ${rows.length}`);
console.log(`  accepted      ${experiences.length}`);
console.log(`  rejected      ${rejected.length}`);
if (missingColumns.length) console.log(`  ⚠ columns missing from export: ${missingColumns.join(", ")}`);
if (unexpectedColumns.length) console.log(`  ⚠ columns present but not mapped: ${unexpectedColumns.join(", ")}`);
if (problems.length) console.log(`  ⚠ ${problems.length} value problems (see report)`);
console.log("\n  coverage of required fields:");
for (const c of fieldCoverage) {
  const pct = Math.round((c.filled / c.total) * 100);
  console.log(`    ${c.field.padEnd(32)} ${String(c.filled).padStart(3)} / ${c.total}  ${pct}%`);
}
console.log(`\n  pages complete: ${report.pagesComplete} / ${experiences.length}`);
console.log(`  gap report → reports/import-gap-report.json`);

if (WRITE) {
  const out = join(ROOT, "src/data");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "experiences.json"), JSON.stringify(experiences, null, 1) + "\n");
  writeFileSync(join(out, "parks.json"), JSON.stringify(parks, null, 1) + "\n");
  console.log(`\n  ✓ wrote ${experiences.length} experiences and ${parks.length} parks`);
} else {
  console.log("\n  nothing written. re-run with --write to apply.");
}
