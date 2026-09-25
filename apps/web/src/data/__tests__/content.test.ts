import { describe, expect, it } from "vitest";
import { deriveContent } from "../content";
import { experiences as bundled, parks as bundledParks } from "../index";
import type { Reason, SourceState } from "../source";

/**
 * 🔴 **הפער שהבדיקה הזו נועדה למנוע מלחזור.**
 *
 * `loadContent()` נכתב, נבדק ביסודיות, ומעולם לא נקרא. חמישה רכיבים
 * ייבאו את הקובץ המצורף ישירות, ולכן כל טעינה למסד — 242 שורות, מנת
 * תוכן שלמה — לא הגיעה לאף מסך. **ושום בדיקה לא נכשלה**, כי כל אחד
 * מהחלקים עבד בפני עצמו.
 *
 * הכשל ישב בתפר, בדיוק כמו הבאג של find_experiences. לכן מה שנבדק כאן
 * הוא **החיבור**: שהמצב מגיע לקורא, ושהקובץ המצורף לעולם אינו מתחזה
 * למסד.
 */
const db = (experiences = bundled): SourceState =>
  ({ status: "database", experiences, parks: bundledParks, refused: [] });

describe("התוכן שהמסך מציג", () => {
  it("מסד — הסטטוס עובר, ואין סיבת נפילה", () => {
    const c = deriveContent(db());
    expect(c.status).toBe("database");
    expect(c.reason).toBeNull();
    expect(c.experiences.length).toBe(bundled.length);
  });

  // ⚠️ הכלל המרכזי (CLAUDE.md): אין נפילה שקטה למקור נתונים ישן.
  it("קובץ מצורף אינו מתחזה למסד — הסיבה תמיד נגישה לממשק", () => {
    const reasons: Reason[] = [
      { kind: "not_configured" },
      { kind: "unreachable", detail: "timeout" },
      { kind: "empty" },
      { kind: "all_refused", refused: ["x"] },
    ];
    for (const reason of reasons) {
      const c = deriveContent({
        status: "bundled", experiences: bundled, parks: bundledParks, reason,
      });
      expect(c.status).toBe("bundled");
      expect(c.reason?.kind).toBe(reason.kind);
    }
  });

  // ⚠️ 240 מתוך 242 נראה תקין לחלוטין. אובדן חלקי שאינו נאמר הוא אובדן שקט.
  it("שורות שנדחו מגיעות לממשק גם כשהמסד כן זמין", () => {
    const c = deriveContent({
      status: "database", experiences: bundled, parks: bundledParks,
      refused: ["ride-a", "ride-b"],
    });
    expect(c.status).toBe("database");
    expect(c.refused).toEqual(["ride-a", "ride-b"]);
  });

  // ⚠️ מסך ריק לשנייה הוא הפסד ודאי. בטעינה מוצג המצורף — ומסומן ככזה.
  it("בזמן טעינה יש תוכן, והסטטוס אינו 'מסד'", () => {
    const c = deriveContent({ status: "loading", experiences: bundled, parks: bundledParks });
    expect(c.status).toBe("loading");
    expect(c.experiences.length).toBeGreaterThan(0);
    expect(c.reason).toBeNull();
  });

  it("העוזרים נגזרים מהתוכן החי, לא מהקובץ", () => {
    const one = bundled.slice(0, 1);
    const c = deriveContent(db(one));
    expect(c.coverage.total).toBe(1);
    expect(c.bySlug(one[0]!.id)?.id).toBe(one[0]!.id);
    expect(c.bySlug(bundled[5]!.id)).toBeUndefined();
  });
});
