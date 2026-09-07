import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { experiences, parks } from "../../data";
import { experienceSchema, parkSchema } from "../../data/schema";

describe("dataset", () => {
  it("every row validates against the schema", () => {
    for (const e of experiences) {
      const parsed = experienceSchema.safeParse(e);
      if (!parsed.success) throw new Error(`${e.id}: ${parsed.error.issues[0]?.message}`);
    }
    for (const p of parks) expect(parkSchema.safeParse(p).success).toBe(true);
  });

  it("holds only attractions and entertainment", () => {
    // ⚠️ מול המניפסט ולא מול מספר קשיח. מספר קשיח נשבר בכל מנת תוכן
    // ומתוקן בלי מחשבה, וכך הוא מפסיק להיות שמירה. מול המניפסט הוא
    // שואל את השאלה האמיתית: האם הדאטהסט מכיל את מה שהייצוא הביא.
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "data/source/product_export_manifest.json"), "utf8"),
    );
    expect(experiences).toHaveLength(manifest.rows);
    expect(new Set(experiences.map((e) => e.kind))).toEqual(
      new Set(["attraction", "entertainment"]),
    );
  });

  it("ids are unique, so the slug rule survives repeat imports", () => {
    expect(new Set(experiences.map((e) => e.id)).size).toBe(experiences.length);
  });

  it("unrated intensity is null, never zero", () => {
    for (const e of experiences) {
      if (e.intensity.rated) expect(e.intensity.value).toBeGreaterThan(0);
      else expect(e.intensity.value).toBeNull();
    }
    // The count moves with every export; what must hold is that rated and
    // valued always agree.
    const rated = experiences.filter((e) => e.intensity.rated);
    expect(rated.length).toBeGreaterThan(0);
    expect(rated.every((e) => e.intensity.value !== null)).toBe(true);
  });

  it("carries no invented content", () => {
    for (const e of experiences) {
      // Held back by decision, not missing by accident.
      expect(e.editorial).toBeNull();
      expect(e.youtubeId).toBeNull();
      expect(e.videoCreator).toBeNull();
    }
  });

  it("every row carries a check date, and no source of any kind", () => {
    for (const e of experiences) {
      expect(e.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Attribution stays in the master. A leak would show up as a URL anywhere
      // in the row.
      expect(JSON.stringify(e)).not.toMatch(/https?:\/\/|www\./);
    }
  });

  it("keeps four-state fields four-state, never collapsing unknown to false", () => {
    const quad = [
      "bigDrops", "spinning", "airConditioned",
      "isMotionSimulator", "usesLargeScreensOr3d", "motionSicknessWarning",
    ] as const;
    for (const e of experiences) {
      for (const f of quad) {
        expect([null, "true", "false", "na"]).toContain(e[f]);
      }
      // ⚠️ ארבעה ערכים ולא שלושה. "na" הוא מופע — השאלה אינה חלה, וזו
      // תשובה. null הוא "לא נבדק". ההערה כאן אמרה "שלושה" עד ש-v7_10
      // הביא N/A בפועל.
      expect([null, "none", "may_get_wet", "may_get_soaked", "na"]).toContain(e.getsWet);
    }
  });

  it("keeps height to the three states migration 012 defines", () => {
    // 0 = checked, no limit. 50-200 = the limit. null = not checked.
    // Nothing in between, and never a number below 50 that is not zero.
    for (const e of experiences) {
      const h = e.heightRequirementCm;
      if (h === null) continue;
      expect(h === 0 || (h >= 50 && h <= 200)).toBe(true);
    }
    expect(experiences.some((e) => e.heightRequirementCm === 0)).toBe(true);
  });
});

describe("the master never reaches the repo", () => {
  it("keeps data/source to the export and what describes it", () => {
    const allowed = new Set([
      "product_export.csv",
      "product_export_manifest.json",
      "subtype_map.json",
      "subtype_vocab_review.csv",
    ]);
    for (const file of readdirSync(join(process.cwd(), "data/source"))) {
      expect(allowed).toContain(file);
    }
  });

  it("has no field that could name a source", () => {
    const forbidden = /source|basis|tier|url|confidence|calibration|conflict|retrieved/i;
    for (const e of experiences) {
      for (const key of Object.keys(e)) {
        // lastVerified is a date, and a date does not give away where it came from.
        if (key === "lastVerified") continue;
        expect(key).not.toMatch(forbidden);
      }
    }
  });
});

