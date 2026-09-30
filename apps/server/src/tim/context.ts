import { todayLine } from "./prompt";
import type { ExperienceRow, KnowledgeChunk, ParkCandidate } from "./lookup";

/**
 * The candidate rows, with no intensity filter — the filtering is the model's job.
 *
 * ⚠️ **Intensity is stated on every row**, because without it the model cannot honor
 * "לא אוהבים אקסטרים מדי" ("we don't like anything too extreme"), and that is all
 * these rows are there to make possible.
 */
export function formatCandidates(rows: ParkCandidate[]): string {
  if (!rows.length) return "";
  const byPark = new Map<string, ParkCandidate[]>();
  for (const r of rows) {
    const list = byPark.get(r.park) ?? [];
    list.push(r);
    byPark.set(r.park, list);
  }
  const blocks = [...byPark].map(([park, list]) => {
    const items = list.map((r) => {
      const he = r.name_he ? ` (${r.name_he})` : "";
      const power = r.intensity === null ? "עוצמה לא דורגה" : `עוצמה ${r.intensity} מתוך 4`;
      const wet = r.gets_wet === "may_get_soaked" ? " · עלול להרטיב מאוד"
        : r.gets_wet === "may_get_wet" ? " · עלול להרטיב" : "";
      const h = r.height_cm ? ` · גובה מינימום ${r.height_cm} ס"מ` : "";
      return `  · ${r.name}${he} — ${power}${h}${wet}`;
    });
    return `${park}:\n${items.join("\n")}`;
  });
  return `[מועמדים לפי פארק — לבחירה לפי מה שנאמר, ולא להצגה כרשימה]\n${blocks.join("\n\n")}`;
}

