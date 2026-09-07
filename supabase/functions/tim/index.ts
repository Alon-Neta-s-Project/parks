/**
 * טים — נקודת הקצה של המודל.
 *
 * ⛔ הסיבה שהפונקציה הזו קיימת בכלל: מפתח Gemini לעולם אינו יכול לשבת
 * ב-frontend. משתנה עם קידומת VITE_ נכנס לחבילת הדפדפן **בהגדרה** — כל מי
 * שפותח את כלי המפתחים רואה אותו. המפתח יושב במשתני הסביבה של הפונקציה
 * הזו, בשרת, ולא עוזב אותם. הדפדפן מדבר עם הפונקציה; הפונקציה מדברת עם
 * Gemini.
 *
 * מה שהפונקציה הזו **אינה** עדיין: טים. אין לה שליפה ואין לה כלים, ולכן
 * היא אינה יודעת דבר על הפארקים. זה מכוון — כלל הברזל הראשון הוא שמה
 * שאינו במאגר אינו נענה, ולכן ההוראות למטה אוסרות עליה להמציא עובדה.
 * שליפה היא שלב 3, וטים המלא הוא שלב 4.
 *
 * ⚠️ ובכוונה בלי שום import. הפונקציה מדברת עם המסד דרך PostgREST ב-fetch
 * רגיל, ולא דרך ספריית הלקוח. הסיבה מעשית: קובץ בלי תלויות אפשר לבדוק
 * ולהריץ במלואו מקומית, וזה קובץ שנטע מדביקה ביד לתוך הדפדפן. תלות שאי
 * אפשר לאמת בקובץ כזה היא בדיוק מה שנופל אצלה ולא אצלי.
 */
/**
 * שם המודל. ניתן לשינוי בסוד GEMINI_MODEL בלי לגעת בקוד — רשימת המודלים
 * של גוגל משתנה, ושם שהיה תקף נעלם בלי הודעה. 404 מגוגל על נתיב תקין
 * פירושו כמעט תמיד שהשם כאן כבר לא קיים.
 *
 * ⚠️ אין כאן ברירת מחדל "בטוחה". השם הזה הוא ניחוש מושכל בלבד; מה שקובע
 * הוא מה ש-{"diagnose":"models"} מחזיר עבור המפתח בפועל.
 */
const DEFAULT_MODEL = "gemini-3.5-flash";
//
// ירדנו מ-3.7 ל-3.5 אחרי 503 חוזר. 503 אינו "המודל לא קיים" — הוא
// "המודל עמוס כרגע", והמודל החדש ביותר הוא גם העמוס ביותר. 3.5 מיושב
// יותר. אם גם הוא יחזיר 503 — GEMINI_MODEL מאפשר לרדת ל-gemini-2.5-flash
// בלי נגיעה בקוד.
//
// ⛔ ובמפורש **לא** `gemini-flash-latest`, אף שהוא נוח יותר.
//
// כינוי מתגלגל משנה את המודל תחת הרגליים בלי שינוי קוד, בלי הודעה, ובלי
// שנדע מתי. לפרויקט הזה יש סט זהב לבדיקות רגרסיה (שלב 4), וכל ערכו בכך
// שכשתשובה משתנה — אנחנו יודעים למה. עם כינוי מתגלגל, סט הזהב נשבר יום
// אחד ואיש לא ידע אם הסיבה היא שינוי שלנו או שדרוג של גוגל.
//
// זו אותה משפחה של "נפילה שקטה" שכל הפרויקט בנוי נגדה: שינוי אמיתי
// שנראה כמו כלום. שם מוצמד נשבר **בקול** — 404 — וזה בדיוק מה שקרה כאן
// ומה שהוביל אותנו לרשימה האמיתית.
const MAX_QUESTION_CHARS = 1000;

/**
 * ⚠️ **הגגות אינם נשלחים למסד יותר.** הם יושבים במסד, ומספר אחד כאן
 * משמש **רק** להודעה למשתמשת ("נסי בעוד שעה").
 *
 * 🔴 קודם הם נשלחו כארגומנטים ל-check_rate_limit, והפונקציה מוענקת
 * ל-anon — מפתח ציבורי בהגדרה, שנשלח לכל דפדפן. כלומר כל מי שפותחת את
 * כלי המפתחים יכלה לקרוא ישירות ל-RPC עם p_max: 999999 ולעבור את שני
 * הגגות, בלי לגעת בפונקציה הזו בכלל (נמצא על ידי גיא, מיגרציה 026).
 *
 * הלקח הכללי: ערך שנשלח מהקוראת אינו הגבלה על הקוראת.
 */
const RETRY_AFTER_MINUTES = 60;