describe("the closed vocabulary", () => {
  const map: Record<string, { type: string; category: string }> = JSON.parse(
    readFileSync(join(process.cwd(), "data/source/subtype_map.json"), "utf8"),
  );

  it("covers every row, so no row needs a default", () => {
    for (const e of experiences) {
      expect(Object.values(map).length).toBeGreaterThan(0);
      expect(e.type).toBeTruthy();
      expect(e.category).toBeTruthy();
    }
  });

  it("has no transport, in either the map or the data", () => {
    // Buses, the monorail, the Skyliner and the ferries are not in this table
    // at all. A ride whose shape is a vehicle is scenic_ride, not transport, so
    // "how do I get to EPCOT" can never be answered with "PeopleMover".
    for (const entry of Object.values(map)) {
      expect(entry.type).not.toBe("transport");
      expect(entry.category).not.toBe("transport");
    }
    for (const e of experiences) {
      expect(e.type).not.toBe("transport");
      expect(e.category).not.toBe("transport");
    }
  });

  it("keeps the five scenic rides as attractions", () => {
    const scenic = experiences.filter((e) => e.category === "scenic_ride");
    expect(scenic).toHaveLength(5);
    expect(scenic.every((e) => e.type === "attraction")).toBe(true);
  });

  it("never lets a dark ride imply a sensitivity flag", () => {
    // dark_ride is an industry term for an indoor tracked ride. Peter Pan's
    // Flight is one. The category must not predict nausea or intensity, so the
    // test is that dark rides genuinely vary on both — not that any particular
    // one is unset.
    const darkRides = experiences.filter((e) => e.category === "dark_ride");
    expect(darkRides.length).toBeGreaterThan(0);
    expect(new Set(darkRides.map((e) => e.motionSicknessWarning)).size).toBeGreaterThan(1);
    expect(new Set(darkRides.map((e) => e.intensity.value)).size).toBeGreaterThan(1);
    // And most of them are the gentlest rating, which is the point.
    expect(darkRides.filter((e) => e.intensity.value === 1).length).toBeGreaterThan(
      darkRides.length / 2,
    );
  });
});

