import { experiences } from "../data";
import { hasMinors, type Member } from "./group";
import type { Profile } from "./profile";
import { rideSensitivities, sensitivityStateFor, type Sensitivity } from "./sensitivity";

/**
 * What Tim says back after an answer, and why it is a number.
 *
 * Dana's onboarding artboard puts a short 💡 line under each answer — "רשמתי
 * את הגובה שלה, אסמן בדיוק אילו ממתקני־העוגן כבר פתוחים לה". The line is what
 * makes the questions feel like they bought something rather than like a form,
 * and it is the one place where a family finds out whether answering was worth
 * it.
 *
 * ⚠️ Which is exactly why it must not be a canned sentence. "רשמתי!" costs
 * nothing and proves nothing; "83 מתוך 242 כבר פתוחים לה" is a claim that would
 * be visibly wrong if the answer had not landed. So every line here is counted
 * from the dataset at the moment it is shown, and a question whose answer buys
 * nothing measurable gets no line at all.
 */
export interface Acknowledgement {
  /** The line to show. Null when there is nothing true worth saying. */
  key: string;
  count?: number;
  total?: number;
  /** Only set when the answer named something. */
  list?: string;
}

const openRides = () => experiences.filter((e) => e.status.state !== "closed");

/**
 * How many rides the shortest member of the group can already board.
 *
 * ⚠️ Counted against the shortest child, not against the group. The number a
 * parent wants is "what is open to the one who will be turned away", and an
 * average would quietly answer a question nobody asked.
 *
 * ⚠️ And a ride whose height limit was never checked is not counted as open.
 * It is the same rule as everywhere else in this codebase: unknown is not a
 * clean bill, and a number that included them would be a promise.
 */
export function ridesOpenToShortest(members: Member[]): { count: number; total: number } | null {
  const heights = members
    .map((m) => m.heightCm)
    .filter((h): h is number => h !== null);
  if (!heights.length) return null;
  const shortest = Math.min(...heights);

  const rides = openRides();
  const count = rides.filter(
    (e) => e.heightRequirementCm !== null && shortest >= e.heightRequirementCm,
  ).length;
  return { count, total: rides.length };
}

/** How many open rides carry any of the sensitivities the group named. */
export function ridesFlaggedFor(wanted: Sensitivity[]): { count: number; total: number } {
  const rides = openRides();
  const count = rides.filter((e) =>
    rideSensitivities.some(
      (s) => wanted.includes(s) && sensitivityStateFor(e, s) === "flagged",
    ),
  ).length;
  return { count, total: rides.length };
}

/**
 * The line for one answered question, or null for silence.
 *
 * ⚠️ Silence is a real return value and is used often. A family that gave an
 * answer Tim cannot act on yet — no child, no sensitivities, a preference that
 * only matters once a park is chosen — gets nothing rather than a warm noise.
 * A line under every answer trains people to stop reading the lines.
 */
export function acknowledge(questionId: string, profile: Profile): Acknowledgement | null {
  if (questionId === "group") {
    // Nothing to say about a party of adults: every height limit clears.
    if (!hasMinors(profile.members)) return null;
    const measured = ridesOpenToShortest(profile.members);
    // ⚠️ A child whose height we never got is the case where saying nothing is
    // wrong. The gap is the point, and it is named rather than skipped.
    if (!measured) return { key: "ack.group.noHeight" };
    return { key: "ack.group.open", count: measured.count, total: measured.total };
  }

  if (questionId === "sensitivities") {
    if (!profile.sensitivities.length) return null;
    const flagged = ridesFlaggedFor(profile.sensitivities);
    // Named only queue tolerance, which no column answers: say what will
    // actually happen instead of a count that would be zero and read as "none".
    if (flagged.count === 0 && profile.sensitivities.includes("longQueues")) {
      return { key: "ack.sensitivities.planOnly" };
    }
    return { key: "ack.sensitivities.flagged", count: flagged.count };
  }

  return null;
}
