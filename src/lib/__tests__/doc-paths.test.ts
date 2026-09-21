import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **קיים כי ארבעה קבצים הופנו ביום אחד לנתיבים שאינם קיימים**
 * (Issue #18), ומאז זה קרה עוד פעם. הפניה שבורה אינה שוברת כלום
 * בזמן בנייה — היא רק שולחת אדם לחפש קובץ שאין, בעוד חודשיים,
 * כשאיש כבר לא זוכר מה היה בו.
 *
 * ⚠️ **והיא נוצרת בדיוק כשמסדרים.** העברת מסמך לתיקייה חדשה משאירה
 * את כל ההפניות אליו מצביעות למקום הישן, בשקט.
 */

const ROOT = join(__dirname, "..", "..", "..");

/** כל הקבצים במעקב git — אותו מקור כמו check-secrets. */
function tracked(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

const TEXT = /\.(md|ts|tsx|py|sql|sh|yml|yaml|json|astro)$/;

/** נתיב שנראה כמו קובץ בריפו: docs/x.md, claude/y.md, scripts/z.py */
/**
 * ⚠️ **`tsx` לפני `ts`, ואחריהם `(?![\w])`.**
 *
 * 🔴 בגרסה הראשונה הסדר היה הפוך, והרגקס חתך `HomePage.tsx` ל-`.ts`
 * — ואז דיווח על הפניה שבורה לקובץ שקיים. הגלאי הוא שהיה שבור, וזו
 * הפעם הרביעית בפרויקט. נתפס כי בדקתי כל ממצא מול הדיסק ולא סמכתי
 * על הרשימה.
 */
const PATH_RE =
  /(?<![\w./-])((?:docs|claude|scripts|db|supabase|src|data)\/[\w./-]+\.(?:tsx|ts|md|py|sh|sql|json|ya?ml))(?![\w])/g;

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
        if (!existsSync(join(ROOT, target))) {
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