export function formatExperiences(rows: ExperienceRow[]): string {
  const wet: Record<string, string> = {
    none: "לא מרטיב",
    may_get_wet: "עלול להרטיב",
    may_get_soaked: "עלול להרטיב מאוד",
    na: "לא רלוונטי — זה מופע",
  };
  const skip: Record<string, string> = {
    multi_pass: "כלול ב-Multi Pass",
    single_pass: "דורש Single Pass בתשלום נפרד",
    express: "זמין ב-Express Pass",
    none: "אין מוצר דילוג בתור",
  };
  return rows
    .map((r) => {
      const bits: string[] = [];
      // 🔴 **The ceiling, and it is the opposite of the floor.** Five toddler water
      // areas limit height from above. As long as there was only "minimum height"
      // here, the same number was said in the opposite direction: "מגבלת הגובה בטייקס
      // פיק היא 122" ("the height limit at Tike's Peak is 122") sent a 130 cm girl to a
      // ride that won't let her on, and didn't warn a 160 cm teenager.
      //
      // ⚠️ And it is said in words, not as a bare number. "122" next to "גובה מינימום"
      // ("minimum height") and "122" next to "גובה מקסימלי" ("maximum height") look
      // too alike in one sentence, and the model is the one phrasing it. The word
      // "עד" ("up to") makes the difference.
      if (r.max_height_cm !== null && r.max_height_cm !== undefined) {
        bits.push(`⚠️ גובה מקסימלי: עד ${r.max_height_cm} ס"מ בלבד — מי שגבוה יותר אינו יכול לעלות`);
      }
      // 🔴 **The ceiling is said before the floor, not after it.**
      //
      // Neta asked about Bay Slides, and Tim opened with "מגבלת הגובה לא נבדקה"
      // ("the height limit was not checked") — factually right, and misleading as an
      // order. We have a measured ceiling of 152 cm; what is missing is the floor. A
      // sentence that opens with what's missing reads as "we have no information",
      // and a family that gets it never reaches the data we do have.
      //
      // ⚠️ What is known is said first. What is missing is said after it, explicitly.
      //
      // ⚠️ And the floor's three states are kept, never "0 ס\"מ" ("0 cm").
      bits.push(
        // ⚠️ **And with a next step, not as a flat refusal.** "לא נבדקה" ("not checked")
        // is true and stops the reader: she knows we don't have it, not what to do
        // about it. Paula's principle from 07.09 — "don't guess, but no flat refusal
        // either, and always leave a clear next step" — was written about a changing
        // schedule, and applies here just the same.
        // 🔴 **"אנחנו לא בדקנו" ("we didn't check") is a report about ourselves, not an
        // answer to a family.**
        //
        // Neta: "What is 'we didn't check'? Terrible wording." She's right — that
        // phrasing tells the reader about our homework instead of telling her what the
        // situation is.
        //
        // ⚠️ **And "לא ידוע" ("unknown") alone would have been worse**, because it
        // reads as "no known limit" — i.e. permission. "לא ידוע **אם קיימת**"
        // ("unknown **whether one exists**") says exactly what is unknown: its very
        // existence. That is the difference between missing data and an all-clear.
        r.height_cm === null
          ? "מגבלת גובה מינימלית: לא ידוע אם קיימת · כדאי לבדוק בשילוט בכניסה למתקן"
          : r.height_cm === 0
          ? "אין מגבלת גובה מינימלית"
          : `גובה מינימום: ${r.height_cm} ס"מ`,
      );
      // The fit is the shared rule's (lookup.ts `withFit`), not the database's.
      if (r.fit === "fits") bits.push("מתאים לגובה שנמסר");
      if (r.fit === "too_short" || r.fit === "too_tall") bits.push("לא מתאים לגובה שנמסר");
      // 🔴 Decision 2, C (Alon, 30.09): a ceiling with an unchecked floor. What is known — not
      // too tall — is said, and it is never "מתאים". The floor's line above already says it is
      // unknown whether one exists.
      if (r.fit === "under_ceiling_floor_unknown") bits.push("לא גבוה מדי לגובה שנמסר — אבל לא ידוע אם יש גובה מינימום");
      // ⚠️ "unknown" and no height are not said as "מתאים" ("fits"). They are simply not said.
      if (r.intensity !== null) bits.push(`עוצמה ${r.intensity} מתוך 4`);
      else bits.push("עוצמה: לא דורגה");
      // ── The four sensitivity flags ──────────────────────────────────
      //
      // 🔴 Until 039 they were not sent at all, and Tim said "I have no information
      // about the darkness level" about a ride whose column is filled. The data was
      // collected, checked, stored — and not shown.
      //
      // ⚠️ **Three states per flag, and `null` is said explicitly.** A flag that was
      // not checked and a flag that was checked and has no sensitivity look identical
      // if both are met with silence, and a family reading a clean list assumes it is
      // clean. That is the rule the whole project is built around, and here it
      // concerns a child with light sensitivity.
      const sens: [string, string | null | undefined][] = [
        ["חושך או מקומות סגורים", r.sens_dark],
        ["גבהים", r.sens_heights],
        ["רעש חזק או פתאומי", r.sens_loud],
        ["הבזקי אור", r.sens_strobe],
      ];
      // 🔴 **The fourth regression of the same pattern, and Neta caught this one too.**
      //
      // The previous version emitted a line for `true`, `null` and `"na"` — and was
      // silent on `"false"`. So Tim answered "I don't have data on darkness
      // sensitivity for Buzz Lightyear" about a column that explicitly says `false`:
      // checked, and none. The most reassuring data we have was the only one that
      // didn't reach him.
      //
      // ⚠️ **So no more conditional lists.** All four flags are always said, each with
      // its state, on one line. A structure in which some state is not represented is
      // a structure where a state can be forgotten — and that happened here three
      // times in a row (`na`, `status_note`, and now `false`). When every state must
      // have a word, there is no silence for the model to interpret.
      const sensWord: Record<string, string> = {
        "true": "כן",
        "false": "נבדק — אין",
        na: "לא רלוונטי",
      };
      // ⚠️ `undefined` — a database without 039 — is not "not checked". It is data
      // that never arrived, and saying anything about it is invention. It drops out of
      // the list entirely.
      const sensSaid: string[] = [];
      for (const [k, v] of sens) {
        if (v === undefined) continue;
        sensSaid.push(`${k}: ${v === null ? "לא נבדק" : sensWord[v] ?? v}`);
      }
      if (sensSaid.length) bits.push(`רגישויות — ${sensSaid.join(" · ")}`);
      if (r.gets_wet) bits.push(wet[r.gets_wet] ?? r.gets_wet);
      if (r.skip_line) bits.push(skip[r.skip_line] ?? r.skip_line);
      else bits.push("מוצר דילוג בתור: לא נבדק");
      if (r.status !== "open") {
        // ⚠️ Four statuses, not one sentence for three of them.
        //
        // Before, anything not open was said as "אינו פתוח כרגע" ("not open right
        // now"), which is a sharper claim than the data holds. temporarily_closed on
        // Meet Moana is Paula's call, meaning "the character's presence can't be relied
        // on" — and a family reading "not open right now" deletes the meet from the
        // day, when it may very well be running.
        //
        // It is the same pattern caught here again and again, in the opposite
        // direction: a value meaning "unknown / varies" read as a definite value. This
        // time it didn't promise safety but ruled out an option, and that is just as
        // harmful.
        // 🔴 **Fixed 23.09 — the comment that was here was wrong, and it misled a
        // product decision.**
        //
        // It said `temporarily_closed` and `coming_soon` are never produced, and that
        // Paula's wording from 07.09 never reached the screen. On that basis it was
        // proposed to remove them from the map — which would have dropped three real
        // rows to the default, i.e. an English word in a Hebrew UI.
        //
        // ⚠️ **Two sources, not one.** `npm run import` does emit only three values —
        // open · closed · check. But `build-content-seed.py` overrides three rows the
        // export marked `check`, each one after verification against the operator's
        // site:
        //
        //   Slush Gusher                  → temporarily_closed
        //   Meet Moana at Character Landing → temporarily_closed (Paula, 06.09)
        //   The Magic of Disney Animation → coming_soon
        //
        // `verify-content.sql` expects exactly that: 236 open · 3 closed ·
        // 2 temporarily_closed · 1 coming_soon. So the values live in the database
        // and reach the screen.
        //
        // ⚠️ And the lesson: **a comment that describes reality goes stale like a
        // derived file, and without a test it lies silently.** `check` really did once
        // fall into the default branch and show as "⚠️ סטטוס: check" ("status: check");
        // the comment was written then, and stayed after the picture changed.
        //
        // ⚠️ This is exactly the warning written in migration 037: a vocabulary change
        // requires a change on both sides. The four values here cover the four values
        // that exist in the database, and `status-vocabulary.test.ts` fails if one of
        // them is removed or if the seed starts producing a fifth value.
        const say: Record<string, string> = {
          closed: "⚠️ סגור",
          // Paula's wording, 08.09. ⚠️ **A fixed, short tag, without splitting into two
          // values.** The prose in status_note holds the details and differs a lot from
          // row to row ("צפוי להיפתח ב-14 בספטמבר" ("expected to open September 14")
          // vs. "לוח זמנים משתנה" ("changing schedule")), and Tim already tells them
          // apart correctly in his own phrasing. One tag that doesn't decide which of
          // the states it is, and leaves the distinction to the sentence — not to a
          // schema change.
          check: "⚠️ יש לוודא לפני ההגעה.",
          // ⚠️ Paula's wording, 07.09. "אינו בלוח קבוע" ("not on a fixed schedule")
          // still sounds like absence; this isn't "doesn't happen" but "varies, check
          // on the day" — the same principle decided today on the parade time: don't
          // guess, but no flat refusal either, and always leave a clear next step.
          temporarily_closed:
            "⚠️ מתקיים בהתאם ללוח זמנים משתנה — מומלץ לבדוק באפליקציה או באתר הרשמי ביום הביקור",
          coming_soon: "⚠️ טרם נפתח",
        };
        // A value not in the map does not fall to a silent default: it is said as is,
        // so a new status shows up instead of being swallowed.
        const label = say[r.status] ?? `⚠️ סטטוס: ${r.status}`;
        bits.push(`${label}${r.status_note ? ` — ${r.status_note}` : ""}`);
      } else if (r.status_note) {
        // 🔴 **A status note on an open row — and this is a regression I made yesterday.**
        //
        // Until yesterday 19 Volcano Bay rides were wrongly marked "closed", and their
        // note — "Planned park maintenance closure begins Oct 26, 2026" — reached Tim
        // through the closed-status branch. I fixed the classification to "open",
        // **and the note disappeared along with it**, because that branch only runs on
        // what is not open.
        //
        // ⚠️ Neta asked "is Krakatau open", and Tim answered "open" without a word
        // about the maintenance closure. A family planning for late October would not
        // have known.
        //
        // ⚠️ And the lesson: **fixing a wrong classification doesn't end at the
        // classification.** The information hanging on it travels with it, and when it
        // moves — the information falls off.
        //
        // ⚠️ And the wording here differs from the one above on purpose: the row is
        // **open**, and any warning tag would contradict that. This is a note about
        // the future, not about today.
        bits.push(`פתוח · לתשומת לב: ${r.status_note}`);
      }
      const he = r.name_he ? ` (${r.name_he})` : "";
      // 🔴 **An empty land here is not "unknown", and silence about it was read that way.**
      //
      // Neta asked "באיזה אזור נמצאים JAMMitors" ("which land are the JAMMitors in"),
      // and Tim answered "the information about the specific land doesn't appear in
      // what I have" — because `land` arrived `null` and the line simply wasn't
      // written. But the data **exists and was checked**: the master says `N/A`,
      // meaning the troupe has no fixed spot. We said "we don't have it" about an
      // answer we have.
      //
      // ⚠️ And what lets us say this with confidence: the master has not a single
      // empty Area field — 234 real, 8 `N/A`, zero empty. The seed builder now stops
      // on an empty one, so `null` here can only come from `N/A`.
      //
      // "משתנה" ("varies") — Paula's call, 09.09.
      // 🔴 **"משתנה" ("varies") was one word for two different states, and Neta
      // caught it.**
      //
      // Paula's call on 09.09 was "varies", and I told her — and Philip — that these
      // were eight **roaming performers**. I checked the actual rows, and that's not
      // true: four of them are character meets whose location is written in the name
      // itself (Adventurers Outpost · Character Landing · Discovery Island ·
      // Zoogether Day Gathering Spot). They don't vary at all.
      //
      // ⚠️ And what all eight share is much narrower: **they are not assigned to a
      // defined land in the park.** That is what the column measures, and it is all
      // that can be said without guessing. "Varies" promised knowledge of their
      // behavior that we don't have.
      //
      // ⚠️ It is the same pattern in the opposite direction: before, one state was
      // swallowed by silence, and here one word was smeared across different states.
      // In both cases the structure claimed more than the data holds.
      const where = !r.land || r.land === "N/A"
        ? " · אינו משויך לאזור מוגדר בפארק"
        : ` · ${r.land}`;
      const when = r.last_verified ? ` · נבדק ${r.last_verified}` : "";
      return `[מתקן: ${r.name}${he} · ${r.park}${where}${when}]\n${bits.join(" · ")}`;
    })
    .join("\n\n");
}

