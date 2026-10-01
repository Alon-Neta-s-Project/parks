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

/**
 * The server's note endpoint (POST /note, apps/server/src/note.ts) — set on staging (`/api/note`).
 * With it, a note goes to the server with its question and answer, and no key is needed (Alon,
 * 01.10). Without it, the old path below — the production test page still runs on the old server.
 */
export const noteUrl = (): string | undefined => (import.meta.env.VITE_NOTE_URL as string | undefined)?.trim() || undefined;

/** המפתח שנטע מדביקה פעם אחת במסך. יושב בדפדפן שלה. */
export const KEY_STORAGE = "tim-test-key-v1";

export function testerKey(): string {
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
  const server = noteUrl();
  if (server) {
    try {
      const res = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnRef: input.turnRef, sessionRef: input.sessionRef, note: input.note,
          question: input.question ?? null, answer: input.answer ?? null,
        }),
      });
      return res.ok ? "saved" : "local-only";
    } catch {
      return "local-only";
    }
  }

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
