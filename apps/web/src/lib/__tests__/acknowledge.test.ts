import { describe, expect, it } from "vitest";
import { experiences } from "../../data";
import { acknowledge, ridesFlaggedFor, ridesOpenToShortest } from "../acknowledge";
import { emptyProfile, type Profile } from "../profile";
import type { Member } from "../group";

const child = (age: number, heightCm: number | null): Member => ({
  id: `m${age}-${heightCm}`,
  age,
  heightCm,
});
const withProfile = (patch: Partial<Profile>): Profile => ({ ...emptyProfile, ...patch });

describe("the line under an answer is a number, not a noise", () => {
  it("counts what a short child can actually board", () => {
    const measured = ridesOpenToShortest([child(7, 100)])!;
    expect(measured.count).toBeGreaterThan(0);
    expect(measured.count).toBeLessThan(measured.total);

    // ⚠️ The claim has to be true ride by ride, not merely plausible.
    const open = experiences.filter((e) => e.status.state !== "closed");
    const byHand = open.filter(
      (e) => e.heightRequirementCm !== null && e.heightRequirementCm <= 100,
    ).length;
    expect(measured.count).toBe(byHand);
    expect(measured.total).toBe(open.length);
  });

  it("never counts a ride whose limit nobody checked", () => {
    // The same rule as the search filters: unknown is not a clean bill, and a
    // number that swept them in would be a promise to a parent.
    const unchecked = experiences.filter(
      (e) => e.heightRequirementCm === null && e.status.state !== "closed",
    );
    const tall = ridesOpenToShortest([child(13, 200)])!;
    const open = experiences.filter((e) => e.status.state !== "closed").length;
    expect(tall.count).toBe(open - unchecked.length);
  });

  it("gets taller as the child gets taller, and never shrinks", () => {
    const short = ridesOpenToShortest([child(4, 90)])!.count;
    const tall = ridesOpenToShortest([child(12, 150)])!.count;
    expect(tall).toBeGreaterThanOrEqual(short);
  });

  it("measures the shortest member, not the group", () => {
    // A parent asks what is open to the one who will be turned away.
    const mixed = ridesOpenToShortest([child(12, 150), child(4, 90)])!;
    const alone = ridesOpenToShortest([child(4, 90)])!;
    expect(mixed.count).toBe(alone.count);
  });
});

describe("silence is a real answer", () => {
  it("says nothing about a party of adults", () => {
    // Every height limit clears, so there is no number worth showing.
    expect(acknowledge("group", withProfile({ members: [child(34, null)] }))).toBeNull();
  });

  it("says nothing when no sensitivity was named", () => {
    expect(acknowledge("sensitivities", withProfile({ sensitivities: [] }))).toBeNull();
  });

  it("says nothing for a question whose answer buys nothing yet", () => {
    expect(acknowledge("visitStyle", withProfile({ visitStyle: "max" }))).toBeNull();
    expect(acknowledge("dates", withProfile({ dates: "set" }))).toBeNull();
  });
});

describe("a gap is named rather than skipped", () => {
  it("says the height is missing instead of showing a count", () => {
    const ack = acknowledge("group", withProfile({ members: [child(6, null)] }));
    expect(ack?.key).toBe("ack.group.noHeight");
    expect(ack?.count).toBeUndefined();
  });

  it("shows a count once the height is there", () => {
    const ack = acknowledge("group", withProfile({ members: [child(6, 110)] }));
    expect(ack?.key).toBe("ack.group.open");
    expect(ack?.count).toBeGreaterThan(0);
  });
});

describe("sensitivities", () => {
  it("reports how many rides carry the one that was named", () => {
    const ack = acknowledge("sensitivities", withProfile({ sensitivities: ["loudSudden"] }));
    expect(ack?.key).toBe("ack.sensitivities.flagged");
    expect(ack?.count).toBe(ridesFlaggedFor(["loudSudden"]).count);
    expect(ack?.count).toBeGreaterThan(0);
  });

  it("does not report a count for queue tolerance, which no column answers", () => {
    // ⚠️ A count would be 0 here and read as "nothing to worry about", when
    // the truth is that this answer steers the plan instead of the list.
    const ack = acknowledge("sensitivities", withProfile({ sensitivities: ["longQueues"] }));
    expect(ack?.key).toBe("ack.sensitivities.planOnly");
    expect(ack?.count).toBeUndefined();
  });

  it("still reports a count when queue tolerance came with a real flag", () => {
    const ack = acknowledge(
      "sensitivities",
      withProfile({ sensitivities: ["longQueues", "dark"] }),
    );
    expect(ack?.key).toBe("ack.sensitivities.flagged");
    expect(ack?.count).toBe(ridesFlaggedFor(["longQueues", "dark"]).count);
  });

  it("counts a ride once even when it carries two of the named sensitivities", () => {
    const both = ridesFlaggedFor(["dark", "loudSudden"]).count;
    const dark = ridesFlaggedFor(["dark"]).count;
    const loud = ridesFlaggedFor(["loudSudden"]).count;
    expect(both).toBeLessThanOrEqual(dark + loud);
    expect(both).toBeGreaterThanOrEqual(Math.max(dark, loud));
  });
});
