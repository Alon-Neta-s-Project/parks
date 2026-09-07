import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import rows from "./db-rows.fixture.json";

const state = { configured: true, result: {} as unknown };

vi.mock("../../lib/supabase", () => ({
  get isConfigured() {
    return state.configured;
  },
  supabase: () =>
    state.configured
      ? { from: () => ({ select: async () => state.result }) }
      : null,
}));

const { loadContent } = await import("../source");

beforeEach(() => {
  state.configured = true;
  state.result = { data: rows, error: null };
});

/**
 * ⚠️ הכלל שהקובץ הזה אוכף (CLAUDE.md): אין נפילה שקטה למקור נתונים ישן.
 * הדאטהסט המובנה הוא נפילה לגיטימית — הוא שומר על מוצר עובד בלי מפתחות —
 * אבל ברגע שהוא מה שעל המסך, זה חייב להיראות. תוכן שקפא בזמן הבנייה
 * שמוצג כאילו הוא עדכני הוא הכשל שהמוצר בנוי נגדו.
 */
/** מספר השורות שהייצוא הנוכחי הביא, לפי המניפסט. */
function bundledRows(): number {
  return JSON.parse(
    readFileSync(join(process.cwd(), "data/source/product_export_manifest.json"), "utf8"),
  ).rows;
}

describe("מאיפה מגיע התוכן", () => {
  it("מסד זמין — נקרא ממנו, ונאמר שכך", async () => {
    const s = await loadContent();
    expect(s.status).toBe("database");
    expect(s.experiences.length).toBe(rows.length);
    expect(s.parks.length).toBeGreaterThan(0);
  });

  it("בלי הגדרות — נופל למובנה, **ואומר למה**", async () => {
    state.configured = false;
    const s = await loadContent();
    expect(s.status).toBe("bundled");
    if (s.status !== "bundled") throw new Error("unreachable");
    expect(s.reason).toEqual({ kind: "not_configured" });
    // ⚠️ מול המניפסט ולא מול מספר קשיח — ראה ההערה ב-dataset.test.ts.
    expect(s.experiences.length).toBe(bundledRows());
  });

  it("המסד לא נענה — נופל למובנה עם ההסבר, ולא מתרסק", async () => {
    state.result = { data: null, error: { message: "connection refused" } };
    const s = await loadContent();
    if (s.status !== "bundled") throw new Error("ציפינו לנפילה מדווחת");
    expect(s.reason).toEqual({ kind: "unreachable", detail: "connection refused" });
  });

  it("חריגה שנזרקת אינה מגיעה לקורא — מסך ריק הוא הכשל השקט בגרסתו החזקה", async () => {
    state.result = Promise.reject(new Error("boom"));
    const s = await loadContent();
    if (s.status !== "bundled") throw new Error("ציפינו לנפילה מדווחת");
    expect(s.reason.kind).toBe("unreachable");
  });

  // ⚠️ "ריק" ו"כל השורות נדחו" הם שתי תקלות שונות עם שני תיקונים שונים.
  it("מסד ריק ומסד שכל שורותיו נדחו אינם אותה סיבה", async () => {
    state.result = { data: [], error: null };
    const empty = await loadContent();
    if (empty.status !== "bundled") throw new Error("x");
    expect(empty.reason.kind).toBe("empty");

    state.result = { data: rows.map((r) => ({ ...r, park_id: "atlantis" })), error: null };
    const refused = await loadContent();
    if (refused.status !== "bundled") throw new Error("x");
    expect(refused.reason.kind).toBe("all_refused");
    if (refused.reason.kind !== "all_refused") throw new Error("x");
    expect(refused.reason.refused[0]).toContain("atlantis");
  });

  // ⚠️ הגשה שקטה של 5 שורות מתוך 6 היא בדיוק האובדן הקטן שאיש לא מבחין בו
  // עד שמשפחה לא מוצאת מתקן.
  it("דחייה חלקית עדיין משתמשת במסד — ומדווחת כמה נדחו", async () => {
    const mixed = rows.map((r, i) => (i === 0 ? { ...r, last_verified: null } : r));
    state.result = { data: mixed, error: null };
    const s = await loadContent();
    expect(s.status).toBe("database");
    if (s.status !== "database") throw new Error("x");
    expect(s.experiences.length).toBe(rows.length - 1);
    expect(s.refused).toEqual(["אין תאריך אימות"]);
  });
});
