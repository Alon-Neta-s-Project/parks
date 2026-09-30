import type { Experience } from "../data/schema";
import {
  rideSensitivities,
  sensitivityState,
  type Sensitivity,
  type SensitivityState,
} from "../../../../packages/shared/src/filters";
import { rideFacts } from "./ride-facts";

/**
 * The sensitivity question, and what each answer is actually allowed to claim.
 *
 * Dana's onboarding artboard asks it in one breath — "פחד מחושך/רעש, נטייה
 * למחלת־ים, או צורך בנגישות מיוחדת" — and Tim then promises to tag the rides
 * that matter. This file is what makes that promise true rather than warm.
 *
 * ⚠️ The copy lumps dark and noise together; the data does not, and neither do
 * we. A child who is startled by sudden loud noises is not a child who is
 * frightened of the dark, and a single "dark/noise" flag would tag every dark
 * ride as a problem for her and every loud one as a problem for him. Three
 * separate chips, three separate columns, one claim each.
 *
 * ⚠️ And strobe and heights are here even though the copy names neither. We
 * hold both columns; photosensitivity is the one item on this list with a
 * medical consequence, and fear of heights is the one people volunteer without
 * being asked. A signal we hold and do not offer is a signal we discard.
 */
// The type, the lists and the states live with the filter rules (packages/shared/src/filters.ts),
// so the web app and Tim's query_rides read one definition.
export {
  rideSensitivities,
  sensitivities,
  type Sensitivity,
  type SensitivityState,
} from "../../../../packages/shared/src/filters";

/**
 * Whether this ride carries this sensitivity.
 *
 * ⚠️ `longQueues` answers "unchecked" because no column holds it, and callers
 * reach it only by asking directly — the two helpers below and every filter
 * work from `rideSensitivities`, which leaves it out.
 */
export function sensitivityStateFor(e: Experience, s: Sensitivity): SensitivityState {
  // ⚠️ The rules — never "dark" from category === "dark_ride", "na" as an answer and not a gap,
  // the five wheelchair values — are in packages/shared/src/filters.ts `sensitivityState`.
  return sensitivityState(rideFacts(e), s);
}

/** Every sensitivity whose answer here depends on the person, not the ride. */
export const dependsFor = (e: Experience, wanted: Sensitivity[]): Sensitivity[] =>
  rideSensitivities.filter(
    (s) => wanted.includes(s) && sensitivityStateFor(e, s) === "depends",
  );

/** Every sensitivity this ride is flagged for, in the declared order. */
export const flagsFor = (e: Experience, wanted: Sensitivity[]): Sensitivity[] =>
  rideSensitivities.filter(
    (s) => wanted.includes(s) && sensitivityStateFor(e, s) === "flagged",
  );

/**
 * Every sensitivity nobody checked on this ride, in the declared order.
 *
 * ⚠️ This is what the interface has to say out loud. A ride that is merely
 * unchecked looks identical to a safe one until someone prints the difference,
 * and a family that asked to avoid sudden noise reading a clean list will
 * assume the list is clean.
 */
export const uncheckedFor = (e: Experience, wanted: Sensitivity[]): Sensitivity[] =>
  rideSensitivities.filter(
    (s) => wanted.includes(s) && sensitivityStateFor(e, s) === "unchecked",
  );
