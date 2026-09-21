import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **התנאי של גיא, נאכף ולא מתואר.**
 *
 * סוכן-האיסוף קורא תוכן חיצוני לא מהימן. ההכרעה (21.09) היא שהוא אינו
 * מחזיק שום credential — השליפה מ-Apify היא שלב ב-CI, והסוכן מתחיל
 * מהקובץ שנכתב.
 *
 * ⚠️ **וזה בדיוק סוג הכלל שנשחק בשקט.** מישהו יוסיף שלב ל-workflow
 * בעוד חצי שנה, יזיז `env` מהשלב ל-job כי "ככה יותר נוח", והטוקן יהיה
 * זמין לכל שלב — בלי שגיאה ובלי שאיש ישים לב. הבדיקה הזו נופלת על זה.
 */

const ROOT = join(__dirname, "..", "..", "..");
const WORKFLOW = join(ROOT, ".github", "workflows", "team1-collect.yml");
const AGENTS = join(ROOT, ".claude", "agents");

const workflow = readFileSync(WORKFLOW, "utf8");

/** ניתוח מספיק לשאלה אחת: באילו שלבים מופיע הסוד. */
function stepsWithSecret(yaml: string, secret: string): string[] {
  const lines = yaml.split("\n");
  const found: string[] = [];
  let currentStep = "(לפני השלב הראשון)";
  for (const line of lines) {
    const name = /^\s{6,}- name:\s*(.+)$/.exec(line) ?? /^\s{6,}-\s+uses:\s*(.+)$/.exec(line);
    if (name) currentStep = name[1].trim();
    if (line.includes(secret)) found.push(currentStep);
  }
  return [...new Set(found)];
}

describe("workflow האיסוף — הסוד אינו זולג משלב אחד", () => {
  it("APIFY_TOKEN מופיע בשלב אחד בלבד", () => {
    expect(stepsWithSecret(workflow, "APIFY_TOKEN")).toEqual(["שליפה מ-Apify"]);
  });

  it("אין env ברמת job", () => {
    // env בהזחה של 4 רווחים יושב על ה-job, לא על שלב.
    expect(workflow).not.toMatch(/^ {4}env:/m);
  });

  it("ברירת המחדל היא אפס הרשאות ל-GITHUB_TOKEN", () => {
    expect(workflow).toMatch(/^permissions:\s*\{\}\s*$/m);
  });

  it("אין סוד של המסד בקובץ הזה", () => {
    for (const forbidden of ["TEAM1_CONTENT_URL", "CI_CONTENT_URL", "SUPABASE_ACCESS_TOKEN"]) {
      expect(workflow).not.toContain(forbidden);
    }
  });
});

describe("סוכני צוות 1 — רשימת כלים מצומצמת", () => {
  /**
   * ⚠️ **שכבה שנייה, לא הראשונה.** מה שמגן הוא שאין credential בסביבה;
   * זה מצמצם את מה שסוכן יכול לעשות אם בכל זאת ימצא משהו. `Bash` היה
   * מאפשר `echo $APIFY_TOKEN`, ו-`WebFetch` היה מאפשר לשלוח החוצה.
   */
  const agents = ["team1-scraper", "team1-gatekeeper", "team1-organizer", "team1-verifier"];

  for (const agent of agents) {
    it(`${agent} — בלי Bash ובלי WebFetch`, () => {
      const front = readFileSync(join(AGENTS, `${agent}.md`), "utf8").split("---")[1];
      const tools = /^tools:\s*(.+)$/m.exec(front);
      expect(tools, `ל-${agent} אין שורת tools — ברירת המחדל היא כל הכלים`).not.toBeNull();
      const list = tools![1].split(",").map((t) => t.trim());
      expect(list).not.toContain("Bash");
      expect(list).not.toContain("WebFetch");
      expect(list.length).toBeGreaterThan(0);
    });
  }
});
