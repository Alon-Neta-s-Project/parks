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
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

/**
 * ארבעה מצבים (spec §3.1). ריק הוא "לא נבדק", ונשאר כך.
 *
 * 🔴 **`boolFlag` נמחקה, ולא נשארה "לכל מקרה".** היא החזירה
 * `boolean | null`, כלומר שלושה מצבים, ולכן `N/A` מהמאסטר לא היה לו לאן
 * ללכת והתלכד עם "לא נבדק". זו הייתה ההופעה השלישית של אותה תבנית —
 * 77 שורות מופעים שנקראו כלא בדוקות.
 *
 * ⚠️ פונקציה תלת־מצבית שנשארת בקובץ היא הזמנה להשתמש בה שוב בעמודה
 * הבאה. מה שמונע את ההופעה החמישית הוא שאין במה.
 */
function quadState(v: string, key: string, col: string): QuadState {
  const t = v.trim().toLowerCase();
  if (t === "") return null;
  if (t === "true" || t === "yes") return "true";
  if (t === "false" || t === "no") return "false";
  if (t === "n/a" || t === "na") return "na";
  note(key, `${col} has an unrecognised value ${JSON.stringify(v)} — left unknown`);
  return null;
}

/**
 * A closed set of values, where anything else is reported rather than guessed.
 *
 * ⚠️ **"N/A" and "na" are the same statement.** The master writes `N/A`; the
 * vocabulary spells it `na`. For months the reports read this as an empty
 * cell and the gap was blamed on the export — 77 rows in v7_10 alone, all of
 * them "not applicable" recorded as "not checked". That is instance five of
 * the pattern this project keeps catching, and this time the collector had
 * done the work and the importer threw it away.
 *
 * The normalisation happens only where `na` is actually part of the
 * vocabulary, so no other enum is quietly coerced.
 */
function enumOrNull<T extends string>(v: string, allowed: readonly T[], key: string, col: string): T | null {
  let t = v.trim();
  if (t === "") return null;
  if ((allowed as readonly string[]).includes("na") && /^n\/?a$/i.test(t)) t = "na";
  if ((allowed as readonly string[]).includes(t)) return t as T;
  note(key, `${col} is not one of ${allowed.join(" | ")}: ${JSON.stringify(v)} — left empty`);
  return null;
}

/**
 * A value bound for an integer column. A fraction is kept as-is in the dataset
 * but flagged, so the mismatch is visible instead of being rounded away.
 */
