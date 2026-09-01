import { experiences } from "../data";
import type { Experience } from "../data/schema";

/**
 * What kind of thing the user just asked for.
 *
 * The distinction that matters is not whether they answered a question — it is
 * what they asked for:
 *
 *   a pointed factual question   → answer it, no onboarding
 *   a request to plan            → ask the three opening questions first
 *
 * "Plan me a day" is a trigger for onboarding, not for a recommendation. People
 * who actually ask for planning help open with their party, their dates and
 * their appetite for thrills unprompted; a generic plan handed back to that
 * request is a failure, not a reasonable default.
 */
export type Intent = "factual" | "planning" | "unclear";

/** Words that mean "help me plan", not "tell me a fact". */
const PLANNING = [
  "תכנן", "תכננו", "לתכנן", "תכנון", "מסלול", "סדר יום", "יום שלם",
  "עזרו לי", "תעזור", "תעזרו", "המלצות", "תמליץ", "תמליצו", "מה לעשות",
  "plan", "itinerary", "schedule", "help me",
];

/** A question about a specific stated fact. */
const FACT_WORDS = [
  "גובה", "מגבלת", "ס\"מ", "סנטימטר",
  "בחילה", "מבחיל", "סחרחורת",
  "מרטיב", "הרטבה", "רטוב",
  "כמה זמן", "משך", "אורך",
  "נגיש", "נגישות", "כיסא", "גלגלים",
  "ממוזג", "מיזוג",
  "עוצמ", "אינטנסיב", "מפחיד",
  "תור", "דילוג", "פאס",
  "height", "how long", "wet", "nausea", "accessible", "intensity",
];

/**
 * Match a ride by name.
 *
 * Deliberately exact-substring only. Transliteration-tolerant fuzzy matching is
 * a separate, deferred piece of work — building it now would mean tuning it
 * before there is anything to tune it against, and a search that half-finds is
 * worse than one that does not exist.
 */
const namesOf = (e: Experience) => [e.nameEn, e.nameHe, ...e.aliasesHe].filter(Boolean) as string[];

/**
 * Tokens that identify exactly one ride.
 *
 * People write "TRON", not "TRON Lightcycle / Run". A single word is safe to
 * match on only when it belongs to one ride and one ride alone — "Space" points
 * at both Space Mountain and Mission: SPACE, so it identifies nothing and is
 * left out. Built once from the dataset rather than hand-listed, so it stays
 * correct as rides are added.
 */
const uniqueTokens: Map<string, Experience> = (() => {
  const seen = new Map<string, Experience | null>();
  for (const e of experiences) {
    for (const name of namesOf(e)) {
      for (const raw of name.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
        if (raw.length < 4) continue;
        const existing = seen.get(raw);
        if (existing === undefined) seen.set(raw, e);
        else if (existing && existing.id !== e.id) seen.set(raw, null);
      }
    }
  }
  const out = new Map<string, Experience>();
  for (const [token, e] of seen) if (e) out.set(token, e);
  return out;
})();

export function findExperience(text: string): Experience | null {
  const q = text.trim().toLowerCase();
  if (q.length < 3) return null;

  const candidates: { e: Experience; length: number }[] = [];
  for (const e of experiences) {
    for (const name of namesOf(e)) {
      const n = name.toLowerCase();
      // Require a real overlap, not a stray two-letter coincidence.
      if (n.length >= 3 && q.includes(n)) candidates.push({ e, length: n.length });
    }
  }

  if (!candidates.length) {
    for (const token of q.split(/[^\p{L}\p{N}]+/u)) {
      const hit = uniqueTokens.get(token);
      if (hit) candidates.push({ e: hit, length: token.length });
    }
  }

  if (!candidates.length) return null;
  // The longest match wins, so "Space Mountain" beats a ride merely called "Space".
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0]!.e;
}

export function classify(text: string): Intent {
  const q = text.trim().toLowerCase();
  if (!q) return "unclear";

  const wantsPlan = PLANNING.some((w) => q.includes(w));
  const named = findExperience(q) !== null;
  const asksFact = FACT_WORDS.some((w) => q.includes(w));

  // A named ride with a fact word is a factual question even if it also contains
  // a planning word — "what is the height limit, we're planning a day" is still
  // a question with an answer.
  if (named && asksFact) return "factual";
  if (wantsPlan) return "planning";
  if (named) return "factual";
  return "unclear";
}

export type FactKey =
  | "height" | "intensity" | "nausea" | "wet" | "duration"
  | "wheelchair" | "airConditioned" | "fastAccess";

/** Which fact was asked about, so the answer is the one requested. */
export function whichFact(text: string): FactKey | null {
  const q = text.toLowerCase();
  if (/גובה|מגבלת|ס"מ|סנטימטר|height/.test(q)) return "height";
  if (/בחילה|מבחיל|סחרחורת|nausea/.test(q)) return "nausea";
  if (/מרטיב|הרטבה|רטוב|wet/.test(q)) return "wet";
  if (/כמה זמן|משך|אורך|how long|duration/.test(q)) return "duration";
  if (/נגיש|כיסא|גלגלים|accessible|wheelchair/.test(q)) return "wheelchair";
  if (/ממוזג|מיזוג|air.?condition/.test(q)) return "airConditioned";
  if (/תור|דילוג|פאס|lightning|express/.test(q)) return "fastAccess";
  if (/עוצמ|אינטנסיב|מפחיד|intensity/.test(q)) return "intensity";
  return null;
}
