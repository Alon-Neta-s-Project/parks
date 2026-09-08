import type { Experience, Park, QuadState } from "./schema";

/**
 * The database row shape, translated into what the app already speaks.
 *
 * Two things this file exists to prevent, both of which are quiet:
 *
 * 1. **A missing column reading as a missing fact.** Every mapping here is
 *    explicit, and anything the query does not select is a compile error rather
 *    than an undefined that renders as an empty row.
 * 2. **Park names drifting apart.** The database calls it "Disney's Animal
 *    Kingdom Theme Park"; the app, its i18n file and parks.json call it
 *    "Disney's Animal Kingdom". Joining on the database's own name would filter
 *    every Animal Kingdom row out of Browse with no error at all — the list
 *    would simply be empty. The id is the join, and PARK_NAME is the one place
 *    the two vocabularies meet.
 */

/** id → the name the app uses. Verified against parks.json by a test. */
export const PARK_NAME: Record<string, string> = {
  mk: "Magic Kingdom",
  epcot: "EPCOT",
  ak: "Disney's Animal Kingdom",
  hs: "Disney's Hollywood Studios",
  bb: "Disney's Blizzard Beach",
  tl: "Disney's Typhoon Lagoon",
  ioa: "Universal Islands of Adventure",
  us: "Universal Studios Florida",
  epic: "Universal Epic Universe",
  vb: "Universal Volcano Bay",
};

const RESORT: Record<string, Experience["resort"]> = {
  wdw: "Disney World",
  uor: "Universal Orlando",
};

/**
 * The database keeps four states; the app's card shows three.
 *
 * ⚠️ "temporarily_closed" and "coming_soon" both become "check" — not "closed".
 * A ride that opens in September is not a ride that closed, and telling a family
 * planning a trip that it is closed would be wrong in the direction that costs
 * them the visit. status.note carries the export's own sentence, dates included.
 */
const STATUS: Record<string, Experience["status"]["state"]> = {
  open: "open",
  closed: "closed",
  temporarily_closed: "check",
  coming_soon: "check",
};

/**
 * The skip-the-line vocabulary, operator-neutral since migration 016.
 *
 * ⚠️ null and 'none' are different answers and are kept apart all the way to
 * the screen: null is "nobody checked", 'none' is "checked, there is no such
 * product here". 74 rows are null and 75 are 'none' — collapsing them would
 * turn 74 unknowns into a confident "no".
 */
const SKIP_LINE_LABEL: Record<string, Experience["fastAccess"]["system"]> = {
  multi_pass: "Multi Pass",
  single_pass: "Single Pass",
};

/** A row as selected by the query below. Widening it is a compile error here. */
export interface ExperienceRow {
  id: string;
  key: string | null;
  name: string;
  name_i18n: { he?: string | null } | null;
  aliases_i18n: { he?: string[] | null } | null;
  park_id: string;
  land_id: string | null;
  kind: string;
  type: string;
  category: string;
  subtype: string | null;
  status: string;
  status_note: string | null;
  admission: string | null;
  reservation: string | null;
  included_with_admission: string | null;
  intensity: number | null;
  opened_year: number | null;
  duration_minutes: number | null;
  max_speed_kmh: number | string | null;
  inversions: number | null;
  height_requirement_cm: number | null;
  /**
   * ⚠️ אופציונלי בכוונה: מסד שעדיין לא קיבל את מיגרציה 038 אינו מחזיר את
   * העמודה, והקוד אמור להמשיך לעבוד ולקרוא אותה כ"לא נבדק" — ולא ליפול.
   */
  max_height_requirement_cm?: number | null;
  gets_wet: string | null;
  environment: string | null;
  air_conditioned: string | null;
  wheelchair: string | null;
  motion_sickness_warning: string | null;
  is_motion_simulator: string | null;
  uses_large_screens_or_3d: string | null;
  big_drops: string | null;
  spinning: string | null;
  skip_line_system: string | null;
  // ⚠️ טקסט ולא בוליאני, מאז מיגרציה 040. בוליאני מחזיק שלושה מצבים ואינו
  // יכול להפריד "לא נבדק" מ"לא רלוונטי", וזה בדיוק ההבדל ש-77 שורות
  // המופעים נשענות עליו.
  sens_enclosed_dark: string | null;
  sens_heights: string | null;
  sens_loud_sudden: string | null;
  sens_strobe: string | null;
  last_verified: string | null;
  land: { name: string } | null;
  park: { park_kind: string; resort_id: string } | null;
}

