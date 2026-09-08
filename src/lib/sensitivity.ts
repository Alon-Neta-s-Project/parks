import type { Experience } from "../data/schema";

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
export type Sensitivity =
  | "dark"
  | "loudSudden"
  | "strobe"
  | "heights"
  | "motionSickness"
  | "accessibility"
  | "longQueues";

export const sensitivities: Sensitivity[] = [
  "dark",
  "loudSudden",
  "strobe",
  "heights",
  "motionSickness",
  "accessibility",
  "longQueues",
];

/**
 * The ones a column can answer, and therefore the only ones that ever tag a
 * ride.
 *
 * ⚠️ `longQueues` is a real answer to the question and is missing here on
 * purpose. It is a fact about the day, not about the ride: no column holds it,
 * so it steers the plan — skip-line products, a condensed list — and never
 * appears beside a ride name. Leaving it in would print "queue length not
 * checked" under all 242 rows, which is true and useless.
 */
export const rideSensitivities: Sensitivity[] = sensitivities.filter(
  (s) => s !== "longQueues",
);

/**
 * What we know about one ride on one sensitivity.
 *
 * ⚠️ Four states, and the two beyond flagged/clear are the whole point.
 * "unchecked" is nobody having looked. "depends" is the row having been checked
 * and the answer genuinely being about the person, not the ride. This is the
 * seventh occurrence of the same pattern in this project written down as a type
 * instead of a comment, so that a caller cannot collapse it by accident: a
 * boolean would have forced both into one of the two answers at the point of
 * reading, which is precisely how gets_wet, the four sens_* columns and
 * skip_line_system each got flattened.
 */
export type SensitivityState = "flagged" | "clear" | "depends" | "unchecked";

const fromFlag = (v: boolean | null): SensitivityState =>
  v === null ? "unchecked" : v ? "flagged" : "clear";

/**
 * Whether this ride carries this sensitivity.
 *
 * ⚠️ `longQueues` answers "unchecked" because no column holds it, and callers
 * reach it only by asking directly — the two helpers below and every filter
 * work from `rideSensitivities`, which leaves it out.
 */
export function sensitivityStateFor(e: Experience, s: Sensitivity): SensitivityState {
  switch (s) {
    case "dark":
      // ⚠️ Never inferred from category === "dark_ride". That is an industry
      // term for a tracked indoor ride and predicts nothing about darkness —
      // it is written into CLAUDE.md because it was inferred once already.
      return fromFlag(e.sensEnclosedDark);
    case "loudSudden":
      return fromFlag(e.sensLoudSudden);
    case "strobe":
      return fromFlag(e.sensStrobe);
    case "heights":
      // ⚠️ Not height_requirement_cm, which is the opposite thing: that is how
      // tall you must be to board. This is whether the ride goes high enough to
      // frighten someone who is afraid of heights.
      //
      // 🔴 This comment used to claim 77 of the 242 rows had never been checked
      // — "the only one of the four with a real gap". That was false. It was
      // copied from the brief and never measured, and it was about to send a
      // researcher after 77 rows that are already answered.
      //
      // Measured: every one of the 165 attractions carries TRUE or FALSE. The
      // 77 are all 77 Entertainment rows — shows, parades, character meets —
      // and the master marks them N/A, which means the question does not
      // apply. Somebody did look.
      //
      // ⚠️ What is real, and is a bug still open: the importer's boolFlag
      // collapses N/A into null, so this returns "unchecked" for all 77. A
      // family avoiding heights therefore loses every show from their results
      // — the very things that suit them — and is told the data was not
      // checked when it was. quadState keeps "na" as its own value; the four
      // sens_* columns do not use it. Awaiting Philip's call on the fix.
      return fromFlag(e.sensHeights);
    case "accessibility":
      // ⚠️ Five values, and squeezing them into yes/no was the first thing the
      // compiler refused. Only one of them is a barrier that holds for every
      // wheelchair user; three are a transfer, whose difficulty is a fact about
      // the person and not about the ride.
      //
      // Excluding a transfer ride would hide most of the park from someone who
      // can transfer, and clearing it would promise boarding to someone who
      // cannot. So it is neither: it stays in the list, marked.
      switch (e.wheelchair) {
        case null:
          return "unchecked";
        case "must_be_ambulatory":
          return "flagged";
        case "remain_in_wheelchair":
          return "clear";
        default:
          return "depends";
      }
    case "motionSickness": {
      // The four-state string field, mapped onto the same three states. "na"
      // means the question does not apply to this row, which is an answer
      // about the question and not about the ride — so it is not a clean bill.
      const v = e.motionSicknessWarning;
      if (v === "true") return "flagged";
      if (v === "false") return "clear";
      return "unchecked";
    }
    case "longQueues":
      return "unchecked";
  }
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
