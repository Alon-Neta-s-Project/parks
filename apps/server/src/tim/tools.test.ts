import { afterEach, describe, expect, it } from "vitest";
import type { QueryRidesInput, QueryRidesResult } from "../db/query-rides";
import { startDeadline } from "./deadline";
import { newTrace } from "./log";
import type { DirectQueries, ExperienceRow } from "./lookup";
import { stub } from "./test-helpers";
import { argsForLog, groupLine, readGroup, runTool, TOOLS } from "./tools";

/**
 * The agent's tools, one by one — what each passes to the database, what it says back to the
 * model, and that it never throws: a failure is a result the model reads.
 */
const RIDE = {
  id: "x", name: "Space Mountain", name_he: null, park: "Magic Kingdom Park", land: "Tomorrowland", status: "open",
  status_note: null, intensity: 3, height_cm: 112, max_height_cm: null, gets_wet: "none", skip_line: "multi_pass",
  last_verified: "2026-09-01", fits: null,
} as ExperienceRow;
const TOT_TIKI = { ...RIDE, name: "Tot Tiki Reef", park: "Universal Volcano Bay", height_cm: null, max_height_cm: 122, intensity: 1 } as ExperienceRow;

const fail = async () => { throw new Error("must not be called"); };
const direct = (over: Partial<DirectQueries> = {}): DirectQueries =>
  ({ findExperiences: fail, matchKnowledge: fail, parkCandidates: fail, queryRides: fail, ...over });
const KEY = "k";

let restore = () => {};
afterEach(() => restore());
/** Every fetch is recorded; the database functions over RPC must never be called by a tool. */
const network = () => {
  const s = stub((url) =>
    url.includes(":embedContent")
      ? new Response(JSON.stringify({ embedding: { values: Array.from({ length: 1536 }, () => 0.01) } }), { status: 200 })
      : new Response("[]", { status: 200 }));
  restore = s.restore;
  return () => s.calls.filter((c) => c.url.includes("/rpc/")).map((c) => c.url);
};

describe("the declarations", () => {
  it("declares the four tools of O13, and only them", () => {
    expect(TOOLS.map((t) => t.name)).toEqual(["find_ride", "query_rides", "park_candidates", "search_knowledge"]);
  });
});

describe("find_ride", () => {
  it("asks the server's query by the name the model gave — never an RPC", async () => {
    const rpc = network();
    const asked: unknown[] = [];
    const r = await runTool("find_ride", { name: "  Space Mountain " }, {
      key: KEY, direct: direct({ findExperiences: async (p) => { asked.push(p); return [RIDE]; } }),
    });
    expect(asked).toEqual([{ name: "Space Mountain", park: null, limit: 6 }]);
    expect([r.ok, r.rides.length, r.text.includes("112")]).toEqual([true, 1, true]);
    expect(rpc()).toEqual([]);
  });

  // Decision 2, C — the same rule as the screen (packages/shared/src/fit.ts), on the agent's path.
  it("says 'not too tall', never 'fits', on a ceiling with an unchecked floor", async () => {
    const r = await runTool("find_ride", { name: "Tot Tiki Reef", height_cm: 100 }, {
      key: KEY, direct: direct({ findExperiences: async () => [TOT_TIKI] }),
    });
    expect([r.text.includes("לא גבוה מדי לגובה שנמסר"), r.text.includes("מתאים לגובה שנמסר")]).toEqual([true, false]);
    expect(r.rides[0]!.fit).toBe("under_ceiling_floor_unknown");
  });

  it("says when there is no such ride, and refuses a call with no name", async () => {
    const none = await runTool("find_ride", { name: "Nope" }, { key: KEY, direct: direct({ findExperiences: async () => [] }) });
    expect([none.ok, none.text]).toEqual([true, 'No ride named "Nope" in our data.']);
    expect((await runTool("find_ride", {}, { key: KEY, direct: direct() })).ok).toBe(false);
  });

  it("fails soft — a result that says not to answer from memory, and no RPC fallback", async () => {
    const rpc = network();
    const r = await runTool("find_ride", { name: "Space Mountain" }, {
      key: KEY, direct: direct({ findExperiences: async () => { throw new Error("connection refused"); } }),
    });
    expect([r.ok, r.timedOut, r.text.includes("Do not answer this from memory")]).toEqual([false, false, true]);
    expect(rpc()).toEqual([]);
  });

  it("is cut at the deadline, cancels the query, and names itself in the trace", async () => {
    const trace = newTrace();
    let cancelled = false;
    const r = await runTool("find_ride", { name: "Space Mountain" }, {
      key: KEY,
      limit: { deadline: startDeadline({ dbMs: 30 }), trace },
      direct: direct({
        findExperiences: (_p, signal) => new Promise((_, reject) =>
          signal?.addEventListener("abort", () => { cancelled = true; reject(signal.reason); }, { once: true })),
      }),
    });
    expect([r.ok, r.timedOut, cancelled, trace.timed_out]).toEqual([false, true, true, ["tool:find_ride"]]);
  });
});