/** The columns the app needs, named once. */
export const EXPERIENCE_SELECT = `
  id, key, name, name_i18n, aliases_i18n, park_id, land_id, kind, type, category,
  subtype, status, status_note, admission, reservation, included_with_admission,
  intensity, opened_year, duration_minutes, max_speed_kmh, inversions,
  height_requirement_cm, gets_wet, environment, air_conditioned, wheelchair,
  motion_sickness_warning, is_motion_simulator, uses_large_screens_or_3d,
  big_drops, spinning, skip_line_system,
  sens_enclosed_dark, sens_heights, sens_loud_sudden, sens_strobe, last_verified,
  land ( name ), park ( park_kind, resort_id )
`.replace(/\s+/g, " ").trim();

const quad = (v: string | null): QuadState =>
  v === "true" || v === "false" || v === "na" ? v : null;

/**
 * ⚠️ numeric comes back from PostgREST as a string, because JavaScript numbers
 * cannot hold every numeric value. Number("") is 0 and Number(null) is 0, and a
 * speed of 0 km/h would be rendered as fact. Empty stays null.
 */
const numeric = (v: number | string | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * One row, or a reason it was refused.
 *
 * ⚠️ Refused rather than repaired. A row whose park id is unknown, or whose
 * vocabulary value is not in the closed set, is a row we do not understand — and
 * a default here would put a guess on screen wearing the same font as a fact.
 * This is the same rule the importer enforces (CLAUDE.md: an out-of-vocabulary
 * Subtype stops the row).
 */
export function toExperience(row: ExperienceRow): Experience | { refused: string } {
  const parkName = PARK_NAME[row.park_id];
  if (!parkName) return { refused: `park_id לא מוכר: ${row.park_id}` };
  const resort = RESORT[row.park?.resort_id ?? ""];
  if (!resort) return { refused: `resort_id לא מוכר: ${row.park?.resort_id}` };
  const state = STATUS[row.status];
  if (!state) return { refused: `status לא מוכר: ${row.status}` };
  if (!row.land?.name) return { refused: "אין אזור" };
  if (!row.last_verified) return { refused: "אין תאריך אימות" };
  if (!row.key) return { refused: "אין Key" };

  const skip = row.skip_line_system;
  return {
    id: row.id,
    key: row.key,
    nameEn: row.name,
    nameHe: row.name_i18n?.he ?? null,
    aliasesHe: row.aliases_i18n?.he ?? [],
    resort,
    park: parkName,
    parkKind: row.park?.park_kind === "water" ? "water" : "theme",
    kind: row.kind as Experience["kind"],
    type: row.type as Experience["type"],
    category: row.category as Experience["category"],
    land: row.land.name,
    subtype: row.subtype ?? "",

    // ⚠️ rated is not "value is truthy". Migration 011 forbids 0, so a rated
    // row always carries 1–4 — but the distinction being drawn is checked
    // versus unchecked, and writing it as `!!value` would quietly re-introduce
    // the "unrated is gentle" bug the schema comment warns about.
    intensity: {
      value: (row.intensity ?? null) as Experience["intensity"]["value"],
      rated: row.intensity !== null,
    },
    status: { state, note: row.status_note },
    admission: row.admission ?? "",
    reservation: row.reservation ?? "",
    includedWithAdmission: row.included_with_admission ?? "",

    // ⚠️ Everything here is derived from one column, skip_line_system. The
    // seven extra fields exist because the app's shape still carries them; they
    // are a view of one value, never a second place it is stored. The approved
    // trim to two fields removes them, and until it lands nothing here may be
    // written from anywhere but `skip`.
    fastAccess: {
      system: skip ? (SKIP_LINE_LABEL[skip] ?? null) : null,
      // ⚠️ נגזר מ-skip_line_system ואינו עמודה שנייה במסד. הוא קיים בצורה
      // כדי שהסכמה תהיה אחת לשני מקורות הנתונים; המסד כבר מחזיק את
      // ההבחנה בערך עצמו, ולכן אין כאן מה לשמר בנפרד.
      lightningLaneType: skip ? (SKIP_LINE_LABEL[skip] ?? null) : null,
      offered: skip !== null && skip !== "none",
      inMultiPass: skip === null ? null : skip === "multi_pass" ? "Yes" : "No",
      singlePassRequired: skip === "single_pass",
      premierIncluded: null,
      extraCost: skip === "single_pass",
      summary: "",
      unconfirmed: skip === null,
    },

    openedYear: row.opened_year,
    durationMinutes: numeric(row.duration_minutes),
    maxSpeedKmh: numeric(row.max_speed_kmh),
    inversions: row.inversions,
    bigDrops: quad(row.big_drops),
    spinning: quad(row.spinning),
    environment: row.environment,
    airConditioned: quad(row.air_conditioned),
    isMotionSimulator: quad(row.is_motion_simulator),
    usesLargeScreensOr3d: quad(row.uses_large_screens_or_3d),
    getsWet: row.gets_wet as Experience["getsWet"],
    heightRequirementCm: row.height_requirement_cm as Experience["heightRequirementCm"],
    // ⚠️ הכיוון ההפוך: עד כמה מותר להיות גבוה. עמודה חדשה, ומסד שעוד לא
    // קיבל את המיגרציה מחזיר undefined — שאינו null ואינו עובר את הסכמה.
    // ההמרה המפורשת היא מה שהופך "המסד מפגר אחרי הקוד" לשורה שנקראת
    // כ"לא נבדק" במקום לחריגה.
    maxHeightRequirementCm:
      (row.max_height_requirement_cm as number | null | undefined) ?? null,
    wheelchair: row.wheelchair as Experience["wheelchair"],
    motionSicknessWarning: quad(row.motion_sickness_warning),
    lastVerified: row.last_verified,

    // ⚠️ דרך `quad` ולא ישירות. ערך שאינו באוצר המילים הסגור נקרא כ"לא
    // נבדק" במקום להיכנס כמות שהוא — מסד שנשאר על הטיפוס הבוליאני הישן
    // היה מחזיר כאן `true`, שאינו תואם לסכמה ומפיל את השורה.
    sensEnclosedDark: quad(row.sens_enclosed_dark),
    sensHeights: quad(row.sens_heights),
    sensLoudSudden: quad(row.sens_loud_sudden),
    sensStrobe: quad(row.sens_strobe),

    youtubeId: null,
    videoCreator: null,
    editorial: null,
  };
}

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * The parks list, counted from the rows themselves.
 *
 * ⚠️ Counted, not stored. parks.json carries count and rated as numbers written
 * at build time; a stored count next to a live list is a second source of truth
 * that goes stale the first time a row is added.
 */
export function toParks(experiences: Experience[]): Park[] {
  const by = new Map<string, Experience[]>();
  for (const e of experiences) {
    const rows = by.get(e.park);
    if (rows) rows.push(e);
    else by.set(e.park, [e]);
  }
  return [...by.entries()]
    .filter((entry): entry is [string, [Experience, ...Experience[]]] => entry[1].length > 0)
    .map(([name, rows]) => ({
      name,
      slug: slugify(name),
      resort: rows[0].resort,
      kind: rows[0].parkKind,
      count: rows.length,
      rated: rows.filter((e) => e.intensity.rated).length,
      lands: [...new Set(rows.map((e) => e.land))].sort(),
    }))
    .sort((a, b) => a.resort.localeCompare(b.resort) || b.count - a.count);
}
