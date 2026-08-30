import { z } from "zod";

/**
 * The workbook is the database, so these types are derived from its columns —
 * not from an imagined schema. Anything the workbook does not carry is typed as
 * nullable and stays null; the UI renders those as an explicit empty state so a
 * gap reads as a gap rather than disappearing.
 *
 * One schema, used by the dataset test and (later) by any admin form, per the
 * brief's single-source-of-truth rule.
 */

export const intensitySchema = z.object({
  /** 1–4 from DisneyGirlBlog, or null where it has no explicit rating. Never 0. */
  value: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  basis: z.string(),
  rated: z.boolean(),
});

export const statusSchema = z.object({
  state: z.enum(["open", "closed", "check"]),
  /** The workbook's original sentence, kept because it carries dates. */
  note: z.string().nullable(),
});

export const fastAccessSchema = z.object({
  system: z.enum(["Multi Pass", "Single Pass", "None", "N/A"]),
  offered: z.boolean(),
  inMultiPass: z.enum(["Yes", "No", "N/A"]),
  singlePassRequired: z.boolean(),
  premierIncluded: z.enum(["Yes", "No", "N/A"]),
  extraCost: z.boolean(),
  summary: z.string(),
  notes: z.string(),
  /** Universal rows where official participation could not be confirmed. */
  unconfirmed: z.boolean(),
});

export const sourceSchema = z.object({
  url: z.string().url(),
  /** T1 official operator, T4 aggregator. Safety fields may only cite T1. */
  tier: z.union([z.literal(1), z.literal(4)]),
  role: z.enum(["official", "access", "intensity"]),
});

export const experienceSchema = z.object({
  id: z.string().min(1),
  nameEn: z.string().min(1),
  nameHe: z.string().nullable(),
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
  fastAccess: fastAccessSchema,
  sources: z.array(sourceSchema).min(1),
  sourceVerifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  // Absent from the workbook. Present as nulls on purpose — see docs/content-file-analysis.md.
  heightMinCm: z.null(),
  sensitivities: z.null(),
  durationMin: z.null(),
  opened: z.null(),
  getsWet: z.null(),
  airConditioned: z.null(),
  accessibility: z.null(),
  popularity: z.null(),
  editorial: z.null(),
  youtubeId: z.null(),
});

export const parkSchema = z.object({
  name: z.string().min(1),
  resort: z.enum(["Disney World", "Universal Orlando"]),
  kind: z.enum(["theme", "water"]),
  count: z.number().int().positive(),
  rated: z.number().int().nonnegative(),
  lands: z.array(z.string()).min(1),
});

export type Experience = z.infer<typeof experienceSchema>;
export type Park = z.infer<typeof parkSchema>;
export type IntensityLevel = 1 | 2 | 3 | 4;