describe("query_rides", () => {
  const result = (over: Partial<QueryRidesResult> = {}): QueryRidesResult =>
    ({ rides: [RIDE], matched: 1, heldBack: { unrated: 0, sensitivityUnchecked: 0, heightUnknown: 0 }, ...over });

  it("reads the model's arguments as untrusted — clamps, drops unknown values, keeps the rest", async () => {
    const asked: QueryRidesInput[] = [];
    await runTool("query_rides", {
      park: "mk", kinds: ["attraction", "rocket"], intensity_max: 9, height_cm: 105,
      avoid: ["dark", "spiders"], motion_sickness_warning: false, limit: 500, extra: "ignored",
    }, { key: KEY, direct: direct({ queryRides: async (p) => { asked.push(p); return result(); } }) });
    expect(asked[0]).toMatchObject({
      park: "mk", kinds: ["attraction"], intensityMax: 4, heightCm: 105,
      avoidSensitivities: ["dark"], hasMotionSicknessWarning: false, limit: 40,
    });
    expect(asked[0]).not.toHaveProperty("extra");
  });

  // 🔴 The unknowns are said, with the number — never dropped in silence.
  it("tells the model how many were held back, and that it must say so", async () => {
    const r = await runTool("query_rides", { park: "mk", avoid: ["dark"] }, {
      key: KEY,
      direct: direct({ queryRides: async () => result({ matched: 25, heldBack: { unrated: 0, sensitivityUnchecked: 6, heightUnknown: 0 } }) }),
    });
    expect(r.text).toContain("25 rides match; 1 shown.");
    expect(r.text).toContain("Held back because something about them is unknown — this must be said: 6 never checked");
  });

  it("is unavailable, not a crash, on a host without it", async () => {
    const r = await runTool("query_rides", {}, { key: KEY, direct: { ...direct(), queryRides: undefined } });
    expect(r.ok).toBe(false);
  });
});

describe("park_candidates", () => {
  it("asks for 3 per park by default", async () => {
    const asked: unknown[] = [];
    await runTool("park_candidates", {}, { key: KEY, direct: direct({ parkCandidates: async (p) => { asked.push(p); return []; } }) });
    expect(asked).toEqual([{ perPark: 3 }]);
  });
});

describe("search_knowledge", () => {
  it("embeds the model's words as a query, and passes the resort and the cap of 5", async () => {
    network();
    const asked: { resort: string | null; limit: number | null }[] = [];
    const r = await runTool("search_knowledge", { query: "parking at Epic", resort: "uor" }, {
      key: KEY,
      direct: direct({ matchKnowledge: async (p) => {
        asked.push(p);
        return [{ content: "Parking is…", volatility: "stable", last_verified: "2026-09-01", authority_tier: "T1" }];
      } }),
    });
    expect([asked[0]!.resort, asked[0]!.limit, r.chunks.length]).toEqual(["uor", 5, 1]);
  });

  it("ignores a resort it does not know", async () => {
    network();
    const asked: { resort: string | null }[] = [];
    await runTool("search_knowledge", { query: "x", resort: "six-flags" }, {
      key: KEY, direct: direct({ matchKnowledge: async (p) => { asked.push(p); return []; } }),
    });
    expect(asked[0]!.resort).toBeNull();
  });
});

it("answers an unknown tool with a result, not a throw", async () => {
  const r = await runTool("drop_table", {}, { key: KEY, direct: direct() });
  expect([r.ok, r.text]).toEqual([false, "There is no tool named drop_table."]);
});

// The log is a place data leaves the system (O2): what the model asked for — not the family's words.
describe("argsForLog", () => {
  it("keeps the filters, and hides the free text and the child's height", () => {
    const logged = argsForLog({ name: "Space Mountain", query: "where do we park", height_cm: 105, park: "mk", avoid: ["dark"], intensity_max: 2 });
    expect(logged).toEqual({ name: "‹14 chars›", query: "‹16 chars›", height_cm: "‹given›", park: "mk", avoid: ["dark"], intensity_max: 2 });
    expect(JSON.stringify(logged)).not.toContain("Space");
  });
});

/**
 * Lists (01.10) — a family's question is about a group, and often about several rides or parks.
 * One call instead of one per child: measured, the two-children question took three rounds and
 * ended with no answer.
 */
