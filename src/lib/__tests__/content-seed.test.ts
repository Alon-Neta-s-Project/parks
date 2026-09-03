import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The upsert in db/content-seed is generated, and the generator derives the
 * DO UPDATE SET clause from the same column list as the INSERT. These tests
 * check the generated file rather than the generator, so a hand edit is caught
 * too.
 *
 * Why this is worth a test: a column present in the INSERT but missing from
 * DO UPDATE keeps its old value forever. An attraction whose intensity rating
 * was withdrawn upstream would silently keep the withdrawn rating — the cell
 * has a value, it is simply the wrong one, and nothing looks broken.
 */
const DIR = join(process.cwd(), "db", "content-seed");
const parts = readdirSync(DIR)
  .filter((f) => f.startsWith("content-") && f.endsWith(".sql"))
  .map((f) => ({ name: f, sql: readFileSync(join(DIR, f), "utf8") }));

describe("content seed", () => {
  it("has at least one generated part", () => {
    expect(parts.length).toBeGreaterThan(0);
  });

  for (const { name, sql } of parts) {
    describe(name, () => {
      const inserted = sql
        .match(/insert into experience\s*\n\s*\(([^)]+)\)/)![1]!
        .split(",")
        .map((c) => c.trim());

      const refreshed = [...sql.matchAll(/(\w+) = excluded\.\1/g)].map((m) => m[1]!);

      it("refreshes every inserted column except the conflict key", () => {
        const missing = inserted.filter((c) => c !== "id" && !refreshed.includes(c));
        expect(missing).toEqual([]);
      });

      it("never refreshes a column it does not insert", () => {
        expect(refreshed.filter((c) => !inserted.includes(c))).toEqual([]);
      });

      it("does not touch id", () => {
        expect(refreshed).not.toContain("id");
      });

      it("is one multi-row INSERT, not one statement per row", () => {
        expect(sql.match(/insert into experience/g)).toHaveLength(1);
        expect(sql.split("\n").filter((l) => l.startsWith("(")).length).toBeGreaterThan(1);
      });

      it("runs in its own transaction", () => {
        expect(sql).toMatch(/^BEGIN;$/m);
        expect(sql).toMatch(/^COMMIT;$/m);
      });

      it("carries no source URLs into the database", () => {
        expect(sql).not.toMatch(/https?:\/\//);
      });
    });
  }
});