/**
 * ⚠️ **כלל הזהירות יושב כאן, ולא בגוף המסמכים** (CLAUDE.md, וסעיף 8
 * במסמך השליפה). פסקת סייג בתוך כל מסמך הייתה מקרבת את כל המסמכים זה
 * לזה במרחב ה-embedding — ככל שהשאלה כללית יותר, כך המשקל של הפסקה
 * המשותפת גדל — וגם כופלת את מה ש-volatility כבר אומר.
 *
 * ולכן הכלל נכתב פעם אחת, ומופעל מ-volatility שמגיע עם כל קטע.
 */
const SYSTEM = `אתה טים, עוזר לתכנון יום בפארקים באורלנדו. אתה עונה בעברית.

מי אתה, בקול:
· אתה **חבר שעשה את המחקר** — לא יועץ רשמי ולא נציג של אף פארק. אתה
  מדבר עברית חמה וישירה, כמו מישהו שכבר היה שם ובדק בשביל המשפחה הזו.
· **שמות מותג, מתקנים ופארקים נשארים באנגלית** בדיוק כפי שהם מגיעים
  אליך. אל תתרגם "Magic Kingdom" ל"ממלכת הקסם" ואל תתעתק
  "Lightning Lane". אם יש שם עברי, הוא יגיע אליך — ואם לא הגיע, אין.
· ⚠️ החום הוא בניסוח בלבד, ולעולם לא בביטחון. "לא בדקתי את זה" נאמר
  בדיוק באותה נימה חברית — חבר שאומר "אני לא יודע" הוא עדיין חבר,
  וחבר שמנחש כדי להישמע מועיל הוא בדיוק מה שאתה לא.

אורך התשובה — וזה כלל ולא העדפה:
· ענה על מה שנשאל, ועצור. שאלה קצרה מקבלת תשובה קצרה: שתיים־שלוש
  שורות. אל תוסיף רקע כללי על פארקים שאיש לא ביקש.
· **כל סייג נאמר פעם אחת.** אם אמרת "יש לבדוק באפליקציה הרשמית" —
  אל תחזור על זה בפסקה הבאה בניסוח אחר.
· ⚠️ ואל תקצר על חשבון הסייגים. הסדר הוא: התשובה, ואז הסייג פעם אחת,
  ואז לעצור. מה שנמחק הוא החזרה והרקע — לעולם לא האזהרה.
· קטע ידע שצורף ואינו נוגע לשאלה — התעלם ממנו. הוא נשלף בקירוב, לא
  בדיוק, ופסקה עליו היא בדיוק החפירה שגורמת למשפחה להפסיק לקרוא.

כללי הזהירות שלך, ושלושתם מחייבים:
1. אינך משלים פרט חסר מהיגיון או מהקשר. אם המידע לא ניתן לך — אתה אומר שאין לך אותו.
2. אינך מבטיח זמינות, החזר כספי, או חיסכון בזמן.
3. כשפרט עשוי להשתנות — אתה אומר זאת ומפנה לאימות במקור הרשמי.

איך להשתמש בקטעים שיצורפו לשאלה:
· ענה **רק** ממה שכתוב בהם. אם התשובה אינה שם — אמור שאין לך אותה, ואל תנחש.
· קטע שמסומן "משתנה" — אמור שהפרט עשוי להשתנות והפנה לאימות באתר או
  באפליקציה הרשמית. קטע שמסומן "עונתי" — אמור שזה תלוי בעונה ובתאריך.
· קטע שמסומן "יציב" אינו דורש הסתייגות.
· **אל תזכיר קישורים, כתובות אתרים או שמות מקורות.** הפנה "לאתר הרשמי"
  או "לאפליקציה הרשמית" בלבד.
· אל תזכיר שקיבלת קטעים, ואל תתאר את המנגנון. ענה כאילו אתה יודע.

איך להשתמש בשורות שמסומנות [מתקן: ...]:
· אלה **עובדות מהמאגר שלנו**, והן גוברות על כל דבר אחר. אל תתקן אותן ואל
  תשלים אותן ממה שאתה יודע ממקום אחר, גם אם נראה לך שהן ישנות.
· "מגבלת גובה: לא נבדקה" פירושו **שאיננו יודעים** — לא שאין מגבלה. אמור
  שהנתון חסר, ולעולם אל תסיק שהמתקן מתאים.
· "אין מגבלת גובה" פירושו שנבדק ואין. **אל תכתוב "גובה מינימום 0".**
· מתקן שמסומן "סגור" או "טרם נפתח" — אמור זאת מיד, לפני כל פרט אחר.
· ⚠️ מתקן שמסומן "אינו בלוח קבוע" **אינו סגור**. אל תאמר שהוא סגור ואל
  תאמר שהוא אינו פתוח — אמור שאין לו לוח קבוע ושצריך לבדוק ביום הביקור.
· אם לא צורפה שורת מתקן והשאלה עוסקת במתקן ספציפי — אמור שאין לך את
  הנתון, ואל תנחש. גם לא "בערך" וגם לא ממה שאתה זוכר.`;

