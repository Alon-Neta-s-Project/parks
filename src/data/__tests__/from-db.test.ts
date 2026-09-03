import { describe, expect, it } from "vitest";
import rows from "./db-rows.fixture.json";
import { PARK_NAME, toExperience, toParks, type ExperienceRow } from "../from-db";
import { experienceSchema } from "../schema";
import parksJson from "../parks.json";

/**
 * The fixture is six real rows pulled out of a real database, not rows I wrote.
 * A mapping test against hand-made input tests the mapping against my memory of
 * the schema, which is the thing most likely to be wrong.
 */
const dbRows = rows as unknown as ExperienceRow[];
const first = dbRows[0]!;
const mapped = dbRows.map(toExperience);
const ok = mapped.filter((m): m is ReturnType<typeof experienceSchema.parse> => !("refused" in m));

describe("מיפוי שורה מהמסד", () => {
  it("כל שש השורות עוברות, ואף אחת אינה נדחית", () => {
    const refused = mapped.filter((m) => "refused" in m);
    expect(refused).toEqual([]);
  });

  it("התוצאה עומדת בסכמה של האפליקציה, שדה בשדה", () => {
    for (const e of ok) expect(() => experienceSchema.parse(e)).not.toThrow();
  });

  // ⚠️ הבדיקה שמצדיקה את קיומו של PARK_NAME. במסד השם הוא
  // "Disney's Animal Kingdom Theme Park" ובאפליקציה "Disney's Animal Kingdom".
  // מיפוי לפי השם של המסד היה מסנן כל שורה של הפארק הזה מהדפדוף — בלי שגיאה,
  // פשוט רשימה ריקה.
  it("שמות הפארקים תואמים ל-parks.json, אחד לאחד", () => {
    const appNames = new Set(parksJson.map((p) => p.name));
    for (const [id, name] of Object.entries(PARK_NAME)) {
      expect(appNames.has(name), `${id} → ${name} אינו ב-parks.json`).toBe(true);
    }
    expect(Object.keys(PARK_NAME)).toHaveLength(appNames.size);
  });

  it("שם עברי ושמות נרדפים נשלפים מתוך ה-jsonb", () => {
    const everest = ok.find((e) => e.id.includes("expedition-everest"))!;
    expect(everest.nameHe).toBe("אקספדישן אוורסט");
    expect(Array.isArray(everest.aliasesHe)).toBe(true);
  });

  // ⚠️ numeric חוזר מ-PostgREST כמחרוזת. Number(null) הוא 0, ומהירות של
  // 0 קמ"ש הייתה מוצגת כעובדה.
  it("מהירות: מחרוזת הופכת למספר, וריק נשאר null", () => {
    const everest = ok.find((e) => e.id.includes("expedition-everest"))!;
    const gentle = ok.find((e) => e.id.includes("astronomica"))!;
    expect(everest.maxSpeedKmh).toBe(80);
    expect(gentle.maxSpeedKmh).toBeNull();
  });

  // ⚠️ 0 היפוכים הוא תשובה, לא היעדר תשובה. זו כל הסיבה למיגרציה 023.
  it("אפס היפוכים נשאר אפס, ולא הופך ל-null", () => {
    const everest = ok.find((e) => e.id.includes("expedition-everest"))!;
    const rock = ok.find((e) => e.id.includes("rock-n-roller"))!;
    const show = ok.find((e) => e.id.includes("astronomica"))!;
    expect(everest.inversions).toBe(0);
    expect(rock.inversions).toBe(3);
    expect(show.inversions).toBeNull();
  });

  // ⚠️ מתקן שנסגר זמנית אינו מתקן סגור. "סגור" למשפחה שמתכננת נסיעה הוא
  // טעות בכיוון שעולה לה את הביקור.
  it("temporarily_closed הופך ל-check ולא ל-closed, והמשפט נשמר", () => {
    const slush = ok.find((e) => e.id.includes("slush-gusher"))!;
    expect(slush.status.state).toBe("check");
    expect(slush.status.note).toBeTruthy();
  });

  // ⚠️ 74 שורות null מול 75 שורות 'none'. מיזוג היה הופך 74 חוסרי-ידיעה
  // ל"אין" בוטח.
  it("null ו-none אינם אותו דבר במוצר דילוג בתור", () => {
    const notChecked = ok.find((e) => e.id.includes("astronomica"))!;
    const checkedNone = ok.find((e) => e.id.includes("conservation-station"))!;
    expect(notChecked.fastAccess.unconfirmed).toBe(true);
    expect(notChecked.fastAccess.offered).toBe(false);
    expect(checkedNone.fastAccess.unconfirmed).toBe(false);
    expect(checkedNone.fastAccess.offered).toBe(false);
  });

  it("Single Pass ו-Multi Pass נבדלים, ורק Single דורש תשלום נפרד", () => {
    const single = ok.find((e) => e.id.includes("flight-of-passage"))!;
    const multi = ok.find((e) => e.id.includes("expedition-everest"))!;
    expect(single.fastAccess.system).toBe("Single Pass");
    expect(single.fastAccess.singlePassRequired).toBe(true);
    expect(single.fastAccess.extraCost).toBe(true);
    expect(multi.fastAccess.system).toBe("Multi Pass");
    expect(multi.fastAccess.singlePassRequired).toBe(false);
    expect(multi.fastAccess.extraCost).toBe(false);
  });

  // ⚠️ 0 ס"מ פירושו "נבדק, אין מגבלה" — ולא "לא נבדק".
  it("גובה 0 שורד כ-0 ואינו הופך ל-null", () => {
    const noLimit = ok.find((e) => e.id.includes("conservation-station"))!;
    expect(noLimit.heightRequirementCm).toBe(0);
    expect(ok.find((e) => e.id.includes("flight-of-passage"))!.heightRequirementCm).toBe(112);
  });

  it("שורה עם park_id לא מוכר נדחית, ולא מקבלת ברירת מחדל", () => {
    const bad = { ...first, park_id: "atlantis" };
    expect(toExperience(bad)).toEqual({ refused: "park_id לא מוכר: atlantis" });
  });

  it("שורה בלי תאריך אימות נדחית", () => {
    const bad = { ...first, last_verified: null };
    expect(toExperience(bad)).toEqual({ refused: "אין תאריך אימות" });
  });
});

describe("רשימת הפארקים", () => {
  it("נספרת מהשורות ואינה נקראת מקובץ", () => {
    const parks = toParks(ok);
    const ak = parks.find((p) => p.name === "Disney's Animal Kingdom")!;
    expect(ak.count).toBe(ok.filter((e) => e.park === ak.name).length);
    expect(ak.slug).toBe("disney-s-animal-kingdom");
    expect(ak.lands.length).toBeGreaterThan(0);
  });

  it("rated סופר רק מדורגים", () => {
    const parks = toParks(ok);
    for (const p of parks) expect(p.rated).toBeLessThanOrEqual(p.count);
  });
});
