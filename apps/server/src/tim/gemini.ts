import { thinkingConfig } from "./config";
import { failWith, type Fail } from "./http";
import type { Turn } from "./understand";
/**
 * `*` נכון כל עוד אין דומיין. ברגע שיהיה — להגדיר את הסוד ALLOWED_ORIGIN
 * לדומיין שלנו, וזה מצטמצם מעצמו בלי שינוי קוד. מקור שאינו תואם לא מקבל
 * כותרת CORS כלל, והדפדפן חוסם אותו.
 */
/**
 * הסיבה שגוגל נתנה, בלי מה ששלחנו אליה.
 *
 * ⚠️ מחרוזות ארוכות שנראות כמו מפתח נמחקות לפני ההחזרה. הן אינן אמורות
 * להופיע בהודעת שגיאה, אבל "אמור" אינו אכיפה, וזו הודעה שנוסעת לדפדפן.
 */
export async function upstreamReason(res: Response): Promise<string | null> {
  const body = await res.text().catch(() => "");
  let message: unknown = null;
  try {
    message = JSON.parse(body)?.error?.message;
  } catch { /* גוף שאינו JSON — אין ממה לגזור סיבה */ }
  if (typeof message !== "string" || !message) return null;
  return message
    .replace(/AIza[\w-]{10,}/g, "‹מפתח›")
    .replace(/[A-Za-z0-9_-]{40,}/g, "‹מוסתר›")
    .slice(0, 300);
}

/**
 * תקציב החשיבה — הידית היקרה ביותר שיש לנו, וזה נמדד ולא הוערך.
 *
 * במדידה אמיתית: קלט 275 · תשובה 154 · **חשיבה 505**. אסימוני חשיבה
 * מחויבים כפלט, כלומר הם היו **72% מעלות ההודעה** — פי שלושה מהתשובה
 * עצמה, בשביל לומר "אין לי עדיין נתונים". לשם השוואה: מעבר ל-3.6
 * חוסך 16%, וקאשינג של כל הקלט חוסך 5%.
 *
 * ⚠️ **opt-in בכוונה.** בלי הסוד נשלח בדיוק מה שנשלח היום, כלומר
 * ההתנהגות שכבר עובדת אינה משתנה מעצם הפריסה. השדה אינו מתועד אחיד
 * בין דורות המודלים, וסיכון של 400 על שדה לא מוכר אינו סיכון שלוקחים
 * בשקט על נתיב שעובד. מגדירים סוד, מודדים, ואם נשבר — מוחקים אותו
 * וחוזרים אחורה בלי לגעת בקוד.
 *
 * ערך לא-מספרי מתעלמים ממנו במקום לשלוח אותו: סוד עם שגיאת הקלדה
 * שמפיל את טים לגמרי הוא מחיר גבוה מדי על ידית אופציונלית.
 */
/**
 * 503 ו-429 מגוגל הם זמניים בהגדרה — "עמוס", לא "שגוי". ניסיון חוזר
 * אחד עם המתנה קצרה פותר את רובם.
 *
 * ⚠️ אחד בלבד, ובכוונה: אנחנו כבר בתוך נקודת קצה מוגבלת-קצב, וההמתנה
 * היא זמן שהמשתמש מחכה מול מסך. עדיף להחזיר שגיאה מפורשת מלנסות שוב
 * ושוב ולהיראות תקוע.
 */
const transient = (code: number) => code === 503 || code === 429 || code >= 500;