function intForIntegerColumn(v: string, key: string, col: string): number | null {
  const n = num(v, key, col, false);
  if (n !== null && !Number.isInteger(n)) {
    note(key, `${col} is ${n} but the column is integer — it would be silently rounded to ${Math.round(n)}`);
  }
  return n;
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
 * Three states, matching migration 012. "none" is a finding, not a blank, and
 * becomes 0 — the minimum height to ride really is zero.
 */
function height(v: string, key: string): number | null {
  const t = v.trim().toLowerCase();
  if (t === "") return null;
  if (t === "none") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 50 || n > 200) {
    note(key, `height_requirement_cm is not "none" and not 50-200: ${JSON.stringify(v)} — left unchecked`);
    return null;
  }
  return Math.round(n);
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

/**
 * Free text with dates inside it. Filtering needs an enum; the sentence still matters.
 *
 * 🔴 **"closure begins" used to mean closed. It does not — it is a date in the
 * future.** Nineteen rows carry this exact sentence:
 *
 *   "Open as of Aug 24, 2026. Planned park maintenance closure begins Oct 26, 2026."
 *
 * The sentence opens with the word *Open*. Every one of those nineteen was
 * classified `closed`, and Tim told a family that all of Volcano Bay was shut.
 * Found by Neta on the live screen, 08.09 — not by a test.
 *
 * ⚠️ This is the project pattern in its purest form: a value that means one
 * thing read as another. "Will close in October" became "is closed now". The
 * substring matched; the meaning inverted.
 *
 * ⚠️ And the order below is the fix, not decoration. What the sentence says
 * about **today** is decided first, and only a sentence that does not open with
 * a present-tense "Open" is allowed to be read as a closure.
 */
export function status(v: string) {
  if (v === "Open / current") return { state: "open" as const, note: null };
  const low = v.toLowerCase().trim();
  // A sentence that begins by saying the row is open, is open. The dates it
  // goes on to mention are kept in the note, where they belong.
  if (/^open\b/.test(low)) return { state: "open" as const, note: v };
  if (low.includes("temporarily unavailable")) return { state: "closed" as const, note: v };
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

/**
 * The manifest names the exact column set this export was built from. A silent
 * mismatch is how the previous export shipped an obsolete column name, empty in
 * all 232 rows, without anything failing loudly. Stop instead.
 */
const manifest = JSON.parse(readFileSync(join(ROOT, "data/source/product_export_manifest.json"), "utf8"));
const columnsHash = createHash("sha256").update(headers.join("|")).digest("hex").slice(0, 12);
if (columnsHash !== manifest.columns_hash) {
  console.error(`✗ ABORT — column-set hash mismatch.`);
  console.error(`  manifest expects ${manifest.columns_hash}, this file is ${columnsHash}`);
  console.error(`  The export and the manifest disagree. Do not import.`);
  process.exit(1);
}

/**
 * Hebrew names approved out of band, before the master carries them.
 *
 * The eight character-meet rows arrived in the master with no Hebrew name, and
 * without one Tim's search cannot find them at all: it looks at the English
 * name, the Hebrew name and the aliases, so "מפגש עם מואנה" returns nothing and
 * Tim says "I do not have that" — which is false, the row is right there.
 * Paula approved the names (8-names-he-2026-09-07.txt) ahead of the next export.
 *
 * ⚠️ This is a patch and not a second source of truth, and the difference is
 * that it announces itself. Every row here is reported on every import, and the
 * moment the master carries the same value the row is called out as redundant
 * so it can be deleted. A patch that goes quiet is how two sources of truth
 * start.
 *
 * ⚠️ It only ever fills a blank. A patch that overwrote a value the master
 * holds would make the export a suggestion, and the next person to correct a
 * name in the master would watch the correction disappear with no error.
 */
const patchPath = join(ROOT, "data/source/name_he_patch.csv");
const namePatch: Record<string, string> = {};
if (existsSync(patchPath)) {
  for (const row of parseCsv(readFileSync(patchPath, "utf8"))) {
    const key = (row["Key"] ?? "").trim();
    const value = (row["name_he"] ?? "").trim();
    if (key && value) namePatch[key] = value;
  }
}

const patched: string[] = [];
const patchRedundant: string[] = [];
const patchOrphaned = new Set(Object.keys(namePatch));
for (const row of rows) {
  const key = (row["Key"] ?? "").trim();
  const approved = namePatch[key];
  if (!approved) continue;
  patchOrphaned.delete(key);
  const current = (row["name_he"] ?? "").trim();
  if (current === approved) patchRedundant.push(key);
  else if (current !== "") {
    // The master disagrees with the patch. That is a decision, not a merge.
    console.error(`✗ ABORT — the master already holds a different Hebrew name.`);
    console.error(`  ${key}`);
    console.error(`  master: ${current}`);
    console.error(`  patch:  ${approved}`);
    console.error(`  Delete the row from data/source/name_he_patch.csv, or fix the master.`);
    process.exit(1);
  } else {
    row["name_he"] = approved;
    patched.push(key);
  }
}

/**
 * Flag corrections approved before the master carries them.
 *
 * ⚠️ This patch OVERWRITES, and the name patch deliberately does not. The
 * difference is not a relaxation — it is the whole reason this is a separate
 * file with a separate rule.
 *
 * The case it was built for: Adventures with Kevin carried
 * sens_loud_sudden = FALSE. Not empty — FALSE. So a family that asked Tim to
 * avoid sudden loud noises was being told Kevin was fine, and nothing looked
 * wrong, because a false is exactly what "checked and clear" looks like. Roni's
 * second source says the puppet shrieks loudly on approach and startles small
 * children. The row had no description at all until now, which is why nobody
 * could catch it by reading.
 *
 * ⚠️ And because it overwrites, every row must declare what it expects to
 * replace. If the master's current value is not `from`, the import STOPS. A
 * patch that overwrote whatever it found would erase a later correction from
 * the master and leave no trace — which is the same silent-overwrite failure in
 * a new costume.
 */
const sensPatchPath = join(ROOT, "data/source/sens_patch.csv");
interface SensPatch { key: string; column: string; from: string; to: string }
const sensPatches: SensPatch[] = existsSync(sensPatchPath)
  ? parseCsv(readFileSync(sensPatchPath, "utf8"))
      .map((r) => ({
        key: (r["Key"] ?? "").trim(),
        column: (r["column"] ?? "").trim(),
        from: (r["from"] ?? "").trim(),
        to: (r["to"] ?? "").trim(),
      }))
      .filter((r) => r.key && r.column)
  : [];

const sensApplied: string[] = [];
const sensRedundant: string[] = [];
for (const patch of sensPatches) {
  // ⚠️ Only the four flags. A patch that could reach any column would be a
  // second master, and this file lives in data/source/ where that is the one
  // thing the rule forbids.
  if (!/^sens_(enclosed_dark|heights|loud_sudden|strobe)$/.test(patch.column)) {
    console.error(`✗ ABORT — sens_patch may only touch the four sens_* columns.`);
    console.error(`  ${patch.key} → ${patch.column}`);
    process.exit(1);
  }
  const row = rows.find((r) => (r["Key"] ?? "").trim() === patch.key);
  if (!row) {
    console.error(`✗ ABORT — sens_patch names a key that is not in the export.`);
    console.error(`  ${patch.key}`);
    process.exit(1);
  }
  const current = (row[patch.column] ?? "").trim();
  if (current.toUpperCase() === patch.to.toUpperCase()) {
    sensRedundant.push(`${patch.key.split("|").pop()} · ${patch.column}`);
    continue;
  }
  if (current.toUpperCase() !== patch.from.toUpperCase()) {
    console.error(`✗ ABORT — the master no longer holds the value this patch replaces.`);
    console.error(`  ${patch.key}`);
    console.error(`  ${patch.column}: master has ${current || "(ריק)"}, patch expected ${patch.from}`);
    console.error(`  Someone changed it. Decide which is right, then update or delete the patch row.`);
    process.exit(1);
  }
  row[patch.column] = patch.to;
  sensApplied.push(`${patch.key.split("|").pop()} · ${patch.column}: ${patch.from} → ${patch.to}`);
}

/**
 * Subtype carries 141 free-text descriptions; the schema needs two closed enums.
 * The translation lives in an approved map, so it is visible and reviewable in
 * one place rather than spread across 232 rows.
 */
const subtypeMap: Record<string, { type: string; category: string }> =
  JSON.parse(readFileSync(join(ROOT, "data/source/subtype_map.json"), "utf8"));

// A master-only column in the export means the export leaked. Stop.
const leaked = mapping.neverExpected.columns.filter((c: string) => headers.includes(c));
if (leaked.length) {
  console.error("✗ ABORT — the export contains master-only columns:", leaked.join(", "));
  console.error("  Re-run build-product-export against the allow-list before importing.");
  process.exit(1);
}

const missingColumns = mapping.requiredColumns.filter((c: string) => !headers.includes(c));
const unexpectedColumns = headers.filter((h) => !mapping.requiredColumns.includes(h));

/**
 * The five rows whose height number is a ceiling, not a floor.
 *
 * 🔴 The master has one height column and it means "minimum to ride". For five
 * toddler water areas the number in it is the **maximum allowed**, so the same
 * figure said the exact opposite of what it meant: Tim told a family that
 * Tike's Peak requires 122 cm, when in truth it admits nobody *over* 122.
 *
 * Found by an inconsistency inside our own data — the gentlest intensity band
 * held the highest number in the table, above Hulk (137) and Doctor Doom (132).
 * Verified against sources by Roni, approved by Paula, 08.09.
 *
 * ⚠️ **Declared per row, like sens_patch, and for the same reason.** Every row
 * states the value it expects to find. If the master ever corrects one of these
 * — moving the number to a real maximum column, or changing it — the import
 * STOPS rather than silently re-interpreting a number that now means something
 * else. A rule that guessed which rows are ceilings would be a second master.
 *
 * ⚠️ **And it cannot be derived from Subtype.** Four of the five are
 * "Water play area"; Bay Slides is "Body slide". A subtype rule would have
 * missed the one with the largest error in it.
 */
const maxHeightPath = join(ROOT, "data/source/max_height.csv");
const maxHeights = new Map<string, number>();
if (existsSync(maxHeightPath)) {
  for (const r of parseCsv(readFileSync(maxHeightPath, "utf8"))) {
    const key = (r["Key"] ?? "").trim();
    const from = (r["from"] ?? "").trim();
    const max = Number((r["max_cm"] ?? "").trim());
    if (!key) continue;

    const row = rows.find((x) => (x["Key"] ?? "").trim() === key);
    if (!row) {
      console.error(`✗ ABORT — max_height names a key that is not in the export.`);
      console.error(`  ${key}`);
      process.exit(1);
    }
    const current = (row["height_requirement_cm"] ?? "").trim();
    if (current !== from) {
      console.error(`✗ ABORT — the master no longer holds the value max_height expects.`);
      console.error(`  ${key}`);
      console.error(`  master: ${current}`);
      console.error(`  expected: ${from}`);
      console.error(`  The row may have been corrected upstream. Re-read it before deleting this line.`);
      process.exit(1);
    }
    if (!Number.isInteger(max) || max < 50 || max > 200) {
      console.error(`✗ ABORT — max_height carries a max_cm outside 50..200: ${key} → ${max}`);
      process.exit(1);
    }
    maxHeights.set(key, max);

    // 🔴 **הרצפה נכתבת רק כשמישהו באמת בדק אותה — ולא כשנוח.**
    //
    // רוני בדקה את החמישה (09.09) וחזרה עם **שלוש רמות ביטחון שונות**:
    // Bay Slides ו-Ketchakiddee Creek ב-high (האתר הרשמי מנוסח במפורש
    // כמקסימום בלבד); Runamukka ו-Tot Tiki ב-medium-high (האתר הרשמי לא
    // נטען, תקלת כלי); Tike's Peak ב-medium בלבד, ושם touringplans אף
    // מתייג בטעות "Minimum Height 48 in" על ניסוח שהוא מקסימום.
    //
    // ⚠️ `0` כאן פירושו **"נבדק, ואין"** — טענה. שלוש מהחמש לא הגיעו
    // לרמה שמצדיקה אותה, ולכן הן נשארות ריקות. אחידות הייתה נוחה יותר
    // ושקרית על שלוש שורות, על שדה שעניינו בטיחות ילד.
    const min = (r["min_cm"] ?? "").trim();
    if (min !== "" && min !== "0") {
      console.error(`✗ ABORT — max_height.min_cm מקבל רק ריק או 0: ${key} → ${min}`);
      console.error(`  ריק = לא נבדק · 0 = נבדק ואין. מגבלה אמיתית שייכת למאסטר.`);
      process.exit(1);
    }
    // ⚠️ **"none" ולא "0".** אוצר המילים של המאסטר ל"נבדק ואין" הוא
    // המחרוזת `none`; `height()` ממירה אותה ל-0, ואילו "0" מפורש נופל
    // מחוץ לטווח 50-200 וחוזר כ-null בשקט. כלומר כתיבת "0" כאן הייתה
    // מוחקת בדיוק את הממצא שרוני אימתה, ונראית כאילו עבדה.
    row["height_requirement_cm"] = min === "0" ? "none" : "";
  }
}

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
  const heightCm = height(row["height_requirement_cm"] ?? "", key);
  const llType = (row["Lightning Lane Type"] ?? "").trim();
  const summary = row["Optional Fast Access / Pass"] ?? "";

  // No default. dark_ride is the largest category and therefore the tempting
  // default, and it is exactly where a wrong guess would never be noticed.
  const mapKey = row["Subtype"] ?? "";
  const mapped = subtypeMap[mapKey];
  if (!mapped) {
    rejected.push({ key, reason: `Subtype not in the approved map: ${JSON.stringify(mapKey)}` });
    continue;
  }

  const candidate = {
    id: slugify(park, name),
    type: mapped.type,
    category: mapped.category,
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
      // ⚠️ הערך הגולמי, בלי כיווץ. ראה ההערה ב-schema.ts.
      lightningLaneType: llType === "" ? null : llType,
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
    // The column is integer in the schema, so a fractional value cannot be
    // stored as given. Reported rather than rounded here: silently rounding is
    // the same class of mistake as defaulting gets_wet to 'none'.
    durationMinutes: intForIntegerColumn(row["duration_minutes"] ?? "", key, "duration_minutes"),
    maxSpeedKmh: num(row["max_speed_kmh"] ?? "", key, "max_speed_kmh", false),
    inversions: num(row["inversions"] ?? "", key, "inversions", true),
    bigDrops: quadState(row["big_drops"] ?? "", key, "big_drops"),
    spinning: quadState(row["spinning"] ?? "", key, "spinning"),
    environment: textOrNull(row["environment"] ?? ""),
    airConditioned: quadState(row["air_conditioned"] ?? "", key, "air_conditioned"),
    isMotionSimulator: quadState(row["is_motion_simulator"] ?? "", key, "is_motion_simulator"),
    usesLargeScreensOr3d: quadState(row["uses_large_screens_or_3d"] ?? "", key, "uses_large_screens_or_3d"),
    getsWet: enumOrNull(row["gets_wet"] ?? "", ["none", "may_get_wet", "may_get_soaked", "na"], key, "gets_wet"),
    heightRequirementCm: heightCm,
    maxHeightRequirementCm: maxHeights.get(key.trim()) ?? null,
    wheelchair: (row["wheelchair"] ?? "").trim() === "" ? null : (row["wheelchair"] as never),
    // Column name in the export, field name in the schema — see content-mapping.json.
    motionSicknessWarning: quadState(
      row["motion_sickness_warning"] ?? "", key, "motion_sickness_warning"),
    lastVerified: row["Last Verified"] ?? "",
    /**
     * ⚠️ **היו כתובות null בקוד עד עכשיו** — לא כי הן חסרו, אלא כי הן
     * לא היו בחוזה הייצוא. במאסטר יש להן ערך ב-125 עד 181 מתקנים,
     * והן נזרקו בדרך. זו התבנית שנספרה בפרויקט כמופע השני מתוך שבעה,
     * וזו הפעם שבה היא נסגרת.
     *
     * ⚠️ **`sens_enclosed_dark` לעולם אינו נגזר מ-`category === "dark_ride"`.**
     * "Dark ride" הוא מונח תעשייתי למתקן ממוסלל בתוך מבנה — Peter Pan's
     * Flight הוא dark ride. גזירה כזו הייתה מסמנת אותו כסיכון
     * קלאוסטרופוביה והורסת את האמון בפילטר הדגל.
     */
    sensEnclosedDark: quadState(row["sens_enclosed_dark"] ?? "", key, "sens_enclosed_dark"),
    sensHeights: quadState(row["sens_heights"] ?? "", key, "sens_heights"),
    sensLoudSudden: quadState(row["sens_loud_sudden"] ?? "", key, "sens_loud_sudden"),
    sensStrobe: quadState(row["sens_strobe"] ?? "", key, "sens_strobe"),
    // 🔴 **שני השדות שהנתיב אליהם לא היה קיים.**
    //
    // פולה אישרה שמונה תיאורים מלאים ב-07.09. הדגלים שלהם נכנסו, הטקסט
    // לא — כי לייצוא לא הייתה עמודת תיאור. כאן הצד הקולט, כדי שברגע
    // שהעמודות יופיעו בייצוא הן פשוט יזרמו בלי שינוי קוד נוסף.
    //
    // ⚠️ **ריק הוא null ולא מחרוזת ריקה.** "טרם נכתב" ו"נכתב, וריק" הם
    // שני מצבים שונים, וזו התבנית שהפילה כאן שבעה שדות.
    descriptionHe: textOrNull((row["description_he"] ?? "").trim()),
    // ⚠️ ואינו תחליף ל-land. land הוא האזור הרשמי של הפארק;
    // meet_location הוא איפה הדבר קורה בפועל.
    meetLocation: textOrNull((row["meet_location"] ?? "").trim()),
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
/**
 * Whether a field has been answered.
 *
 * "na" counts as answered, and that is the point. Someone looked, decided the
 * question does not apply to this kind of activity, and closed the field —
 * a stage show cannot get you wet. Counting that as a gap sends it to the
 * verification queue and spends a person's time on something already settled.
 *
 * null is the opposite and stays a gap: nobody has looked yet.
 */
const isAnswered = (e: Experience, field: string): boolean => {
  if (field === "intensity") return e.intensity.rated;
  if (field === "heightRequirementCm") return e.heightRequirementCm !== null;
  const v = e[field as keyof Experience];
  return v !== null && v !== "";
};

const fieldCoverage = REQUIRED_FIELDS.map((field) => ({
  field,
  filled: experiences.filter((e) => isAnswered(e, field)).length,
  // Split out so the report distinguishes "decided not applicable" from
  // "answered with a value" — they look the same in a coverage percentage.
  notApplicable: experiences.filter((e) => e[field as keyof Experience] === "na").length,
  total: experiences.length,
}));

const incomplete = experiences
  .map((e) => ({
    key: e.key,
    missing: REQUIRED_FIELDS.filter((f) => !isAnswered(e, f)),
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
console.log(`  columns hash  ${columnsHash} ✓ matches manifest`);

// ⚠️ The patch reports itself on every run, including when it has nothing to
// do. A silent patch is indistinguishable from no patch, and that is exactly
// how a second source of truth stops being noticed.
if (patched.length) {
  console.log(`\n  ${patched.length} שמות עבריים הושלמו מ-name_he_patch.csv:`);
  for (const k of patched) console.log(`    ${k.split("|").pop()}`);
  console.log(`  ⚠️ אלה אינם במאסטר. הייצוא הבא ידרוס אותם אם המאסטר לא יכיל אותם.`);
}
if (patchRedundant.length) {
  console.log(`\n  ✅ ${patchRedundant.length} שורות בטלאי — המאסטר כבר מכיל אותן.`);
  for (const k of patchRedundant) console.log(`    ${k.split("|").pop()}`);
  console.log(`  אפשר למחוק אותן מ-data/source/name_he_patch.csv.`);
}
if (sensApplied.length) {
  console.log(`\n  🔴 ${sensApplied.length} תיקוני דגל מ-sens_patch.csv:`);
  for (const k of sensApplied) console.log(`    ${k}`);
  console.log(`  ⚠️ אלה **דריסות** של ערך קיים, לא מילוי ריק. הייצוא הבא ידרוס אותן חזרה`);
  console.log(`     אם המאסטר לא יתוקן.`);
}
// ⚠️ נאמר בכל ייבוא, כמו שני הטלאים האחרים ומאותה סיבה: טלאי ששותק הופך
// עם הזמן למקור אמת שני. חמש השורות האלה מפרשות מחדש מספר שהמאסטר מחזיק,
// וזו אמירה שצריכה להיראות בכל פעם.
if (maxHeights.size) {
  console.log(`\n  🔴 ${maxHeights.size} שורות שבהן הגובה הוא **תקרה** ולא רצפה (max_height.csv):`);
  for (const [k, v] of maxHeights) console.log(`    ${k.split("|").pop()} · עד ${v} ס"מ`);
  console.log(`  ⚠️ הרצפה נכתבת רק לפי min_cm, ובשלוש רמות ביטחון שונות (רוני 09.09):`);
  console.log(`     0 = נבדק ואין · ריק = טרם אומת ברמה שמצדיקה 0.`);
}
if (sensRedundant.length) {
  console.log(`\n  ✅ ${sensRedundant.length} תיקוני דגל בטלים — המאסטר כבר מתוקן:`);
  for (const k of sensRedundant) console.log(`    ${k}`);
  console.log(`  אפשר למחוק אותם מ-data/source/sens_patch.csv.`);
}
if (patchOrphaned.size) {
  console.log(`\n  ⚠️ ${patchOrphaned.size} שורות בטלאי מצביעות על מפתח שאינו בייצוא:`);
  for (const k of patchOrphaned) console.log(`    ${k}`);
}
console.log(`  rows read     ${rows.length}`);
console.log(`  accepted      ${experiences.length}`);
console.log(`  rejected      ${rejected.length}`);
if (missingColumns.length) console.log(`  ⚠ columns missing from export: ${missingColumns.join(", ")}`);
if (unexpectedColumns.length) console.log(`  ⚠ columns present but not mapped: ${unexpectedColumns.join(", ")}`);
if (problems.length) console.log(`  ⚠ ${problems.length} value problems (see report)`);
console.log("\n  coverage of required fields:");
for (const c of fieldCoverage) {
  const pct = Math.round((c.filled / c.total) * 100);
  const na = c.notApplicable ? `  (${c.notApplicable} n/a)` : "";
  console.log(`    ${c.field.padEnd(32)} ${String(c.filled).padStart(3)} / ${c.total}  ${pct}%${na}`);
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
