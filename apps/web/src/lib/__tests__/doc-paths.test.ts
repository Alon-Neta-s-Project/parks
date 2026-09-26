import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../../../../scripts/paths";

/**
 * 🔴 **קיים כי ארבעה קבצים הופנו ביום אחד לנתיבים שאינם קיימים**
 * (Issue #18), ומאז זה קרה עוד פעם. הפניה שבורה אינה שוברת כלום
 * בזמן בנייה — היא רק שולחת אדם לחפש קובץ שאין, בעוד חודשיים,
 * כשאיש כבר לא זוכר מה היה בו.
 *
 * ⚠️ **והיא נוצרת בדיוק כשמסדרים.** העברת מסמך לתיקייה חדשה משאירה
 * את כל ההפניות אליו מצביעות למקום הישן, בשקט.
 */


/** כל הקבצים במעקב git — אותו מקור כמו check-secrets. */
function tracked(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

const TEXT = /\.(md|ts|tsx|py|sql|sh|yml|yaml|json|astro)$/;

/**
 * נתיב שנראה כמו קובץ בריפו — תיקיית שורש מוכרת, ואחריה סיומת טקסט.
 *
 * ⚠️ **ואין כאן דוגמאות כתובות, בכוונה.** הגרסה הראשונה הדגימה את
 * התבנית בהערה הזו — והבדיקה תפסה את הדוגמאות של עצמה ברגע שהקובץ
 * נכנס ל-git. אותו דפוס בדיוק כמו במפתחות המזויפים של סורק הסודות:
 * דוגמה שנראית אמיתית **היא** אמיתית מבחינת הכלי שסורק אותה.
 */
/**
 * ⚠️ **`tsx` לפני `ts`, ואחריהם `(?![\w])`.**
 *
 * 🔴 בגרסה הראשונה הסדר היה הפוך, והרגקס חתך `HomePage.tsx` ל-`.ts`
 * — ואז דיווח על הפניה שבורה לקובץ שקיים. הגלאי הוא שהיה שבור, וזו
 * הפעם הרביעית בפרויקט. נתפס כי בדקתי כל ממצא מול הדיסק ולא סמכתי
 * על הרשימה.
 */
const PATH_RE =
  /(?<![\w./-])((?:apps|docs|claude|scripts|db|supabase|src|data)\/[\w./-]+\.(?:tsx|ts|md|py|sh|sql|json|ya?ml))(?![\w])/g;

/**
 * הפניות שבורות שקיימות מלפני הבדיקה הזו, ושלא ניתן לתקן בלי להכריע
 * מה התכוונו אליו — סקריפט ששונה שמו, או תוכנית שלא נבנתה. Issue #28.
 *
 * 🔴 **והרשימה הזו עצמה נבדקת.** ערך שתוקן ואינו שבור עוד מפיל את
 * הבדיקה, עם הודעה להסיר אותו. בלי זה רשימת ההיתר הופכת למקום שבו
 * הפניות שבורות מתחבאות — וזה בדיוק מה שהיא נועדה למנוע.
 */
const KNOWN_STALE = [
  "scripts/export-source-xlsx.py",
  "scripts/build-dataset.py",
  "scripts/ingest.ts",
  "scripts/seed.ts",
  "db/007_embedding_choice.sql",
];

/**
 * קבצים שהטקסט שלהם קפוא, ולכן הפניה שבהם נקראת לפי המיקום שבו הייתה
 * נכונה כשנכתבה — ומתורגמת דרך `MOVED`.
 *
 * ⚠️ **רק כאן, ולא בכל הרפו.** מפה שחלה על כל קובץ הייתה מעבירה בשקט
 * נתיב ישן במסמך חי — בדיוק מה שהבדיקה קיימת כדי לתפוס. מסמך חי מתוקן;
 * רק מה שאסור לגעת בו נכנס לכאן:
 * - הבריף כפי שהתקבל, ותשובת ההתאמה שנכתבה מולו — תיעוד היסטורי.
 * - הודעות סנכרון ומדידות מתוארכות — מה שנכתב אז, ולא מה שנכון היום.
 * - `supabase-bundle.sql` — מעתיק את טקסט המיגרציות כלשונו.
 * - המיגרציות עצמן (`SIGNED`) — חתומות. עריכה משנה את החתימה ונופלת
 *   באימות מול המסד החי.
 */
const FROZEN = [
  "docs/master-brief-v1.md",
  "docs/spec/conformance-response.md",
  "docs/spec/stage-0-schema-gap.md",
  "docs/park-day-companion-claude-code-sync-2.md",
  "docs/product/sync-3-onboarding.md",
  "apps/server/db/supabase-bundle.sql",
];
const SIGNED = /^apps\/server\/db\/migrations-history\/[^/]+\.sql$/;
const isFrozen = (file: string) => FROZEN.includes(file) || SIGNED.test(file);

/** פיצול הרפו (docs/refactor-server-split.md): המיקום הישן → החדש. */
const MOVED: [string, string][] = [
  ["db/", "apps/server/db/"],
  ["src/", "apps/web/src/"],
];

const resolveIn = (file: string, target: string): string => {
  if (!isFrozen(file)) return target;
  const hit = MOVED.find(([from]) => target.startsWith(from));
  return hit ? hit[1] + target.slice(hit[0].length) : target;
};

/**
 * ⚠️ **ב-`package.json` של סביבת עבודה, נתיב יחסי לחבילה ולא לשורש.**
 * ה-package.json של השרת מריץ את קובץ הכניסה בנתיב יחסי לחבילה, והבדיקה
 * קראה אותו כנתיב בשורש הרפו — אותה מלכודת שכבר נרשמה כאן: גלאי שקורא
 * טקסט בלי ההקשר שלו (ובגרסה הראשונה של ההערה הזו, היא תפסה את הדוגמה
 * שבה). רק שם, ולא בכל קובץ: במסמך, נתיב נקרא מהשורש.
 */
const exists = (file: string, target: string): boolean =>
  existsSync(join(ROOT, target)) ||
  (file.endsWith("package.json") && existsSync(join(ROOT, dirname(file), target)));

describe("מפת ההזזות אינה מתיישנת", () => {
  for (const [from] of MOVED) {
    it(`${from} — כבר אינו קיים, ולכן עדיין במפה`, () => {
      expect(existsSync(join(ROOT, from)), `${from} קיים שוב — להסיר אותו מ-MOVED`).toBe(false);
    });
  }
  for (const file of FROZEN) {
    it(`${file} — קיים, ולכן עדיין ברשימת הקפואים`, () => {
      expect(existsSync(join(ROOT, file)), `${file} אינו קיים — להסיר אותו מ-FROZEN`).toBe(true);
    });
  }
});

describe("רשימת ההיתר אינה מתיישנת", () => {
  for (const target of KNOWN_STALE) {
    it(`${target} — עדיין שבור, ולכן עדיין ברשימה`, () => {
      expect(
        existsSync(join(ROOT, target)),
        `${target} קיים עכשיו — להסיר אותו מ-KNOWN_STALE`,
      ).toBe(false);
    });
  }
});

describe("כל נתיב שמופיע בטקסט — קיים בפועל", () => {
  it("אין הפניה לקובץ שאינו קיים", () => {
    const broken: string[] = [];

    for (const file of tracked()) {
      if (!TEXT.test(file)) continue;
      let text: string;
      try {
        text = execFileSync("cat", [join(ROOT, file)], { encoding: "utf8" });
      } catch {
        continue;
      }
      for (const m of text.matchAll(PATH_RE)) {
        const target = m[1];
        if (target === undefined) continue;
        // ⚠️ נתיבים שנוצרים בזמן ריצה ואינם אמורים להיות בריפו.
        if (/^data\/(team1-inbox|deploy\/\d)/.test(target)) continue;
        // ⚠️ נוצר בזמן פריסה על ידי deploy-tim.yml עצמו — ה-slug אינו
        // שם התיקייה, וה-workflow מעתיק לשם לפני ההעלאה.
        if (target.startsWith("supabase/functions/quick-worker")) continue;
        if (target.includes("*")) continue;
        if (KNOWN_STALE.includes(target)) continue;
        if (!exists(file, resolveIn(file, target))) {
          broken.push(`  ${file} → ${target}`);
        }
      }
    }

    expect(
      broken,
      `הפניות שבורות:\n${[...new Set(broken)].join("\n")}`,
    ).toEqual([]);
  });
});