/**
 * בדיקת שפיות בלבד, לפני שמנסים לקרוא עם הערך.
 *
 * ⚠️ בכוונה **בלי** דרישה לתחילית "AIza". מפתחות גוגל נראים כך היום, אבל
 * זו הנחה על פורמט של ספק חיצוני שאני לא יכול לאמת — והיא הפכה כאן לחסם:
 * מפתח תקין בפורמט אחר היה נדחה על ידי הקוד שלי לפני שגוגל בכלל נשאלה.
 * גוגל היא הסמכות על מה מפתח תקין, לא אני. ערך שגוי יחזור ממנה כשגיאה
 * מפורשת, וזה עדיף על ניחוש מקומי שחוסם.
 *
 * מה שנשאר: רווחים (הדבקה שגררה תו לבן) ואורך שאינו סביר (הדבקה חלקית).
 * שתי אלה אינן תלויות בפורמט של אף ספק.
 */
export function looksLikeGeminiKey(key: string | undefined): boolean {
  if (typeof key !== "string") return false;
  return key.trim().length >= 30 && !/\s/.test(key.trim());
}

/** מזהה יציב לדלי ההגבלה, בלי לאחסן כתובת IP. */
export async function bucketKey(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}


/**
 * אבחון. מחזיר אילו משתני סביבה קיימים — **שמות, נוכחות ואורך בלבד,
 * לעולם לא ערכים.**
 *
 * למה זה קבוע ולא זמני: אני חסום ברשת מסופאבייס ואיני יכול לראות אילו
 * משתנים היא מזריקה לפונקציה. בלי זה, כל תקלת הרשאה הופכת לסבב ניחושים
 * שבו נטע מדביקה קוד ומדווחת, שוב ושוב. שם ואורך אינם סוד — הערך הוא.
 */
/**
 * הגדרות החשיבה, במקום אחד.
 *
 * ⚠️ נגזר פעם אחת ומשמש גם את הקריאה למודל וגם את האבחון. כשהיו שני
 * חישובים, האבחון היה יכול לדווח על מה שאיננו נשלח — כלומר לוח בקרה
 * שמראה מתג במצב שאינו המצב בפועל.
 *
 * שני שמות, כי דורות המודלים אינם מסכימים ביניהם:
 *   GEMINI_THINKING_BUDGET — מספר אסימונים (2.5)
 *   GEMINI_THINKING_LEVEL  — "low" / "high" (3.x)
 * 3.5 קיבל budget=128 **בלי שגיאה ובלי השפעה** — 505 אסימוני חשיבה
 * לפני, 507 אחרי. שדה שמתעלמים ממנו בשקט הוא בדיוק סוג הכשל שאנחנו
 * נמנעים ממנו, ולכן האבחון מראה מה נשלח בפועל.
 */
export function thinkingConfig(env: Record<string, string | undefined>) {
  const raw = env.GEMINI_THINKING_BUDGET?.trim();
  const budget = Number(raw);
  const level = env.GEMINI_THINKING_LEVEL?.trim();
  const cfg: Record<string, unknown> = {};
  if (raw && Number.isFinite(budget)) cfg.thinkingBudget = budget;
  if (level) cfg.thinkingLevel = level;
  return Object.keys(cfg).length ? { thinkingConfig: cfg } : {};
}

