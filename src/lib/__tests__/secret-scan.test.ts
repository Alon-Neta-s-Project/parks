import { execFileSync } from "node:child_process";
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

const SCANNER = join(__dirname, "..", "..", "..", "scripts", "check-secrets.py");

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
const LOOKS_REAL: [string, string][] = [
  ["מפתח גוגל", "AIzaSyDmFakeGoogleKey1234567890abcdefghij"],
  ["JWT", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x"],
  [
    "מחרוזת חיבור",
    "postgresql://team1_content:R3allyL0ngPassw0rd@db.abcdef.supabase.co:5432/postgres",
  ],
  ["טוקן GitHub", "ghp_aB3dEfGh1jKlMn0pQrStUvWxYz123456789"],
  [
    "טוקן GitHub חדש",
    "github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  ],
  ["מפתח Apify", "apify_api_aB3dEfGh1jKlMn0pQrStUvWxYz1234567"],
  ["מפתח פרטי", "-----BEGIN RSA PRIVATE KEY-----"],
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
