import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🔴 **הסורק עצמו צריך בדיקה — וזה בדיוק הלקח של #26.**
 *
 * שלוש פעמים בפרויקט הזה גלאי שנכתב כאן הוא מה שנשבר, ובכל פעם הוא
 * הכריז בביטחון על מצב שמעולם לא ראה. סורק סודות שמפסיק לתפוס תבנית
 * הוא המקרה הגרוע מכולם: הוא נכשל **לכיוון השקט** — מחזיר ✅, ואיש
 * אינו חוקר הצלחה.
 *
 * לכן כל תבנית נבדקת בשני הכיוונים: שהיא תופסת מפתח שנראה אמיתי,
 * ושהיא **אינה** צועקת על פלייסהולדר. בדיקה שצועקת על הכול שווה
 * בדיקה שאיש לא קורא.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCANNER = join(ROOT, "scripts", "check-secrets.py");
const HOOK = join(ROOT, "scripts", "hook-scan-issue.py");

/** מריץ את הסורק על טקסט. true = נקי, false = נמצא סוד. */
function clean(text: string): boolean {
  try {
    execFileSync("python3", [SCANNER, "--text"], { input: text, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * ⚠️ **המפתחות האלה מזויפים, והם חייבים להיראות אמיתיים.** מפתח דמה
 * שאינו בצורה הנכונה בודק את הבדיקה ולא את הסורק.
 */
/**
 * 🔴 **המחרוזות מורכבות בזמן ריצה, ובכוונה.**
 *
 * הן מזויפות — אבל הן חייבות להיראות אמיתיות, אחרת הן בודקות את
 * הבדיקה ולא את הסורק. וברגע שהן נכתבות כמחרוזת שלמה בקובץ, **הסורק
 * תופס את קובץ הבדיקה של עצמו** ושער ה-QA נופל על כל דחיפה.
 *
 * זה קרה בפועל (22.09), והוא לא התגלה מוקדם יותר כי הקובץ עדיין לא
 * היה במעקב git — והסורק סורק את מה שבמעקב.
 *
 * ⚠️ **וזו אינה התחמקות מהסורק.** הפיצול חל על הייצוג בקובץ בלבד;
 * מה שנשלח לסורק בזמן הריצה הוא המחרוזת המלאה, בדיוק כפי שהיא
 * תיראה בסוד אמיתי. אילו הפיצול היה מרכך את הבדיקה — היא הייתה
 * עוברת גם בלי התבנית, ואימתנו שלא.
 */
const LOOKS_REAL: [string, string][] = [
  ["מפתח גוגל", "AIza" + "SyDmFakeGoogleKey1234567890abcdefghij"],
  ["JWT", "eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x"],
  [
    "מחרוזת חיבור",
    "postgresql://team1_content:" + "R3allyL0ngPassw0rd" + "@db.abcdef.supabase.co:5432/postgres",
  ],
  ["טוקן GitHub", "ghp" + "_aB3dEfGh1jKlMn0pQrStUvWxYz123456789"],
  [
    "טוקן GitHub חדש",
    "github" + "_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  ],
  ["מפתח Apify", "apify" + "_api_aB3dEfGh1jKlMn0pQrStUvWxYz1234567"],
  ["מפתח פרטי", "-----BEGIN " + "RSA PRIVATE KEY-----"],
];

describe("סורק הסודות — תופס", () => {
  for (const [label, secret] of LOOKS_REAL) {
    it(label, () => {
      expect(clean(secret), `${label} עבר את הסורק`).toBe(false);
    });
  }

  it("גם כשהוא קבור בתוך טקסט ארוך", () => {
    const body = `## מה נמצא\n\nשורה רגילה לגמרי.\n\n    ${LOOKS_REAL[3]?.[1]}\n\nועוד שורה.`;
    expect(clean(body)).toBe(false);
  });
});

describe("סורק הסודות — שותק על מה שאינו סוד", () => {
  /**
   * ⚠️ אלה הערכים שבאמת יושבים בקובצי ה-deploy שלנו. אם הסורק יצעק
   * עליהם, שער ה-QA ייפול על כל דחיפה — והצעד הבא של מי שממהר הוא
   * לכבות אותו.
   */
  for (const [label, text] of [
    ["פלייסהולדר סיסמה", "YOUR-TEAM1-PASSWORD-HERE"],
    [
      "מחרוזת חיבור עם פלייסהולדר",
      "postgresql://team1_content:YOUR-TEAM1-PASSWORD-HERE@db.example.supabase.co:5432/postgres",
    ],
    ["טוקן אפסים", "apify_api_0000000000000000000000000000000000"],
    ["שם התפקיד service_role", "grant execute on function x to service_role;"],
    ["טקסט עברי רגיל", "הכתיבה נעצרת ומדווחת, במקום לדרוס בשקט."],
  ] as [string, string][]) {
    it(label, () => {
      expect(clean(text), `${label} הפיל את הסורק`).toBe(true);
    });
  }
});

/**
 * 🔴 **ה-hook הוא ההבדל בין "כלי שצריך להריץ" ל"מנגנון שרץ"** —
 * דרישת גיא, חסם #3.
 *
 * ⚠️ **ומה שהוא לא:** הוא חל על סשנים שטוענים את
 * `.claude/settings.json` של הרפו. כתיבה מממשק הווב של GitHub, או
 * מסוכן בהגדרות אחרות, אינה עוברת דרכו. הוא מצמצם את הפער — לא סוגר.
 */
function hookExit(payload: string): number {
  try {
    execFileSync("python3", [HOOK], { input: payload, stdio: "pipe" });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
}

describe("hook הכתיבה ל-Issue", () => {
  it("חוסם סוד בגוף ההודעה", () => {
    const body = JSON.stringify({
      tool_input: { body: "הנה הטוקן: " + LOOKS_REAL[3]?.[1] },
    });
    expect(hookExit(body)).toBe(2);
  });

  it("חוסם גם כשהסוד בכותרת ולא בגוף", () => {
    const body = JSON.stringify({
      tool_input: { title: LOOKS_REAL[5]?.[1], body: "נקי" },
    });
    expect(hookExit(body)).toBe(2);
  });

  it("מעביר טקסט נקי", () => {
    const body = JSON.stringify({
      tool_input: { body: "שורה רגילה, עם YOUR-TEAM1-PASSWORD-HERE" },
    });
    expect(hookExit(body)).toBe(0);
  });

  /**
   * ⚠️ hook ששותק על קלט שבור הוא hook שאפשר לעקוף בקלט שבור.
   */
  it("חוסם קלט שאי אפשר לפענח", () => {
    expect(hookExit("not json")).toBe(2);
  });

  it("ה-hook רשום ב-.claude/settings.json על כלי הכתיבה ל-Issues", () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, ".claude", "settings.json"), "utf8")) as {
      hooks?: { PreToolUse?: { matcher?: string; hooks?: { command?: string }[] }[] };
    };
    const entries = cfg.hooks?.PreToolUse ?? [];
    const matching = entries.filter((e) => (e.matcher ?? "").includes("issue"));
    expect(matching.length, "אין PreToolUse על כלי ה-Issues").toBeGreaterThan(0);
    for (const tool of ["mcp__github__add_issue_comment", "mcp__github__issue_write"]) {
      expect(
        matching.some((e) => (e.matcher ?? "").includes(tool)),
        `${tool} אינו מכוסה`,
      ).toBe(true);
    }
    expect(
      matching.some((e) => (e.hooks ?? []).some((h) => (h.command ?? "").includes("hook-scan-issue"))),
    ).toBe(true);
  });
});
