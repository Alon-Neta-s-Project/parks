import { createHash } from "node:crypto";

/**
 * מזהה יציב למסמך קהילתי, נגזר מ-URL של הפוסט.
 *
 * `knowledge_doc.id` הוא מפתח ראשי טקסטואלי וה-ingest אידמפוטנטי לפיו:
 * אותו פוסט חייב לייצר את אותו `id` בכל הרצה, אחרת כל סבב איסוף מכפיל
 * שורות באינדקס.
 *
 * ⚠️ **ה-hash הוא על זהות הפוסט ולא על תוכנו.** פוסט שנערך הוא אותו
 * פוסט — צריך לעדכן את שורתו, לא ליצור חדשה. (הטריגר ממיגרציה 033
 * מאפס את הווקטור כש-`content` משתנה, כך שהעדכון גורר embedding מחדש
 * מעצמו.) hash על התוכן היה יוצר מסמך חדש בכל עריכה קלה ומשאיר את
 * הישן באינדקס — שתי גרסאות של אותה עובדה, שתיהן נשלפות.
 *
 * 🔴 **ומה שמכריע בפועל הוא הנורמליזציה, לא ה-hash.** ראה
 * `canonicalPostUrl`.
 */

/**
 * ⚠️ **רשימת היתר, לא רשימת חסימה.**
 *
 * הדחף הראשון הוא למחוק את `fbclid` ואת `utm_*`. זו רשימת חסימה, והיא
 * מתיישנת בשקט: פייסבוק מוסיפה פרמטר חדש (`__cft__`, `__tn__`, ומה
 * שיבוא אחריהם), הוא אינו ברשימה, ואותו פוסט מקבל `id` נוסף. אין
 * שגיאה — רק עוד שורה.
 *
 * רשימת היתר נכשלת לכיוון הבטוח: פרמטר זהות חדש שלא הוכר ימזג שני
 * פריטים שונים, וזה נראה מיד. פרמטר מעקב חדש פשוט נעלם.
 */
const IDENTITY_PARAMS = new Set([
  "story_fbid",
  "id",
  "fbid",
  "v",
  // 🔴 תגובה אינה הפוסט. רשימת חסימה של "פרמטרים מיותרים" הייתה מוחקת
  // את אלה יחד עם fbclid, וממזגת תגובה לתוך הפוסט שלה.
  "comment_id",
  "reply_comment_id",
]);

/** אותו פוסט, מארחים שונים. פייסבוק מגישה את כולם. */
const HOST_PREFIXES = ["www.", "m.", "mbasic.", "web.", "touch."];

/**
 * צורה קנונית אחת ל-URL של פוסט.
 *
 * אותו פוסט מגיע עם `?fbclid=…` שנוסף לכל שיתוף, מהמארח הנייד, עם ובלי
 * סלאש מסיים, ב-http או ב-https. כל וריאציה היא `id` אחר, וכל `id` אחר
 * הוא שורה כפולה — בלי שגיאה ובלי דרך להבחין בין פוסט חדש לבין אותו
 * פוסט בפעם השלישית.
 *
 * ⚠️ **ונופל על קלט פסול ולא מחזיר אותו כמו שהוא.** פונקציה שמחזירה
 * מחרוזת שאינה URL הייתה מייצרת `id` יציב לזבל, והזבל היה נראה כמו
 * פוסט לכל דבר.
 */
export function canonicalPostUrl(raw: string): string {
  const url = new URL(raw.trim());

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`URL של פוסט חייב להיות http/https, התקבל ${url.protocol}`);
  }

  let host = url.hostname.toLowerCase();
  for (const prefix of HOST_PREFIXES) {
    if (host.startsWith(prefix)) {
      host = host.slice(prefix.length);
      break;
    }
  }
  if (host === "") throw new Error("URL של פוסט בלי מארח");

  // סלאש מסיים אינו זהות — למעט השורש, ששם הוא כל הנתיב.
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

  // סדר הפרמטרים אינו זהות. המיון מוציא אותו מהמשוואה.
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => IDENTITY_PARAMS.has(key))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));

  const query = kept.map(([k, v]) => `${k}=${v}`).join("&");

  // ה-fragment נזרק: `#comments` אינו פריט אחר.
  return `https://${host}${path}${query ? `?${query}` : ""}`;
}

/** `community-fb-<16 התווים הראשונים של sha256 על ה-URL הקנוני>`. */
export function communityDocId(rawPostUrl: string): string {
  const canonical = canonicalPostUrl(rawPostUrl);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `community-fb-${digest.slice(0, 16)}`;
}
