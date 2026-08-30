import { experiences, parks } from "./index";
import type { IntensityLevel } from "./schema";

/**
 * Derived from the dataset at load time rather than transcribed, so the
 * taxonomy cannot drift from the workbook.
 */

export const resorts = ["Disney World", "Universal Orlando"] as const;
export type Resort = (typeof resorts)[number];

export const intensityLevels: IntensityLevel[] = [1, 2, 3, 4];

export const parkNames = parks.map((p) => p.name);

export const parksByResort = (resort: Resort) => parks.filter((p) => p.resort === resort);

export const landsIn = (park: string): string[] =>
  [...new Set(experiences.filter((e) => e.park === park).map((e) => e.land))].sort();

export const subtypes = [...new Set(experiences.map((e) => e.subtype))].sort();

/** How many rides in a park carry no intensity rating — shown, never hidden. */
export const unratedIn = (parkNamesIn: string[]): number =>
  experiences.filter((e) => parkNamesIn.includes(e.park) && !e.intensity.rated).length;
