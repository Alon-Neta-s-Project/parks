import { failWith, type Fail } from "./http";
import { DEFAULT_MODEL } from "./config";
import { thinkingConfig } from "./config";
import { allowedOrigins } from "./http";
import { FIT_STAMP } from "./prompt";
import { DEPLOY_STAMP } from "./stamp";

export function diagnose(env: Record<string, string | undefined>) {
  const watched = [
    "GEMINI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_DB_URL",
    "ALLOWED_ORIGIN",
    "GEMINI_MODEL",
    "GEMINI_THINKING_BUDGET",
    "GEMINI_THINKING_LEVEL",
  ];
  const known: Record<string, string> = {};
  for (const name of watched) {
    const v = env[name];
    known[name] = typeof v === "string" && v !== ""
      ? `קיים · ${v.trim().length} תווים`
      : "חסר";
  }
  // גם כל שם אחר שהוזרק ושאיני מכיר — שמות בלבד.
  const others = Object.keys(env).filter((k) => !watched.includes(k)).sort();
  // ⚠️ מה שבאמת נשלח, ולא מה שהוגדר. אלה שתי שאלות שונות: סוד שלא הגיע
  // לפונקציה וסוד שהגיע והמודל התעלם ממנו נראים זהים מבחוץ, ורק זה
  // מפריד ביניהם.
  // 🔴 **החותם, וזו התשובה ל"איך אדע שזה קרה בכל דיפלוי".**
  //
  // הפונקציה הזו נדבקת ידנית בסופהבייס. בדיקה בזמן בנייה מאמתת את הרפו
  // ולא את מה שחי — והפער בין השניים הוא בדיוק הסיכון: הדבקה של קובץ
  // ישן נראית בדיוק כמו הדבקה של חדש.
  //
  // ⚠️ החותם נגזר מהניסוח עצמו, ולכן הוא **משתנה כשהניסוח משתנה**.
  // השוואה בין מה שחוזר מכאן לבין מה שהבנייה מדפיסה עונה על השאלה
  // בלי לנחש.
  return {
    known,
    other_names: others,
    sent_to_model: thinkingConfig(env),
    // 🔴 **"קיים · 32 תווים" אינו אומר שהוא תופס.** `https://x/` קיים
    // ובאורך תקין, ומנורמל לרשימה של אחד שאף דפדפן לא יתאים לו; `/`
    // לבדו מתנרמל ל**ריק**, כלומר `*` — פתוח לכול, ונראה מוגדר.
    // המספר הזה הוא ההבדל בין השניים, והוא נבדק מהסביבה החיה.
    allowed_origins: allowedOrigins(env).length,
    fit_stamp: FIT_STAMP,
    // ⚠️ **זה החותם שעונה על "האם מה שחי הוא מה שברפו".** `fit_stamp`
    // עונה רק על "האם בלוק הניסוח נבנה מחדש", וב-25.09 הוא אמר "זהה"
    // על פונקציה ישנה.
    deploy_stamp: DEPLOY_STAMP,
  };
}

// {"diagnose":"models"} — שואל את גוגל אילו מודלים זמינים למפתח הזה.
// שמות מודלים אינם סוד, והמפתח אינו חוזר בתשובה.
export async function listModels(env: Record<string, string | undefined>): Promise<Fail | { current: string; usable: string[] }> {
  const k = env.GEMINI_API_KEY;
  if (!k) return failWith(500, { error: "missing_api_key" });
  let r: Response;
  try {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": k },
    });
  } catch {
    return failWith(502, { error: "upstream_unreachable" });
  }
  if (!r.ok) return failWith(502, { error: "upstream_error", status: r.status });
  const list = await r.json().catch(() => null);
  const usable = (list?.models ?? [])
    .filter((m: { supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes("generateContent"))
    .map((m: { name: string }) => m.name.replace(/^models\//, ""));
  return { current: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL, usable };
}
