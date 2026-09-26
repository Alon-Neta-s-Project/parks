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