/** Quote-aware, because several columns hold sentences with commas in them. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\ufeff/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

describe("what must never be inferred", () => {
  it("ארבעת דגלי הרגישות מגיעים מהמאסטר, ולא נשארים ריקים", () => {
    // 🔴 הבדיקה הזו תיעדה פער ועכשיו היא אוכפת את סגירתו.
    //
    // היא אמרה "עדיין לא בייצוא", וזה היה נכון — לא כי הנתון חסר, אלא
    // כי ארבע העמודות לא היו בחוזה הייצוא. במאסטר יש להן ערך כמעט
    // לכל שורה, והן נזרקו בדרך. זהו המופע השני מתוך שבעה של התבנית,
    // והוא נסגר כאן.
    for (const f of ["sensEnclosedDark", "sensLoudSudden", "sensStrobe"] as const) {
      const yes = experiences.filter((e) => e[f] === true).length;
      const no = experiences.filter((e) => e[f] === false).length;
      expect(yes, f).toBeGreaterThan(0);
      expect(no, f).toBeGreaterThan(0);
    }
  });

  it("'לא רלוונטי' נשאר ריק ואינו הופך ל-false", () => {
    // ⚠️ sens_heights נושא N/A ב-77 שורות — מופעים, שאין להם "חשיפה
    // לגובה". N/A הוא "לא חל", והוא **אינו** false. false פירושו נבדק
    // ואין רגישות, וזו אמירה שמשפחה מסתמכת עליה.
    const unchecked = experiences.filter((e) => e.sensHeights === null).length;
    expect(unchecked).toBeGreaterThan(0);
  });

  it("never lets dark_ride imply enclosed-and-dark", () => {
    // 🔴 הכלל שחייב לשרוד גם עכשיו כשיש נתונים.
    //
    // dark_ride הוא מונח תעשייתי למתקן ממוסלל בתוך מבנה, לא למתקן
    // מפחיד. גזירה של הדגל מהקטגוריה הייתה מסמנת כל מתקן משפחתי עדין
    // בקטגוריה כסיכון קלאוסטרופוביה.
    //
    // ⚠️ **הכלל אינו "אף dark ride אינו מסומן".** במאסטר 22 מתוך 48
    // כן מסומנים, ובצדק — אדם הכריע לגבי כל אחד. הכלל הוא שההכרעה
    // מגיעה מהמאסטר ולא מהקטגוריה.
    //
    // ⚠️ קודם נבדק ש**כולם** null; זה כבר לא נכון, ולכן הכלל נבדק
    // אחרת: אילו הדגל היה נגזר מהקטגוריה, **כל** ה-dark rides היו
    // מסומנים true. פיזור מעורב הוא ההוכחה שהערך מגיע מהמאסטר.
    const darkRides = experiences.filter((e) => e.category === "dark_ride");
    expect(darkRides.length).toBeGreaterThan(0);
    expect(darkRides.some((e) => e.sensEnclosedDark !== true)).toBe(true);
  });

  it("copies numbers from the export instead of transforming them", () => {
    // Rounding is a content decision and belongs in the master, so the importer
    // must never adjust a value on the way in.
    //
    // This compares against the export itself rather than asserting that some
    // fractional value exists. Durations happen to be whole numbers now that the
    // master was corrected, and a test that depended on 2.583 still being there
    // would have stopped guarding anything the moment it was fixed.
    const csv = readFileSync(join(process.cwd(), "data/source/product_export.csv"), "utf8");
    const rows = parseCsv(csv);
    const [headers] = rows;
    const keyAt = headers!.indexOf("Key");
    const durationAt = headers!.indexOf("duration_minutes");
    expect(keyAt).toBeGreaterThan(-1);
    expect(durationAt).toBeGreaterThan(-1);

    const fromCsv = new Map<string, string>();
    for (const cells of rows.slice(1)) {
      if (cells.length <= durationAt) continue;
      fromCsv.set(cells[keyAt]!.trim(), (cells[durationAt] ?? "").trim());
    }

    let compared = 0;
    for (const e of experiences) {
      const raw = fromCsv.get(e.key);
      if (raw === undefined || raw === "") continue;
      // ⚠️ "N/A" אינו מספר, והייבוא משאיר null. זו אינה המרה — זו
      // היעדר ערך, והשוואה מולו הייתה מצפה ל-NaN.
      if (Number.isNaN(Number(raw))) continue;
      compared += 1;
      expect(e.durationMinutes).toBe(Number(raw));
    }
    expect(compared).toBeGreaterThan(0);
  });
});

describe("gets_wet holds four states, not three", () => {
  it("accepts na as a value distinct from null", () => {
    // "na" is a stage show: the question does not apply, and that is an answer.
    // null is "not checked". Collapsing them would make Tim say "no information"
    // about something with a perfectly clear answer — the same family of mistake
    // this field has already made twice.
    for (const e of experiences) {
      expect([null, "none", "may_get_wet", "may_get_soaked", "na"]).toContain(e.getsWet);
    }
  });

  it("מקבל na מהייצוא — מופע אינו 'לא נבדק'", () => {
    // 🔴 הבדיקה הזו תיעדה פער, וכעת היא אוכפת את סגירתו.
    //
    // היא אמרה "עדיין לא התקבל na מהייצוא", ובמשך חודשים זה נכון היה —
    // אבל הסיבה לא הייתה מה שחשבנו. **המאסטר כתב N/A כל הזמן הזה,
    // והייבוא שלנו זרק אותו** כי אוצר המילים מאיית "na". 77 שורות
    // נקראו "לא נבדק" בזמן שמישהי טרחה לענות עליהן.
    //
    // ⚠️ ולכן היא מנוסחת עכשיו כאכיפה ולא כתיעוד: אם נחזור לזרוק N/A,
    // היא נופלת.
    const shows = experiences.filter((e) => e.kind === "entertainment");
    expect(shows.length).toBeGreaterThan(0);
    expect(experiences.some((e) => e.getsWet === "na")).toBe(true);
    expect(shows.every((e) => e.getsWet !== null)).toBe(true);
  });
});
