/**
 * שליחת הערת בודק למסד — גרסת הבדיקה בלבד.
 *
 * 🔴 **ההערות לא יכולות לחיות רק בדפדפן.** ניקוי נתוני אתר מוחק אותן,
 * ומעבר למחשב אחר מאבד אותן. מקור יחיד שאפשר לאבד בלחיצה אינו מקור.
 *
 * ⚠️ **ו-localStorage לא הוסר — הוא הפך לגיבוי.** השמירה המקומית קורית
 * תמיד ומיד; השליחה למסד קורית אחריה ויכולה להיכשל (אין רשת, מפתח שגוי).
 * הערה שנכתבה ולא נשלחה **נשארת מסומנת ככזו במסך**, ולא נעלמת ולא
 * מתחזה לשמורה.
 */

export type SaveState = "saved" | "local-only" | "sending";

const URL_BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const KEY_STORAGE = "tim-test-key-v1";

/**
 * 🔴 **נטע ביקשה שלא תהיה לה עבודה חוזרת, ובצדק.** בגרסה הראשונה
 * המפתח נדבק ביד במסך — כלומר בכל דפדפן חדש, בכל ניקוי נתונים, ובכל
 * מכשיר. עבודה שחוזרת היא עבודה שנשכחת, והערות היו הולכות לאיבוד.
 *
 * עכשיו הוא מגיע מהבנייה (`VITE_TESTER_KEY`, מוגדר ב-Netlify על הקשר
 * `tim-test` בלבד), והשדה במסך נשאר רק כמוצא אחרון.
 *
 * ⚠️ **ומה שזה אומר, שייאמר במפורש:** המפתח נוסע לדפדפן בתוך החבילה,
 * ולכן מי שמגיע לכתובת הבדיקה יכול לכתוב הערות. **הכתובת עצמה היא
 * השומר**, והיא `noindex`. זה היה נכון גם קודם — מפתח שנשמר בדפדפן
 * נקרא בכלי המפתחים — אלא שעכשיו זה נכון לכל מי שיש לו הקישור, ולא
 * רק למי שכבר נכנס.
 */
export function testerKey(): string {
  const fromBuild = import.meta.env.VITE_TESTER_KEY as string | undefined;
  if (fromBuild) return fromBuild;
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

/**
 * ⚠️ **מחזירה `local-only` ולא זורקת.** כישלון שליחה אינו אמור לאבד
 * את ההערה או להפיל את המסך — הוא אמור להיראות.
 */
export async function saveNote(input: {
  turnRef: string;
  sessionRef: string;
  note: string;
  question?: string;
  answer?: string;
}): Promise<SaveState> {
  const key = testerKey();
  if (!URL_BASE || !ANON || !key) return "local-only";

  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/save_tester_note`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify({
        p_key: key,
        p_turn_ref: input.turnRef,
        p_session_ref: input.sessionRef,
        p_note: input.note,
        p_question: input.question ?? null,
        p_answer: input.answer ?? null,
      }),
    });
    return res.ok ? "saved" : "local-only";
  } catch {
    return "local-only";
  }
}