/**
 * The three layers the context is assembled in — section 3, step 5 of the retrieval doc.
 *
 * 🔴 **Without this, a Reddit chunk and an official limit reach the model as two
 * equivalent chunks, and it has no way to know which to trust.** That is exactly what
 * section 1 warns against, and the rule "T1/T2 are never contradicted by T3-T5" could
 * not be honored: it was written in the instructions, and there was no data to apply
 * it to.
 *
 * ⚠️ **And the labels are words, not codes.** `T1` does not go out into the context —
 * not through these labels either. The model gets a hierarchy in language, and the
 * tier itself stays internal and is checked in the output. The two requirements don't
 * conflict: what must not leak is **the tier's name**, and what must arrive is **the
 * order**.
 */
const LAYERS: { label: string; tiers: string[] }[] = [
  { label: "עובדות רשמיות", tiers: ["T1", "T2"] },
  { label: "מהתוכן שלנו", tiers: ["T3"] },
  { label: "מניסיון מבקרים — לא מאומת", tiers: ["T4", "T5"] },
];

export function formatChunks(chunks: KnowledgeChunk[]): string {
  const mark: Record<string, string> = {
    volatile: "משתנה",
    seasonal: "עונתי",
    static: "יציב",
  };

  const one = (c: KnowledgeChunk, i: number): string => {
    // ⚠️ A missing volatility is not "יציב" ("stable"). An unmarked chunk is said with
    // caution, not confidence — the default leans to the safe side, not the convenient one.
    const tag = c.volatility ? mark[c.volatility] ?? "משתנה" : "משתנה";
    const when = c.last_verified ? ` · נבדק ${c.last_verified}` : "";
    return `[קטע ${i + 1} · ${tag}${when}]\n${c.content}`;
  };

  // ⚠️ **Numbering runs across all chunks and does not reset per layer.** "קטע 3"
  // ("chunk 3") must be one single item, otherwise citation binding can't be done.
  let n = 0;
  const blocks: string[] = [];

  for (const layer of LAYERS) {
    const inLayer = chunks.filter(
      (c) => c.authority_tier !== null && layer.tiers.includes(c.authority_tier),
    );
    if (inLayer.length === 0) continue;
    blocks.push(`[${layer.label}]\n` + inLayer.map((c) => one(c, n++)).join("\n\n"));
  }

  // 🔴 **A chunk with no tier drops to the lowest layer — it neither vanishes nor rises.**
  // `authority_tier` is `not null` in the schema, so this shouldn't happen — and if it
  // does anyway, silence would have presented it as verified. The default leans to the
  // safe side, as with volatility just above.
  const unknown = chunks.filter((c) => !LAYERS.some(
    (l) => c.authority_tier !== null && l.tiers.includes(c.authority_tier),
  ));
  if (unknown.length > 0) {
    blocks.push("[מקור לא מסווג — לא מאומת]\n" + unknown.map((c) => one(c, n++)).join("\n\n"));
  }

  return blocks.join("\n\n");
}

/**
 * What goes into the user's turn — the context, then the question.
 *
 * ⚠️ Rides before documents. A fact from the table beats prose, and a model tends to
 * give weight to what it sees first.
 */
export function composeContext(p: {
  rides: ExperienceRow[]; candidates: ParkCandidate[]; chunks: KnowledgeChunk[]; question: string;
}): string {
  return [
    todayLine(),
    p.rides.length ? formatExperiences(p.rides) : null,
    // ⚠️ After the rides asked about and before the documents: these are facts from
    // the table, and they beat prose.
    p.candidates.length ? formatCandidates(p.candidates) : null,
    p.chunks.length ? formatChunks(p.chunks) : null,
    `השאלה: ${p.question}`,
  ].filter(Boolean).join("\n\n---\n\n");
}
