import { z } from "zod";

/**
 * One schema, used by the importer and by the app (brief §11.1).
 *
 * Every field maps to a column in product_export.csv, which is the only content
 * input. Anything the export does not carry stays null and shows as an explicit
 * gap — never filled in from anywhere else.
 *
 * Migration 007 (db/migrations/) is the SQL form of this; this file is where it
 * actually takes effect today.
 */

/**
 * Four-state, per data spec §3.1. A Postgres boolean holds three states and
 * cannot separate "we don't know" from "doesn't apply to this kind of activity",
 * so the distinction is carried explicitly:
 *   "true" | "false" — found to be so
 *   "na"             — not applicable to this kind of activity
 *   null             — not enough information yet
 */
export const quadStateSchema = z.enum(["true", "false", "na"]).nullable();
export type QuadState = z.infer<typeof quadStateSchema>;

/** Five transfer modes, per data spec §3.3. Three would lose real distinctions. */
export const wheelchairSchema = z
  .enum([
    "remain_in_wheelchair",
    "transfer_ecv_to_wheelchair",
    "transfer_to_ride_vehicle",
    "transfer_wheelchair_then_ride",
    "must_be_ambulatory",
  ])
  .nullable();

export const intensitySchema = z.object({
  /** 1–4, or null where the export says Unknown. Never 0 — unrated is not gentle. */
  value: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  rated: z.boolean(),
});

export const statusSchema = z.object({
  state: z.enum(["open", "closed", "check"]),
  /** The export's own sentence, kept because it carries dates. */
  note: z.string().nullable(),
});

export const fastAccessSchema = z.object({
  /** null where the export leaves it blank, meaning no such product here. */
  system: z.enum(["Multi Pass", "Single Pass"]).nullable(),
  offered: z.boolean(),
  inMultiPass: z.enum(["Yes", "No"]).nullable(),
  singlePassRequired: z.boolean(),
  premierIncluded: z.enum(["Yes", "No"]).nullable(),
  extraCost: z.boolean(),
  summary: z.string(),
  /** Universal rows where official Express participation is unconfirmed. */
  unconfirmed: z.boolean(),
});

export const experienceSchema = z.object({
  id: z.string().min(1),
  /** The export's Key. The stability key across re-imports. */
  key: z.string().min(1),
  nameEn: z.string().min(1),
  nameHe: z.string().nullable(),
  aliasesHe: z.array(z.string()),

  resort: z.enum(["Disney World", "Universal Orlando"]),
  park: z.string().min(1),
  parkKind: z.enum(["theme", "water"]),
  kind: z.enum(["attraction", "entertainment"]),
  land: z.string().min(1),
  subtype: z.string().min(1),

  intensity: intensitySchema,
  status: statusSchema,
  admission: z.string(),
  reservation: z.string(),
  includedWithAdmission: z.string(),
  fastAccess: fastAccessSchema,

  // ---- ride characteristics (data spec §2.6–2.7) ----
  openedYear: z.number().int().nullable(),
  durationMinutes: z.number().nullable(),
  maxSpeedKmh: z.number().nullable(),
  inversions: z.number().int().nullable(),
  bigDrops: quadStateSchema,
  spinning: quadStateSchema,
  environment: z.string().nullable(),
  airConditioned: quadStateSchema,
  isMotionSimulator: quadStateSchema,
  usesLargeScreensOr3d: quadStateSchema,
  /**
   * Three values, not four: migration 007 deliberately left this an enum where
   * the other mechanical flags became four-state.
   * null here means the export has not filled it. The database defaults it to
   * "none", which is a conflict worth knowing about — see docs/db-conformance.md.
   */
  getsWet: z.enum(["none", "may_get_wet", "may_get_soaked"]).nullable(),

  /**
   * Centimetres only, rounded from the official inches in the master.
   * null = not found. "No limit" must be an explicit finding, never a default,
   * so it is carried as noHeightLimit rather than as height 0.
   */
  heightRequirementCm: z.number().int().nullable(),
  noHeightLimit: z.boolean(),

  wheelchair: wheelchairSchema,

  /**
   * A dependable indication that the ride may cause motion sickness.
   *
   * Explicitly NOT the operator's own safety notice: Disney pastes an identical
   * block across a whole class of rides, which marked all 25 Magic Kingdom
   * attractions including a slow driving track while leaving the spinning
   * teacups unmarked. It measured the presence of legal wording, not the risk.
   * The value now comes from sources that actually rate nausea.
   *
   * Those sources are T3/T4, so this field is outside the T1-only carve-out,
   * which now covers height limits and accessibility alone. Tim reports the
   * value and never attributes it to an official source.
   */
  motionSicknessWarning: quadStateSchema,

  /**
   * The only date in the export. Shown as "checked on", never with a source
   * name: attribution stays in the master, freshness is what users need.
   */
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  // ---- held back deliberately ----
  /** Master-only until embedding and commercial use are settled (spec §3.4). */
  youtubeId: z.null(),
  videoCreator: z.null(),
  /** Editorial voice: only Neta writes this. */
  editorial: z.null(),
});

export const parkSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  resort: z.enum(["Disney World", "Universal Orlando"]),
  kind: z.enum(["theme", "water"]),
  count: z.number().int().positive(),
  rated: z.number().int().nonnegative(),
  lands: z.array(z.string()).min(1),
});

export type Experience = z.infer<typeof experienceSchema>;
export type Park = z.infer<typeof parkSchema>;
export type IntensityLevel = 1 | 2 | 3 | 4;

/** Required for a page to count as complete (brief §3.3a, minus held-back video). */
export const REQUIRED_FIELDS = [
  "nameHe",
  "intensity",
  "heightRequirementCm",
  "motionSicknessWarning",
  "wheelchair",
  "durationMinutes",
  "openedYear",
  "getsWet",
  "airConditioned",
  "environment",
] as const;