export async function askGemini(p: {
  key: string; model: string; env: Record<string, string | undefined>; system: string; history: Turn[]; userText: string;
}): Promise<Fail | { data: any }> {
  const thinking = thinkingConfig(p.env);
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`;
  let res: Response;
  const call = () =>
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": p.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: p.system }] },
        // ⚠️ הקטעים לפני השאלה. מודל שמקבל קודם שאלה ואז מקור נוטה לענות
        // מתוך מה שהוא כבר "יודע" ולהשתמש במקור כאישור; הסדר ההפוך מייצר
        // תשובה שנשענת על המקור.
        // ⚠️ ההיסטוריה לפני ההקשר והשאלה, וכתורות אמיתיות ולא כטקסט
        // מודבק. מודל שמקבל שיחה כפסקה אחת מתייחס אליה כציטוט; תורות
        // נפרדות הן מה שגורם לו לזכור מה כבר נשאל.
        contents: [
          ...p.history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          { role: "user", parts: [{ text: p.userText }] },
        ],
        generationConfig: {
          temperature: 0.3,
          // ⚠️ 2048 ולא פחות. אסימוני החשיבה נספרים לתוך התקציב הזה,
          // ובמדידה אמיתית הם היו 505 מול תשובה של 154. הצעתי קודם
          // להוריד ל-1000 — זה היה מקצץ את התשובה באמצע ומחזיר
          // MAX_TOKENS ריק, כלומר שובר במקום לחסוך. הידית הנכונה היא
          // תקציב החשיבה למטה, לא הגג.
          maxOutputTokens: 2048,
          ...thinking,
        },
      }),
    });

  try {
    res = await call();
    if (transient(res.status)) {
      await new Promise((r) => setTimeout(r, 700));
      res = await call();
    }
  } catch {
    return failWith(502, { error: "upstream_unreachable" });
  }

  if (!res.ok) {
  // גוף התשובה של גוגל עלול לשקף בחזרה חלקים מהבקשה, ולכן לא הוחזר
  // כלל — אבל "400" בלי סיבה אינו ניתן לאבחון, וזו הייתה נפילה שקטה
  // בפני עצמה: העברנו סבב שלם בלי לדעת איזה שדה נדחה.
  //
  // מוחזר **רק** error.message מהמבנה של גוגל — משפט על הבקשה, לא
  // תוכן שלה — חתוך ל-300 תווים, ואחרי סינון של כל מה שנראה כמו
  // מפתח. אם המבנה אינו כצפוי, לא מוחזר דבר.
    return failWith(502, {
      error: "upstream_error",
      status: res.status,
      model: p.model,
      upstream_detail: await upstreamReason(res),
      hint: res.status === 404
        ? `גוגל אינה מכירה את המודל "${p.model}". לשלוח {"diagnose":"models"} כדי לראות מה זמין למפתח הזה, ואז להגדיר סוד GEMINI_MODEL עם שם מהרשימה.`
        : transient(res.status)
        ? `גוגל עמוסה כרגע עבור "${p.model}" — זו תקלה זמנית ולא שגיאה בהגדרה. כבר ניסינו פעמיים. אם זה חוזר, להגדיר סוד GEMINI_MODEL עם דגם מיושב יותר, למשל gemini-2.5-flash.`
        : undefined,
    });
  }
  return { data: await res.json().catch(() => null) };
}

// מודלים חדשים מחזירים כמה חלקים, וחלקם אינם טקסט (למשל "מחשבה").
// לקיחת parts[0] בלבד החזירה ריק על תשובה תקינה לחלוטין.
export function readAnswer(data: any): { raw: string; finishReason: string | null; candidates: number } {
  const candidate = data?.candidates?.[0];
  const raw = (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part?.text)
    .filter((t: unknown): t is string => typeof t === "string" && t !== "")
    .join("\n")
    .trim();
  return {
    raw,
    finishReason: candidate?.finishReason ?? null,
    candidates: Array.isArray(data?.candidates) ? data.candidates.length : 0,
  };
}

// ── מדידה, כדי להפסיק לנחש ────────────────────────────────────────
//
// עלות ההודעה, יחס קלט/פלט, וכמה מהקלט הגיע מקאש — כל אלה היו עד כה
// הערכה שלי מתוך שתי מחרוזות שמדדתי. גוגל מחזירה את המספרים האמיתיים
// ב-usageMetadata, וההערכה עלתה לנו כבר פעם אחת בפי עשרים.
//
// ⚠️ **עודכן 10.09: נשמר במסד, ובאישור גיא.** ההערה כאן אמרה קודם
// "לא נשמר", והנימוק היה נכון: לוג שימוש לכל שיחה הוא מסלול קצר
// לדליפת תוכן.
//
// מה שהשתנה הוא **המבנה, לא הרצון**. ב-044 נשמרות ספירות בלבד; טקסט
// השאלה נשמר רק כשטים לא ידע לענות, ואין מזהה שיחה כלל. כלומר אין
// דרך לקשר ספירה לתוכן או לאדם — וזה מה שהפך את זה למותר.
//
// ⚠️ ולעולם לא מוצג למבקרת.
export function readUsage(data: any) {
  const u = data?.usageMetadata;
  return u && typeof u === "object"
    ? {
      input: u.promptTokenCount ?? null,
      output: u.candidatesTokenCount ?? null,
      // הפלט מחויב כולל אסימוני חשיבה, ולכן הם נספרים בנפרד ולא נבלעים.
      thinking: u.thoughtsTokenCount ?? 0,
      // 0 או null פירושו שהקאש לא נגע. זה מה שמכריע אם קאשינג הקשר שווה
      // משהו כאן, במקום להסיק את זה מטבלת מחירים.
      cached_input: u.cachedContentTokenCount ?? 0,
    }
    : null;
}