describe("lists", () => {
  it("find_ride: several names in one call, each looked up", async () => {
    const asked: string[] = [];
    const r = await runTool("find_ride", { names: ["TRON", "Space Mountain"] }, {
      key: KEY, direct: direct({ findExperiences: async (p) => { asked.push(p.name!); return [{ ...RIDE, name: p.name! }]; } }),
    });
    expect(asked.sort()).toEqual(["Space Mountain", "TRON"]);
    expect(r.rides.length).toBe(2);
  });

  it("query_rides: passes the parks, the categories and the group", async () => {
    const asked: QueryRidesInput[] = [];
    await runTool("query_rides", {
      parks: ["ioa", "us"], categories: ["coaster", "monorail"], group_fit: "anyone",
      group: [{ age: 7, height_cm: 100 }, { age: 10, height_cm: 125 }],
    }, { key: KEY, direct: direct({ queryRides: async (p) => { asked.push(p); return { rides: [], matched: 0, heldBack: { unrated: 0, sensitivityUnchecked: 0, heightUnknown: 0 } }; } }) });
    expect(asked[0]).toMatchObject({
      parks: ["ioa", "us"], categories: ["coaster"], groupFit: "anyone",
      group: [{ id: "#1", age: 7, heightCm: 100 }, { id: "#2", age: 10, heightCm: 125 }],
    });
  });

  it("query_rides: under each ride, who in the group can ride it", async () => {
    const hagrid = { ...RIDE, name: "Hagrid's", height_cm: 122 } as ExperienceRow;
    const r = await runTool("query_rides", { group: [{ age: 7, height_cm: 100 }, { age: 10, height_cm: 125 }], group_fit: "anyone" }, {
      key: KEY, direct: direct({ queryRides: async () => ({ rides: [hagrid], matched: 1, heldBack: { unrated: 0, sensitivityUnchecked: 0, heightUnknown: 0 } }) }),
    });
    expect(r.text).toContain("Group: can ride: #2 (age 10, 125 cm) · cannot ride: #1 (age 7, 100 cm) — below the 122 cm minimum.");
  });

  it("park_candidates: with a group, only rides one of them can ride — and the unknowns counted", async () => {
    const c = (name: string, height_cm: number | null, max_height_cm: number | null = null) =>
      ({ park: "P", name, name_he: null, land: null, category: null, intensity: 2, height_cm, max_height_cm, gets_wet: null });
    const r = await runTool("park_candidates", { group: [{ age: 4, height_cm: 100 }] }, {
      key: KEY, direct: direct({ parkCandidates: async () => [c("low", 0), c("tall", 122), c("unknown", null)] }),
    });
    expect(r.candidates.map((x) => x.name)).toEqual(["low"]);
    expect(r.text).toContain("1 where it is unknown whether the height fits");
  });
});

describe("the group's line — the screen's rule, in words", () => {
  const adult = { age: 38 };
  it("says everyone, plainly", () => {
    expect(groupLine({ height_cm: 0 }, readGroup([adult, { age: 6, height_cm: 115 }])!)).toBe("Group: everyone can ride.");
  });

  // Decision 1b: an adult is above any ceiling.
  it("counts an adult out of a toddler area, and says why", () => {
    expect(groupLine({ height_cm: 0, max_height_cm: 122 }, readGroup([adult, { age: 4, height_cm: 100 }])!))
      .toBe("Group: can ride: #2 (age 4, 100 cm) · cannot ride: #1 (age 38) — above the 122 cm maximum.");
  });

  // Decision 2, C: below the ceiling is said; "can ride" is not.
  it("a ceiling with an unchecked floor — 'not too tall', never 'can ride'", () => {
    const line = groupLine({ height_cm: null, max_height_cm: 122 }, readGroup([{ age: 4, height_cm: 100 }])!);
    expect(line).toBe("Group: not too tall (up to 122 cm), but whether there is a minimum is unknown: #1 (age 4, 100 cm).");
  });

  it("names a child whose height nobody gave", () => {
    expect(groupLine({ height_cm: 102 }, readGroup([{ age: 7 }])!)).toBe("Group: height not given: #1 (age 7).");
  });

  // ⚠️ Read as an adult, a member with no age would be cleared past every minimum unmeasured.
  it("reads a member with no age as a child", () => {
    expect(readGroup([{ height_cm: 100 }, {}])).toEqual([{ id: "#1", age: 10, heightCm: 100 }, { id: "#2", age: 10, heightCm: null }]);
  });
});

it("argsForLog: the group's size and what was given — never the heights; names by length", () => {
  const logged = argsForLog({ names: ["TRON", "Space Mountain"], group: [{ age: 7, height_cm: 100 }, { age: 38 }] });
  expect(logged).toEqual({ names: ["‹4 chars›", "‹14 chars›"], group: "‹2 members · 2 ages · 1 heights›" });
  expect(JSON.stringify(logged)).not.toContain("100");
});
