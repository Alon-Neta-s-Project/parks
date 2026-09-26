/**
 * האם השאלה מבקשת שנבחר עבור מי ששואל.
 *
 * ⚠️ **אותו אוצר מילים כמו `apps/web/src/lib/ask-intent.ts`, ובכוונה.** שתי
 * רשימות מילים בשני צדדים היו נעשות שונות תוך שבוע, ואז אותה שאלה
 * הייתה מסווגת אחרת בדפדפן ובשרת — בלי שאיש ישים לב.
 *
 * ⚠️ ומילת עובדה גוברת: "כמה זמן כדאי לתכנן ל-Everest" היא שאלה שיש לה
 * תשובה בטבלה, ושורות מועמדים עליה הן רעש.
 */
/**
 * כתיבה ליומן התשובות. **נכשלת בשקט, בכוונה.**
 *
 * ⚠️ `EdgeRuntime.waitUntil` כשהוא קיים — הוא מאפשר לבקשה להסתיים בלי
 * לחכות לכתיבה. כשאינו קיים, המתנה **חסומה בזמן**: שנייה אחת ולא יותר.
 * בלי הגבול הזה מסד איטי היה הופך לעיכוב על המסך של משפחה.
 */
export function logTurn(
  url: string,
  key: string,
  t: {
    question: string;
    answered: boolean;
    reason: string | null;
    model: string;
    usage: { input?: number; output?: number } | null;
  },
): void {
  const write = fetch(`${url}/rest/v1/rpc/log_turn`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_question: t.question,
      p_answered: t.answered,
      p_refusal_reason: t.reason,
      p_model: t.model,
      p_input_tokens: t.usage?.input ?? null,
      p_output_tokens: t.usage?.output ?? null,
    }),
    signal: AbortSignal.timeout(1000),
  }).catch(() => {});

  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (typeof rt?.waitUntil === "function") rt.waitUntil(write);
}
