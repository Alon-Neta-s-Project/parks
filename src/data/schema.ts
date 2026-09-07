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
  /**
   * הערך הגולמי מהעמודה המובנית, בלי כיווץ.
   *
   * ⚠️ `system` מכווץ ל-null את "None" (נבדק ואין), את "N/A" (לא רלוונטי —
   * ליוניברסל אין Lightning Lane כלל) ואת התא הריק (לא נבדק). שלוש
   * אמירות שונות שנקראות אותו דבר, וזו התבנית שנתפסה בפרויקט שבע פעמים.
   * השדה הזה שומר את ההבחנה כדי שהטעינה למסד תוכל להישען על ערך מובנה
   * במקום על פרוזה שמשתנה בכל ניסוח מחדש.
   */
  lightningLaneType: z.string().nullable(),
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
  /**
   * From the approved subtype map — never derived in code.
   *
   * There is no "transport" type. Buses, the monorail, the Skyliner and the
   * ferries are not in this table at all; they are logistics, and they belong in
   * the knowledge layer. A Hogwarts Express or a PeopleMover is an attraction
   * you queue for, whose form happens to be a vehicle — so the category calls
   * that scenic_ride, describing shape rather than logistics.
   */
  type: z.enum(["attraction", "show", "parade", "meet_greet", "walkthrough"]),
  category: z.enum([
    "dark_ride", "coaster", "simulator", "water_ride", "show",
    "walkthrough", "playground", "meet_greet", "scenic_ride", "360_film",
  ]),
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
   * Four states, per migration 014:
   *   "none"                       — checked, does not get you wet
   *   "may_get_wet" / "..._soaked" — checked, and this is the answer
   *   "na"                         — a stage show; the question does not apply
   *   null                         — not checked
   *
   * "na" and null are not the same thing, and collapsing them is the mistake
   * this field has already made twice. A show that cannot get you wet has an
   * answer; saying "no information" about it would be wrong in the other
   * direction.
   */
  getsWet: z.enum(["none", "may_get_wet", "may_get_soaked", "na"]).nullable(),

  /**
   * Centimetres, matching migration 012's three states exactly:
   *   0        — checked, and there is no height limit
   *   50..200  — the limit itself
   *   null     — not checked
   *
   * 0 is not a magic number: the minimum height to ride really is zero. It must
   * never reach the screen as a number, though — "0 ס\"מ" on a card is a bug.
   */
  heightRequirementCm: z.union([z.literal(0), z.number().int().min(50).max(200)]).nullable(),

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

  /**
   * The four sensitivity flags, back in scope for a subset only: roughly 68
   * anchor rides — the ones with a real queue-skipping product, which are the
   * ones people plan around anyway.
   *
   * null means NOT TAGGED, and Tim must say so outright rather than going quiet.
   * Nothing here may be derived from anything else, and in particular
   * sensEnclosedDark must never be inferred from category === "dark_ride":
   * that is an industry term for an indoor tracked ride, and Peter Pan's Flight
   * is one. Inferring it would flag a gentle family ride as a claustrophobia
   * risk and destroy trust in the flag entirely.
   */
  sensEnclosedDark: z.boolean().nullable(),
  sensHeights: z.boolean().nullable(),
  sensLoudSudden: z.boolean().nullable(),
  sensStrobe: z.boolean().nullable(),

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

/**
 * What a content page needs before it counts as complete.
 *
 * Two fields were dropped from this list on purpose. Opening year changes no
 * decision anyone makes — nobody picks a ride by its age — and ride length
 * belongs to the day-planning screen in V2, not to deciding whether a ride suits
 * your family. Holding a page incomplete over either of them measures the wrong
 * thing.
 *
 * It does not move today's count, which nameHe alone holds at zero. It does move
 * the projection: with nameHe filled the count is 54 rather than 33, so the two
 * fields were suppressing a third of the pages they would never have informed.
 */
export const REQUIRED_FIELDS = [
  "nameHe",
  "intensity",
  "heightRequirementCm",
  "motionSicknessWarning",
  "wheelchair",
  "getsWet",
  "airConditioned",
  "environment",
] as const;
