/**
 * Parity: the database function `find_experiences` against the server's copy of it
 * (apps/server/src/db/find-experiences.ts), on the same database, over many inputs.
 *
 *   PARITY_DATABASE_URL=postgresql://… npx tsx scripts/parity-find-experiences.ts
 *   npm run parity:find-experiences            # reads DATABASE_URL from .env.staging
 *
 * 🔴 **Any difference fails** — which rides, in which order, every field, the fit. The move
 * is a copy, so a difference is a bug in the copy; a fix (the "ב-" hyphen) comes after
 * parity, as its own step.
 *
 * Inputs: every golden/robustness question (through Tim's own extractRideName/extractHeight),
 * and every ride by its English name, Hebrew name, aliases, a Hebrew prefix and "ב-" — each
 * with a height from a fixed cycle, including none — plus a whole park by id, and edge cases.
 * Read-only: two SELECTs per input.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { connect } from "../apps/server/src/db/client";
import { findExperiences } from "../apps/server/src/db/find-experiences";
import { extractHeight, extractRideName } from "../apps/server/src/tim/index";
import { ROOT } from "./paths";

const url = process.env.PARITY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("🔴 PARITY_DATABASE_URL (or DATABASE_URL) is not set");
  process.exit(1);
}
const sql = connect(url);

type Input = { label: string; name: string | null; park: string | null; heightCm: number | null; limit: number };
const inputs: Input[] = [];
const heights = [null, 95, 110, 125, 140];
let h = 0;
const nextHeight = () => heights[h++ % heights.length]!;

// 1. The questions Tim is actually asked.
for (const set of ["golden", "robustness"]) {
  const cases = (parse(readFileSync(join(ROOT, "evals", `${set}.yaml`), "utf8")) as { cases: { id: string; ask: string }[] }).cases;
  for (const c of cases) inputs.push({ label: `${set}:${c.id}`, name: extractRideName(c.ask), park: null, heightCm: extractHeight(c.ask), limit: 6 });
}

// 2. Every ride, in every way a family might name it.
const data = JSON.parse(readFileSync(join(ROOT, "apps", "web", "src", "data", "experiences.json"), "utf8"));
const rides = (Array.isArray(data) ? data : data.experiences) as { id: string; nameEn: string; nameHe?: string; aliasesHe?: string[] }[];
for (const r of rides) {
  const names = [r.nameEn, r.nameHe, ...(r.aliasesHe ?? []), r.nameHe && `ל${r.nameHe}`, `ב-${r.nameEn}`, r.nameEn.split(/\s+/)[0]];
  for (const n of names) if (n) inputs.push({ label: `ride:${r.id}`, name: n, park: null, heightCm: nextHeight(), limit: 6 });
}

// 3. A whole park, no name (the "list the park" path), and edge cases.
const parks = (await sql`select id from park order by id`).map((p) => p.id as string);
for (const p of parks) inputs.push({ label: `park:${p}`, name: null, park: p, heightCm: nextHeight(), limit: 25 });
for (const n of ["", "  ", "??", "ab", "מה", "Mountain", "מאונטיין", "ב-Space Mountain", "זה לא מתקן בכלל"]) {
  inputs.push({ label: `edge:${JSON.stringify(n)}`, name: n, park: null, heightCm: nextHeight(), limit: 6 });
}

// The old function's columns, in the new query's order and types.
const old = (i: Input) => sql`
  select id, name, name_he, park, land, category, status, status_note, intensity,
         height_cm, max_height_cm, gets_wet, wheelchair, motion_sickness,
         sens_dark, sens_heights, sens_loud, sens_strobe, skip_line,
         last_verified::text as last_verified, fits
  from public.find_experiences(${i.name}::text, ${i.park}::text, ${i.heightCm}::int, ${i.limit}::int)`;

let same = 0;
let rows = 0;
const diffs: string[] = [];
for (const i of inputs) {
  const [a, b] = await Promise.all([old(i), findExperiences(sql, i)]);
  rows += a.length;
  const ja = JSON.stringify([...a]);
  const jb = JSON.stringify(b);
  if (ja === jb) same++;
  else diffs.push(`${i.label} name=${JSON.stringify(i.name)} park=${i.park} h=${i.heightCm}\n    function: ${a.map((r) => r.name).join(" · ") || "∅"}\n    server:   ${b.map((r) => r.name).join(" · ") || "∅"}${ja.length && jb.length && a.length === b.length ? "\n    (same rides — a field differs)" : ""}`);
}
await sql.end();

console.log(`${same}/${inputs.length} identical · ${rows} rows compared · ${diffs.length} differ`);
for (const d of diffs.slice(0, 15)) console.log("  ✗ " + d);
process.exit(diffs.length ? 1 : 0);
