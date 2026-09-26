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
