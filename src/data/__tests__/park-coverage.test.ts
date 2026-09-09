import { describe, expect, it } from "vitest";
import { experiences } from "../index";

/**
 * 🔴 **ל-Magic Kingdom אין ולו שורת מפגש דמויות אחת אצלנו.**
 *
 * נטע כתבה "אין סיכוי בעולם שיש 0 מפגשי דמויות במג'יק קינגדום", ובדקתי:
 * זה לא באג בספירה. השורות פשוט אינן קיימות. מפגשי הדמויות נחקרים
 * באצוות, והאצווה האחרונה (07.09, 8 שורות) הייתה כולה ב-Animal Kingdom,
 * ב-Hollywood Studios וב-EPCOT.
 *
 * ⚠️ **ולמה אף בדיקה לא תפסה את זה: כל הבדיקות שלנו סופרות שדות חסרים
 * בשורות שיש.** לאף אחת אין מושג על **שורה שחסרה לגמרי**. דוח הכיסוי
 * של הייבוא מדווח 242/242 על שורות שנטענו — לא על שורות שהיו אמורות
 * להיות ואינן.
 *
 * ⚠️ וזו אותה תבנית שוב, שכבה אחת למעלה: העדר נקרא כתשובה. הפעם לא
 * ערך ריק בשדה, אלא **קטגוריה ריקה בפארק** — וכל פרופיל פארק שנבנה על
 * הנתונים האלה היה מדווח "אין מפגשי דמויות" כעובדה.
 */

/** ⚠️ שבעת פארקי הנושא בלבד. לפארקי מים אין מופעים ומפגשים במבנה הזה. */
const THEME_PARKS = [
  "Magic Kingdom",
  "EPCOT",
  "Disney's Hollywood Studios",
  "Disney's Animal Kingdom",
  "Universal Studios Florida",
  "Universal Islands of Adventure",
  "Universal Epic Universe",
];

/**
 * 🔴 **פערי כיסוי ידועים, ומוצהרים במפורש.**
 *
 * הרשימה הזו אינה היתר — היא הצהרה שמישהו ראה את הפער והחליט. פער חדש
 * שאינו כאן **מפיל את הבנייה**, וזה כל תפקידה.
 *
 * ⚠️ **וכל שורה כאן היא חוב, לא מצב יציב.** היא נמחקת כשהמחקר משלים
 * את הקטגוריה — ולא כשמישהו מתעייף מהבדיקה.
 */
const KNOWN_GAPS: Record<string, string[]> = {
  "Magic Kingdom": ["meet_greet"],
  "Disney's Hollywood Studios": ["meet_greet"],
};

const CATEGORIES = ["meet_greet", "show"] as const;

const count = (park: string, kind: (typeof CATEGORIES)[number]) =>
  experiences.filter((e) =>
    e.park === park &&
    (kind === "meet_greet" ? e.type === "meet_greet" : e.kind === "entertainment" && e.type !== "meet_greet"),
  ).length;

describe("כיסוי קטגוריות בפארקי הנושא", () => {
  it("קטגוריה ריקה בפארק נושא היא פער מוצהר, ולא עובדה", () => {
    const undeclared: string[] = [];
    for (const park of THEME_PARKS) {
      for (const kind of CATEGORIES) {
        if (count(park, kind) > 0) continue;
        if (KNOWN_GAPS[park]?.includes(kind)) continue;
        undeclared.push(`${park} — אפס שורות מסוג ${kind}`);
      }
    }
    expect(undeclared, "פער כיסוי שלא הוצהר").toEqual([]);
  });

  /**
   * ⚠️ **והכיוון ההפוך, שהוא זה שבאמת נשכח.** פער שהושלם ונשאר ברשימה
   * הופך אותה לרעש, ואז מוסיפים אליה בלי לחשוב. רשימה שמתנקה מעצמה
   * היא היחידה שנקראת.
   */
  it("פער שהושלם נמחק מהרשימה", () => {
    const stale: string[] = [];
    for (const [park, kinds] of Object.entries(KNOWN_GAPS)) {
      for (const kind of kinds) {
        const n = count(park, kind as (typeof CATEGORIES)[number]);
        if (n > 0) stale.push(`${park} — ${kind}: כבר ${n} שורות, למחוק מ-KNOWN_GAPS`);
      }
    }
    expect(stale, "פער שהושלם ולא נמחק").toEqual([]);
  });

  /** ⚠️ שבעת הפארקים חייבים להתקיים. שם שהשתנה שובר את הבדיקה בשקט. */
  it("שבעת פארקי הנושא קיימים בשמות האלה", () => {
    const missing = THEME_PARKS.filter((p) => !experiences.some((e) => e.park === p));
    expect(missing).toEqual([]);
  });
});
