import { describe, expect, it } from "vitest";
import { withSignal } from "./client";

/** A query like postgres.js's: a promise with cancel(). It answers after `ms`, unless cancelled. */
const query = (ms: number) => {
  let cancelled = false;
  let stop = () => {};
  const p = new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => resolve("rows"), ms);
    stop = () => { clearTimeout(t); reject(new Error("cancelled")); };
  });
  // The cancelled query's own rejection is the driver's business; withSignal rejects with the reason.
  p.catch(() => {});
  return Object.assign(p, { cancel: () => { cancelled = true; stop(); }, cancelled: () => cancelled });
};

describe("withSignal — a query that stops at the deadline", () => {
  it("cancels the query in the database, not only the promise", async () => {
    const q = query(1000);
    await expect(withSignal(q, AbortSignal.timeout(10))).rejects.toMatchObject({ name: "TimeoutError" });
    expect(q.cancelled()).toBe(true);
  });

  it("lets a query that answers in time through", async () => {
    const q = query(5);
    await expect(withSignal(q, AbortSignal.timeout(500))).resolves.toBe("rows");
    expect(q.cancelled()).toBe(false);
  });

  it("does not start a query whose signal already fired", async () => {
    const s = AbortSignal.timeout(1);
    await new Promise((r) => setTimeout(r, 10));
    const q = query(1000);
    await expect(withSignal(q, s)).rejects.toMatchObject({ name: "TimeoutError" });
    expect(q.cancelled()).toBe(true);
  });
});
