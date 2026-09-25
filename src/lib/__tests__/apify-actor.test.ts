import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../../scripts/paths";

/**
 * 🔴 **אקטור רשמי בלבד — הכרעת נטע, 22.09.**
 *
 * ב-Apify יש אקטורים שהחברה עצמה מתחזקת, ואקטורים שמשתמשים העלו. שניהם
 * נראים זהה בקריאת API, וההבדל היחיד שנראה בקוד הוא **מי הבעלים**:
 * המזהה בנוי `<בעלים>~<שם>`, ו-`apify~` הוא החשבון של החברה.
 *
 * ⚠️ **ולכן זו הבחנה שאפשר לאכוף, ולא רק להחליט עליה פעם אחת.** מי
 * שיחליף אקטור בעוד חצי שנה יכתוב מזהה אחר, ושום דבר לא היה תופס את
 * זה: הסקריפט היה ממשיך לרוץ, הנתונים היו ממשיכים לזרום, ומקור התוכן
 * היה משתנה בשקט.
 *
 * זה לא בודק דירוג או איכות — את אלה אי אפשר לבדוק מכאן (הרשת חוסמת
 * את apify.com). הוא בודק את הדבר היחיד שכן ניתן לבדיקה: הבעלות.
 */

const ACTOR_RE = /api\.apify\.com\/v2\/acts\/([^/'"\s]+)/g;

function tracked(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

describe("Apify — אקטורים רשמיים בלבד", () => {
  it("כל מזהה אקטור בריפו שייך לחשבון apify", () => {
    const foreign: string[] = [];
    let found = 0;

    for (const file of tracked()) {
      if (!/\.(sh|ts|py|yml|yaml|md|json)$/.test(file)) continue;
      let text: string;
      try {
        text = readFileSync(join(ROOT, file), "utf8");
      } catch {
        continue;
      }
      for (const m of text.matchAll(ACTOR_RE)) {
        const actor = m[1];
        if (actor === undefined) continue;
        found += 1;
        if (!actor.startsWith("apify~")) foreign.push(`  ${file} → ${actor}`);
      }
    }

    // ⚠️ אפס מזהים אינו הצלחה — הוא אומר שהרגקס הפסיק להתאים.
    expect(found, "לא נמצא אף מזהה אקטור — הבדיקה כבר לא בודקת דבר").toBeGreaterThan(0);
    expect(foreign, `אקטור שאינו של apify:\n${foreign.join("\n")}`).toEqual([]);
  });
});