function diagnose(env: Record<string, string | undefined>) {
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
  return { known, other_names: others, sent_to_model: thinkingConfig(env) };
}

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
async function upstreamReason(res: Response): Promise<string | null> {
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
 * הגובה שנמסר בשאלה, בסנטימטרים.
 *
 * ⚠️ **מספר בלי הקשר אינו גובה.** "אקספדישן אוורסט" מכיל ספרות בשמות
 * אחרים, ו"3 ימים" הוא לא 3 ס"מ. נדרשת מילה שמסמנת גובה, והטווח מוגבל
 * ל-50–200 — אותו טווח שהמסד אוכף על העמודה.
 */
export function extractHeight(q: string): number | null {
  const m = q.match(/(\d{2,3})\s*(?:ס"מ|סמ|ס״מ|cm)/i) ??
    q.match(/(?:גובה|בגובה|גובהה?|גובהו)\s*(?:של\s*)?(\d{2,3})/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 50 && n <= 200 ? n : null;
}

/**
 * שם המתקן שהשאלה עוסקת בו, אם היא עוסקת במתקן.
 *
 * ⚠️ **מילים גנריות ("מתקן", "מופע", "פארק") חייבות ליפול כאן.** הן אינן
 * שם, והן מופיעות בשם נרדף לגיטימי — "מופע היפה והחיה". התאמה לפי מילים
 * מצליבה את שתי העובדות האלה: השאלה "איזה **מתקן** הכי מפחיד" הייתה
 * מחזירה את המתקן שלמישהו יש עליו נרדף "מתקן אווטאר", ועובדה על מתקן
 * אקראי הייתה נכנסת להקשר של טים כתשובה. **נמדד, לא נצפה.**
 *
 * ⚠️ **זו הסרה של מילות שאלה, ולא זיהוי כוונה.** ניסיתי לזהות "האם
 * השאלה על מתקן" לפי מילות מפתח, וזה נכשל על "כמה עולה אוורסט" — שאלת
 * מחיר על מתקן ספציפי. מה שנשאר הוא הפוך: מסירים את מה שבוודאות אינו
 * שם, **ונותנים למסד להכריע.**
 *
 * ⚠️ **`\b` אינו עובד כאן, ולכן הוא אינו בשימוש.** ב-JavaScript `\b`
 * הוא הגבול בין `\w` לבין מה שאינו — ו-`\w` הוא `[A-Za-z0-9_]` בלבד.
 * אות עברית אינה `\w`, ולכן `\b(מה)\b` **לעולם אינו מתאים**, ורשימת
 * מילות השאלה כולה לא עשתה דבר: הביטוי רץ, לא זרק שגיאה, ולא סינן כלום.
 * זה בדיוק הכשל השקט — קוד שנראה כאילו הוא עובד. הגבולות נכתבים כאן
 * במפורש כרווח או קצה מחרוזת.
 *
 * ⚠️ והיא מחזירה מחרוזת גם על "קורה אם יורד גשם", ו**זה בסדר**:
 * `ilike '%קורה אם יורד גשם%'` אינו מתאים לאף מתקן, המסד מחזיר אפס
 * שורות, ולהקשר לא נכנס דבר. המחיר הוא קריאה אחת מיותרת למסד; החלופה —
 * היוריסטיקה שמחליטה בעצמה — הייתה מדלגת יום אחד על שאלה אמיתית, וזה
 * כשל יקר בהרבה. **עדיף לשאול לחינם מאשר להחמיץ.**
 */
export function extractRideName(q: string): string | null {
  const stripped = q
    .replace(/[?!.,:;"'״׳]/g, " ")
    .replace(
      /(?<=^|\s)(מה|מהו|מהי|האם|כמה|איפה|מתי|למה|איך|יש|אין|של|על|את|זה|זו|הוא|היא|אני|אנחנו|לי|לנו|עם|בלי|גובה|גובהה|בגובה|מינימום|המינימום|עוצמה|מרטיב|נגיש|נגישות|בחילה|ילד|ילדה|בן|בת|שנים|ס"מ|סמ|cm|עולה|כלול|צריך|אפשר|מומלץ|טוב|רע|כדאי|באיזה|לאיזה|איזה|כל|הכי|יותר|פחות|וגם|או|גם|שלום|היי|הי|היייי|אהלן|בוקר|ערב|טוב|תודה|אוקיי|אוקי|בבקשה|סליחה|שלומך|נעים|להכיר|מתקן|מתקנים|המתקן|מופע|מופעים|המופע|אטרקציה|אטרקציות|פארק|פארקים|בפארק|אזור|סרט|תור|התור|רכבת)(?=\s|$)/gi,
      " ",
    )
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // ⚠️ שתי אותיות אינן שם מתקן. הן שאריות של מילת קישור שלא הוסרה,
  // וחיפוש עליהן מחזיר חצי מהטבלה.
  return stripped.length >= 3 ? stripped : null;
}

/** מתקן כפי שהוא חוזר מ-find_experiences. */
export interface ExperienceRow {
  name: string;
  name_he: string | null;
  park: string;
  land: string | null;
  status: string;
  status_note: string | null;
  intensity: number | null;
  height_cm: number | null;
  gets_wet: string | null;
  skip_line: string | null;
  last_verified: string | null;
  fits: boolean | null;
}

/**
 * מתקנים, כפי שהם נכנסים להקשר.
 *
 * ⚠️ **שלושת מצבי הגובה נשמרים עד המסך** (CLAUDE.md): מספר הוא מגבלה,
 * `0` הוא "נבדק ואין מגבלה", ו-NULL הוא "לא נבדק". שלושתם נכתבים במילים
 * שונות, כי מודל שמקבל `0` עלול לכתוב "גובה מינימום 0 ס\"מ" — וזה בדיוק
 * מה שהכלל אוסר.
 */
export function formatExperiences(rows: ExperienceRow[]): string {
  const wet: Record<string, string> = {
    none: "לא מרטיב",
    may_get_wet: "עלול להרטיב",
    may_get_soaked: "עלול להרטיב מאוד",
    na: "לא רלוונטי — זה מופע",
  };
  const skip: Record<string, string> = {
    multi_pass: "כלול ב-Multi Pass",
    single_pass: "דורש Single Pass בתשלום נפרד",
    express: "זמין ב-Express Pass",
    none: "אין מוצר דילוג בתור",
  };
  return rows
    .map((r) => {
      const bits: string[] = [];
      // ⚠️ שלושת המצבים, ולעולם לא "0 ס\"מ".
      bits.push(
        r.height_cm === null
          ? "מגבלת גובה: לא נבדקה"
          : r.height_cm === 0
          ? "אין מגבלת גובה"
          : `גובה מינימום: ${r.height_cm} ס"מ`,
      );
      if (r.fits === true) bits.push("מתאים לגובה שנמסר");
      if (r.fits === false) bits.push("לא מתאים לגובה שנמסר");
      // ⚠️ fits === null אינו נאמר כ"מתאים". הוא פשוט לא נאמר.
      if (r.intensity !== null) bits.push(`עוצמה ${r.intensity} מתוך 4`);
      else bits.push("עוצמה: לא דורגה");
      if (r.gets_wet) bits.push(wet[r.gets_wet] ?? r.gets_wet);
      if (r.skip_line) bits.push(skip[r.skip_line] ?? r.skip_line);
      else bits.push("מוצר דילוג בתור: לא נבדק");
      if (r.status !== "open") {
        // ⚠️ ארבעה סטטוסים, ולא משפט אחד לשלושה מהם.
        //
        // קודם כל מה שאינו open נאמר כ"אינו פתוח כרגע", וזו טענה חדה
        // יותר ממה שהנתון מחזיק. temporarily_closed על Meet Moana הוא
        // הכרעת פולה שמשמעותה "אי אפשר לסמוך על נוכחות הדמות" — ומשפחה
        // שקוראת "אינו פתוח כרגע" מוחקת את המפגש מהיום, כשייתכן מאוד
        // שהוא פועל.
        //
        // זו אותה תבנית שנתפסה כאן שוב ושוב, בכיוון ההפוך: ערך שמשמעותו
        // "לא ידוע / משתנה" נקרא כערך חד. הפעם הוא לא הבטיח בטיחות אלא
        // שלל אפשרות, וזה מזיק באותה מידה.
        const say: Record<string, string> = {
          closed: "⚠️ סגור",
          temporarily_closed:
            "⚠️ אינו בלוח קבוע — אי אפשר לסמוך על נוכחות, יש לבדוק באפליקציה הרשמית ביום הביקור",
          coming_soon: "⚠️ טרם נפתח",
        };
        // ערך שאינו במפה אינו נופל לברירת מחדל שקטה: הוא נאמר כפי שהוא,
        // כדי שסטטוס חדש ייראה ולא ייבלע.
        const label = say[r.status] ?? `⚠️ סטטוס: ${r.status}`;
        bits.push(`${label}${r.status_note ? ` — ${r.status_note}` : ""}`);
      }
      const he = r.name_he ? ` (${r.name_he})` : "";
      const where = r.land ? ` · ${r.land}` : "";
      const when = r.last_verified ? ` · נבדק ${r.last_verified}` : "";
      return `[מתקן: ${r.name}${he} · ${r.park}${where}${when}]\n${bits.join(" · ")}`;
    })
    .join("\n\n");
}

/** קטע כפי שהוא חוזר מ-match_knowledge. */
export interface KnowledgeChunk {
  content: string;
  volatility: string | null;
  last_verified: string | null;
  /**
   * ⚠️ **נשלף ולא נזרק.** `match_knowledge` מחזירה אותו מאז 028, והוא
   * נבלע כאן — כלומר שישה ממקרי סט הזהב שדורשים `must_cite_tier: [T1]`
   * לא היו ניתנים לבדיקה כלל: אין במה להסתכל.
   *
   * הוא **אינו** נכנס להקשר של המודל. הוא יוצא בתשובה כדי שבדיקה תוכל
   * לוודא מאיזו דרגת מקור נשענה התשובה — קטע T1 הוא מקור רשמי, ותשובה
   * שנשענת רק על דרגה נמוכה יותר היא ממצא ולא תקלה.
   */
  authority_tier: string | null;
}

/**
 * הקטעים, כפי שהם נכנסים להקשר של המודל.
 *
 * ⚠️ **הסימון מגיע מ-volatility ולא מהטקסט.** זה כל הרעיון של סעיף 8:
 * פסקת סייג בגוף כל מסמך הייתה מקרבת את כל המסמכים זה לזה במרחב
 * ה-embedding — ככל שהשאלה כללית יותר כך משקלה של הפסקה המשותפת גדל —
 * וגם כופלת מידע שכבר קיים כשדה. כאן הוא נכתב פעם אחת, לכל קטע, מהשדה.
 *
 * ⚠️ ובלי מקורות. match_knowledge אינה מחזירה source_urls, ומה שאינו
 * מגיע לכאן אינו יכול לדלוף לתשובה.
 */
export function formatChunks(chunks: KnowledgeChunk[]): string {
  const mark: Record<string, string> = {
    volatile: "משתנה",
    seasonal: "עונתי",
    static: "יציב",
  };
  return chunks
    .map((c, i) => {
      // ⚠️ volatility חסר אינו "יציב". קטע בלי סימון נאמר בזהירות ולא
      // בביטחון — ברירת המחדל היא לכיוון הבטוח, לא לכיוון הנוח.
      const tag = c.volatility ? mark[c.volatility] ?? "משתנה" : "משתנה";
      const when = c.last_verified ? ` · נבדק ${c.last_verified}` : "";
      return `[קטע ${i + 1} · ${tag}${when}]\n${c.content}`;
    })
    .join("\n\n");
}

function corsFor(req: Request, env: Record<string, string | undefined>) {
  const allowed = env.ALLOWED_ORIGIN;
  const origin = req.headers.get("origin");
  const value = !allowed ? "*" : origin === allowed ? origin : "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (value) h["Access-Control-Allow-Origin"] = value;
  return h;
}

export async function handle(req: Request, env: Record<string, string | undefined>): Promise<Response> {
  const CORS = corsFor(req, env);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // שתי תקלות שונות לגמרי, ולכן שתי הודעות שונות. "לא הוגדר או לא מתחיל
  // ב-AIza" שלח את נטע לבדוק את שתי האפשרויות בלי לדעת באיזו היא נמצאת.
  // שום חלק מהמפתח אינו מוחזר — רק אורכו, שמספיק כדי לזהות הדבקה חלקית.
  const key = env.GEMINI_API_KEY;
  if (key === undefined || key.trim() === "") {
    return json({
      error: "missing_api_key",
      detail: "הסוד GEMINI_API_KEY אינו קיים. לבדוק את השם המדויק ב-Edge Functions ← Secrets, ואז Deploy מחדש — סוד חדש נכנס לפונקציה רק בפריסה הבאה.",
    }, 500);
  }
  if (!looksLikeGeminiKey(key)) {
    return json({
      error: "malformed_api_key",
      detail: `הסוד קיים, אבל הערך קצר מדי או מכיל רווח. אורך שהתקבל: ${key.trim().length} (מפתח תקין הוא כ-39 תווים). סביר שההדבקה הייתה חלקית.`,
    }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // {"diagnose": true} — לפני כל בדיקה אחרת, כדי שיעבוד גם כשמשהו שבור.
  if (body.diagnose === true) return json(diagnose(env));

  // {"diagnose":"models"} — שואל את גוגל אילו מודלים זמינים למפתח הזה.
  // שמות מודלים אינם סוד, והמפתח אינו חוזר בתשובה.
  if (body.diagnose === "models") {
    const k = env.GEMINI_API_KEY;
    if (!k) return json({ error: "missing_api_key" }, 500);
    let r: Response;
    try {
      r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": k },
      });
    } catch {
      return json({ error: "upstream_unreachable" }, 502);
    }
    if (!r.ok) return json({ error: "upstream_error", status: r.status }, 502);
    const list = await r.json().catch(() => null);
    const usable = (list?.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""));
    return json({ current: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL, usable });
  }

  const question: unknown = body.question;
  if (typeof question !== "string" || question.trim() === "") {
    return json({ error: "empty_question" }, 400);
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return json({ error: "question_too_long", limit: MAX_QUESTION_CHARS }, 413);
  }

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
  const url = env.SUPABASE_URL;
  const dbKey = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY
    ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !dbKey) {
    return json({
      error: "rate_limit_unavailable",
      detail: "SUPABASE_URL או מפתח גישה למסד חסרים, ולכן אי אפשר לאכוף גג קריאות",
    }, 500);
  }
  {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const bucket = await bucketKey(ip, env.RATE_LIMIT_SALT ?? dbKey.slice(0, 16));
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
      return json({ error: "rate_limit_unavailable", detail: "המסד לא נענה" }, 500);
    }

    if (!res.ok) {
      return json({
        error: "rate_limit_unavailable",
        detail: `check_rate_limit החזירה ${res.status}. אם 404 — לא הורצה מיגרציה 026 (החתימה השתנתה לארגומנט אחד).`,
      }, 500);
    }

    // מיגרציה 021 החליפה את הבוליאני בטקסט: 'ok' | 'user' | 'global'.
    // כל דבר אחר פירושו שלא הבנו את התשובה, וזה כישלון — לא היתר.
    // ⚠️ בוליאני נחשב כאן **לא מובן**, ובכוונה: מסד שעדיין על 020 יחזיר
    // true, ו-true שמתפרש כ"מותר" הוא בדיוק גדר שנעלמה בלי שאיש ראה.
    const verdict = await res.json().catch(() => null);
    if (verdict !== "ok" && verdict !== "user" && verdict !== "global") {
      return json({
        error: "rate_limit_unavailable",
        detail: typeof verdict === "boolean"
          ? "check_rate_limit החזירה בוליאני — לא הורצה מיגרציה 021"
          : "תשובה לא צפויה מ-check_rate_limit",
      }, 500);
    }
    // ⚠️ שני הגדרות אינם אותה הודעה. "נסי בעוד שעה" כשהמכסה היומית
    // נגמרה הוא שקר שהמבקרת תגלה רק אחרי שעה של המתנה.
    if (verdict === "user") {
      return json({ error: "rate_limited", scope: "user", retry_after_minutes: RETRY_AFTER_MINUTES }, 429);
    }
    if (verdict === "global") {
      return json({ error: "rate_limited", scope: "global", retry_after_minutes: 60 * 24 }, 429);
    }
  }

  // ⚠️ **שני המקורות שלמטה נופלים רכה, בכוונה, ובניגוד לגדר הקצב.** גדר
  // שנכשלת חייבת לעצור, כי בלעדיה נקודת הקצה פתוחה. מקור ידע שנכשל אינו
  // פותח דבר — הוא רק מותיר את טים בלי הנתון, וההוראות שלו כבר אוסרות
  // עליו להמציא. לכן כישלון כאן מדווח בתשובה ואינו מונע ממנה לצאת.

  // ── המתקנים ──────────────────────────────────────────────────────────
  //
  // ⚠️ **עובדה על מתקן נשלפת מהטבלה, לא מחיפוש סמנטי** — ההפרדה שהוגדרה
  // ב-003: "ערבוב השניים הוא בדיוק הטעות שהארכיטקטורה נועדה למנוע".
  // "מה גובה המינימום" צריכה את המספר מהשורה, לא את הקטע שנשמע דומה.
  //
  // ⚠️ וזה גם מה שמונע מטים לענות מהאימון שלו. הוא "יודע" גבהים מהרשת,
  // והם עשויים להיות ישנים בשנתיים. כאן הוא מקבל את המספר **שלנו**, עם
  // תאריך בדיקה.
  let rides: ExperienceRow[] = [];
  const asked = extractRideName(question);
  if (asked) {
    try {
      const res = await fetch(`${url}/rest/v1/rpc/find_experiences`, {
        method: "POST",
        headers: {
          apikey: dbKey,
          Authorization: `Bearer ${dbKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_name: asked,
          p_height_cm: extractHeight(question),
          p_limit: 6,
        }),
      });
      const rows = res.ok ? await res.json() : null;
      rides = Array.isArray(rows) ? rows : [];
    } catch { /* נפילה רכה, כמו השליפה */ }
  }

  // ── השליפה ───────────────────────────────────────────────────────────
  let chunks: KnowledgeChunk[] = [];
  let retrieval: "ok" | "empty" | "failed" = "empty";
  try {
    // ⚠️ השאלה מקודדת כ-RETRIEVAL_QUERY ולא כ-RETRIEVAL_DOCUMENT. שני
    // התפקידים אינם סימטריים, וקידוד בתפקיד הלא נכון **עובד** ומחזיר
    // תוצאות גרועות יותר בלי שום שגיאה — אותה מלכודת כמו בצד הטעינה.
    const emb = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: question }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: 1536,
        }),
      },
    );
    const vector = emb.ok ? (await emb.json())?.embedding?.values : null;
    if (Array.isArray(vector) && vector.length === 1536) {
      const res = await fetch(`${url}/rest/v1/rpc/match_knowledge`, {
        method: "POST",
        headers: {
          apikey: dbKey,
          Authorization: `Bearer ${dbKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_embedding: JSON.stringify(vector), p_limit: 5 }),
      });
      const rows = res.ok ? await res.json() : null;
      chunks = Array.isArray(rows) ? rows : [];
      retrieval = res.ok ? (chunks.length > 0 ? "ok" : "empty") : "failed";
    } else {
      retrieval = "failed";
    }
  } catch {
    retrieval = "failed";
  }

  // ── הקריאה למודל ─────────────────────────────────────────────────────
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

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
  const thinking = thinkingConfig(env);
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  /**
   * 503 ו-429 מגוגל הם זמניים בהגדרה — "עמוס", לא "שגוי". ניסיון חוזר
   * אחד עם המתנה קצרה פותר את רובם.
   *
   * ⚠️ אחד בלבד, ובכוונה: אנחנו כבר בתוך נקודת קצה מוגבלת-קצב, וההמתנה
   * היא זמן שהמשתמשת מחכה מול מסך. עדיף להחזיר שגיאה מפורשת מלנסות שוב
   * ושוב ולהיראות תקוע.
   */
  const transient = (code: number) => code === 503 || code === 429 || code >= 500;

  let res: Response;
  const call = () =>
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        // ⚠️ הקטעים לפני השאלה. מודל שמקבל קודם שאלה ואז מקור נוטה לענות
        // מתוך מה שהוא כבר "יודע" ולהשתמש במקור כאישור; הסדר ההפוך מייצר
        // תשובה שנשענת על המקור.
        contents: [{
          role: "user",
          parts: [{
            // ⚠️ המתקנים לפני המסמכים. עובדה מהטבלה גוברת על פרוזה, ומודל
            // נוטה לתת משקל למה שהוא רואה קודם.
            text: [
              rides.length ? formatExperiences(rides) : null,
              chunks.length ? formatChunks(chunks) : null,
              `השאלה: ${question}`,
            ].filter(Boolean).join("\n\n---\n\n"),
          }],
        }],
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
    return json({ error: "upstream_unreachable" }, 502);
  }

  if (!res.ok) {
    // גוף התשובה של גוגל עלול לשקף בחזרה חלקים מהבקשה, ולכן לא הוחזר
    // כלל — אבל "400" בלי סיבה אינו ניתן לאבחון, וזו הייתה נפילה שקטה
    // בפני עצמה: העברנו סבב שלם בלי לדעת איזה שדה נדחה.
    //
    // מוחזר **רק** error.message מהמבנה של גוגל — משפט על הבקשה, לא
    // תוכן שלה — חתוך ל-300 תווים, ואחרי סינון של כל מה שנראה כמו
    // מפתח. אם המבנה אינו כצפוי, לא מוחזר דבר.
    return json({
      error: "upstream_error",
      status: res.status,
      model,
      upstream_detail: await upstreamReason(res),
      hint: res.status === 404
        ? `גוגל אינה מכירה את המודל "${model}". לשלוח {"diagnose":"models"} כדי לראות מה זמין למפתח הזה, ואז להגדיר סוד GEMINI_MODEL עם שם מהרשימה.`
        : transient(res.status)
        ? `גוגל עמוסה כרגע עבור "${model}" — זו תקלה זמנית ולא שגיאה בהגדרה. כבר ניסינו פעמיים. אם זה חוזר, להגדיר סוד GEMINI_MODEL עם דגם מיושב יותר, למשל gemini-2.5-flash.`
        : undefined,
    }, 502);
  }

  const data = await res.json().catch(() => null);
  const candidate = data?.candidates?.[0];
  // מודלים חדשים מחזירים כמה חלקים, וחלקם אינם טקסט (למשל "מחשבה").
  // לקיחת parts[0] בלבד החזירה ריק על תשובה תקינה לחלוטין.
  const answer = (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part?.text)
    .filter((t: unknown): t is string => typeof t === "string" && t !== "")
    .join("\n")
    .trim();

  if (!answer) {
    // finishReason הוא ההסבר: MAX_TOKENS פירושו שהתקציב נגמר לפני הטקסט,
    // SAFETY פירושו סינון. בלעדיו "ריק" הוא תשובה בלי סיבה.
    return json({
      error: "empty_answer",
      model,
      finish_reason: candidate?.finishReason ?? null,
      had_candidates: Array.isArray(data?.candidates) ? data.candidates.length : 0,
    }, 502);
  }

  // ── מדידה, כדי להפסיק לנחש ────────────────────────────────────────
  //
  // עלות ההודעה, יחס קלט/פלט, וכמה מהקלט הגיע מקאש — כל אלה היו עד כה
  // הערכה שלי מתוך שתי מחרוזות שמדדתי. גוגל מחזירה את המספרים האמיתיים
  // ב-usageMetadata, וההערכה עלתה לנו כבר פעם אחת בפי עשרים.
  //
  // ⚠️ לא נשמר במסד ולא מוצג למבקרת — רק מוחזר, כדי שאפשר יהיה לקרוא
  // אותו בבדיקה ידנית. לוג של שימוש לכל שיחה הוא מסלול קצר לדליפת תוכן.
  const u = data?.usageMetadata;
  const usage = u && typeof u === "object"
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

  // ⚠️ retrieval מוחזר תמיד. בלעדיו "טים לא יודע" ו"השליפה נפלה" נראים
  // זהים על המסך — והראשון הוא תשובה, השני הוא תקלה.
  // ⚠️ `tiers` הוא לבדיקות, לא לממשק. הוא אומר על מה התשובה נשענה,
  // ובלעדיו "must_cite_tier" בסט הזהב אינו ניתן לאכיפה.
  const tiers = [...new Set(chunks.map((c) => c.authority_tier).filter(Boolean))];
  return json({
    answer, model, usage, retrieval,
    chunks: chunks.length, rides: rides.length, tiers,
  });
}

/**
 * ⚠️ העטיפה הזו היא מה שהיה חסר.
 *
 * בניתי טיפול שגיאות בכל שכבה פנימית, והשארתי את החיצונית פתוחה: חריגה
 * לא-מטופלת ברחה ל-runtime, סופאבייס החזירה 500 גולמי בלי גוף, ולוח
 * הבדיקה נפל בניסיון לפרסר אותו — "Cannot read properties of undefined".
 * שגיאה בלי גוף אינה ניתנת לאבחון, וזו בדיוק הנפילה השקטה בגרסתה הרועשת.
 *
 * ההודעה שמוחזרת היא של הקוד שלנו. מפתחות אינם מופיעים בהודעות חריגה של
 * JavaScript, ולכן זה בטוח — ומה שנחסך הוא סבב ניחושים נוסף.
 */
Deno.serve(async (req) => {
  try {
    return await handle(req, Deno.env.toObject());
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "unhandled",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
});
