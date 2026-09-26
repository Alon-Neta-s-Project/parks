import { RETRY_AFTER_MINUTES } from "./config";
import { failWith, type Fail } from "./http";
/** מזהה יציב לדלי ההגבלה, בלי לאחסן כתובת IP. */
export async function bucketKey(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Db = { url: string; dbKey: string };

// ── הגבלת קצב ────────────────────────────────────────────────────────
//
// ⚠️ נכשלת **סגור**. אם אי אפשר לספור — אין קריאה למודל.
//
// הגרסה הראשונה דילגה על ההגבלה כשמשתני הסביבה חסרו, והמשיכה למודל.
// כלומר: תקלה בהגדרה הייתה הופכת את נקודת הקצה לפתוחה לגמרי, בשקט,
// בדיוק במצב שבו אימות הטוקן כבוי. עדיף שגיאה שרואים מנקודת קצה פתוחה
// שאיש לא יודע עליה — זה אותו כלל של "אין נפילה שקטה" ב-CLAUDE.md.
// ⚠️ מפתח anon ולא service_role, ובכוונה. PostgREST החזיר 403 ולא 401 —
// כלומר המפתח כן התקבל, והתפקיד שהוא נפתר אליו אינו service_role.
// check_rate_limit היא security definer ומוענקת ל-anon, ולכן היא עובדת
// ללא תלות בתפקיד. הטבלה עצמה נשארת סגורה לחלוטין.
export function dbAccess(env: Record<string, string | undefined>): Db | Fail {
  const url = env.SUPABASE_URL;
  const dbKey = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY
    ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !dbKey) {
    return failWith(500, {
      error: "rate_limit_unavailable",
      detail: "SUPABASE_URL או מפתח גישה למסד חסרים, ולכן אי אפשר לאכוף גג קריאות",
    });
  }
  return { url, dbKey };
}

/** 'ok' → null (ממשיכים). כל דבר אחר → התשובה שעוצרת. */
export async function checkRateLimit({ url, dbKey }: Db, ip: string, salt: string | undefined): Promise<Fail | null> {
  const bucket = await bucketKey(ip, salt ?? dbKey.slice(0, 16));
  const auth = {
    apikey: dbKey,
    Authorization: `Bearer ${dbKey}`,
    "Content-Type": "application/json",
  };

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      headers: auth,
      // ⚠️ דלי בלבד. כל ערך נוסף כאן הוא גג שהקוראת בוחרת לעצמה.
      body: JSON.stringify({ p_bucket: bucket }),
    });
  } catch {
    return failWith(500, { error: "rate_limit_unavailable", detail: "המסד לא נענה" });
  }

  if (!res.ok) {
    return failWith(500, {
      error: "rate_limit_unavailable",
      detail: `check_rate_limit החזירה ${res.status}. אם 404 — לא הורצה מיגרציה 026 (החתימה השתנתה לארגומנט אחד).`,
    });
  }

  // מיגרציה 021 החליפה את הבוליאני בטקסט: 'ok' | 'user' | 'global'.
  // כל דבר אחר פירושו שלא הבנו את התשובה, וזה כישלון — לא היתר.
  // ⚠️ בוליאני נחשב כאן **לא מובן**, ובכוונה: מסד שעדיין על 020 יחזיר
  // true, ו-true שמתפרש כ"מותר" הוא בדיוק גדר שנעלמה בלי שאיש ראה.
  const verdict = await res.json().catch(() => null);
  if (verdict !== "ok" && verdict !== "user" && verdict !== "global") {
    return failWith(500, {
      error: "rate_limit_unavailable",
      detail: typeof verdict === "boolean"
        ? "check_rate_limit החזירה בוליאני — לא הורצה מיגרציה 021"
        : "תשובה לא צפויה מ-check_rate_limit",
    });
  }
  // ⚠️ שני הגדרות אינם אותה הודעה. "נסי בעוד שעה" כשהמכסה היומית
  // נגמרה הוא שקר שהמבקרת תגלה רק אחרי שעה של המתנה.
  if (verdict === "user") {
    return failWith(429, { error: "rate_limited", scope: "user", retry_after_minutes: RETRY_AFTER_MINUTES });
  }
  if (verdict === "global") {
    return failWith(429, { error: "rate_limited", scope: "global", retry_after_minutes: 60 * 24 });
  }
  return null;
}
