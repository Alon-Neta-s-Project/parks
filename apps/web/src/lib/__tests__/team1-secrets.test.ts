import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../../../../scripts/paths";

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

const WORKFLOW = join(ROOT, ".github", "workflows", "team1-collect.yml");
const AGENTS = join(ROOT, ".claude", "agents");

const workflow = readFileSync(WORKFLOW, "utf8");
const publishWorkflow = readFileSync(
  join(ROOT, ".github", "workflows", "team1-publish.yml"),
  "utf8",
);
const notesWorkflow = readFileSync(
  join(ROOT, ".github", "workflows", "tester-notes.yml"),
  "utf8",
);

/**
 * ניתוח מספיק לשאלה אחת: באילו שלבים מופיע הסוד.
 *
 * 🔴 **ההערות מוסרות — והיעדר הסינון הפיל את הבדיקה פעם רביעית בסשן
 * אחד.** הפסקה שמסבירה *למה* אין כאן סוד חדש מזכירה את שם הסוד,
 * והבדיקה ספרה אותה כשלב.
 *
 * אותה צורה בדיוק כמו המפתחות המזויפים בסורק הסודות, הדוגמאות בבודק
 * הנתיבים, וההערה בהקשרי Netlify. **גלאי שקורא את הפרוזה שסביב הדבר
 * במקום את הדבר.** כאן זה במקום אחד, ולכן חל על כל ה-workflows.
 */
function stepsWithSecret(yaml: string, secret: string): string[] {
  const lines = yaml.split("\n").filter((l) => !l.trimStart().startsWith("#"));
  const found: string[] = [];
  let currentStep = "(לפני השלב הראשון)";
  for (const line of lines) {
    const name = /^\s{6,}- name:\s*(.+)$/.exec(line) ?? /^\s{6,}-\s+uses:\s*(.+)$/.exec(line);
    if (name?.[1] !== undefined) currentStep = name[1].trim();
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

  /**
   * 🔴 **`permissions: {}` היה כאן, והוא היה שובר את ה-workflow.**
   *
   * גיא שאל (21.09) אם הקובץ אי פעם רץ. לא — ו-`{}` מאפס גם `contents`,
   * ש-`actions/checkout@v4` דורש על ריפו פרטי. כלומר הוא היה נופל בשלב
   * הראשון, ואיש לא היה יודע, כי אף אחד לא הריץ.
   *
   * הבדיקה מכאן ואילך דורשת את שני הכיוונים: `contents: read` קיים,
   * ושום הרשאת כתיבה לא הצטרפה אליו.
   */
  it("קריאה לקוד בלבד — ולא הרשאה אחת מעבר לזה", () => {
    const block = /^permissions:\n((?: {2}\S.*\n)+)/m.exec(workflow);
    if (block === null) throw new Error("אין בלוק permissions ב-workflow");
    const granted = (block[1] ?? "")
      .trim()
      .split("\n")
      .map((line) => line.trim());
    expect(granted).toEqual(["contents: read"]);
  });

  it("אין סוד של המסד בקובץ הזה", () => {
    for (const forbidden of ["TEAM1_CONTENT_URL", "CI_CONTENT_URL", "SUPABASE_ACCESS_TOKEN"]) {
      expect(workflow).not.toContain(forbidden);
    }
  });
});

describe("workflow הכתיבה — אותו דפוס, אותה אכיפה", () => {
  /**
   * ⚠️ **הדפוס נאכף פעמיים ולא נכתב פעמיים.** הכלל אחד — credential
   * בשלב CI נפרד ולא בסוכן — ולכן שני ה-workflows נבדקים באותן
   * דרישות. workflow שלישי שייכתב בלי בדיקה כזו יעבור בשקט; זה
   * מה שהבדיקה הזו לא פותרת, והוא רשום ב-#26.
   */
  it("TEAM1_CONTENT_URL בשלב אחד בלבד", () => {
    expect(stepsWithSecret(publishWorkflow, "TEAM1_CONTENT_URL")).toEqual([
      "כתיבה למסד בתפקיד team1_content",
    ]);
  });

  it("אין env ברמת job", () => {
    expect(publishWorkflow).not.toMatch(/^ {4}env:/m);
  });

  it("קריאה לקוד בלבד", () => {
    const block = /^permissions:\n((?: {2}\S.*\n)+)/m.exec(publishWorkflow);
    if (block === null) throw new Error("אין בלוק permissions");
    expect((block[1] ?? "").trim().split("\n").map((l) => l.trim())).toEqual([
      "contents: read",
    ]);
  });

  /**
   * 🔴 **שער ה-QA לפני הכתיבה ולא אחריה.** כתיבה שרצה לפני הבדיקות
   * אינה ניתנת לביטול — היא כבר במסד.
   */
  it("שער ה-QA קודם לכתיבה", () => {
    const qa = publishWorkflow.indexOf("npm run qa");
    const write = publishWorkflow.indexOf("team1-write.sh");
    expect(qa).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(qa).toBeLessThan(write);
  });
});

describe("workflow הערות הבודק — אותו דפוס", () => {
  it("CI_VERIFY_URL בשלב אחד בלבד", () => {
    expect(stepsWithSecret(notesWorkflow, "CI_VERIFY_URL")).toEqual(["שליפת ההערות"]);
  });

  it("אין env ברמת job", () => {
    expect(notesWorkflow).not.toMatch(/^ {4}env:/m);
  });

  it("קריאה לקוד בלבד", () => {
    const block = /^permissions:\n((?: {2}\S.*\n)+)/m.exec(notesWorkflow);
    if (block === null) throw new Error("אין בלוק permissions");
    expect((block[1] ?? "").trim().split("\n").map((l) => l.trim())).toEqual([
      "contents: read",
    ]);
  });

  /**
   * ⚠️ **ההערות אינן נכנסות לריפו.** הן טקסט חופשי של בודקת, חומר
   * עבודה ולא תוכן — ו-commit היה נותן להן היסטוריית גרסאות שאיש לא
   * צריך, בריפו שנקרא בידי כל מי שיש לו גישה.
   */
  it("ארטיפקט ולא commit", () => {
    expect(notesWorkflow.includes("upload-artifact")).toBe(true);
    expect(notesWorkflow).not.toMatch(/git (add|commit|push)/);
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
      const front = readFileSync(join(AGENTS, `${agent}.md`), "utf8").split("---")[1] ?? "";
      const tools = /^tools:\s*(.+)$/m.exec(front);
      if (tools === null) {
        throw new Error(`ל-${agent} אין שורת tools — ברירת המחדל היא כל הכלים`);
      }
      const list = (tools[1] ?? "").split(",").map((t) => t.trim());
      expect(list).not.toContain("Bash");
      expect(list).not.toContain("WebFetch");
      expect(list.length).toBeGreaterThan(0);
    });
  }
});
