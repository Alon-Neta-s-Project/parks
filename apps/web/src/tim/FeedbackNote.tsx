import { useState } from "react";

/**
 * חלונית פידבק ליד תשובה של טים — **גרסת הבדיקה בלבד**.
 *
 * 🔴 **ואינה נכנסת לבנייה הציבורית.** `TimOnlyApp` מקבל אותה כ-prop,
 * ורק `apps/web/src/tim/test-main.tsx` מעביר אותה. בבנייה של טים הרגיל הערך
 * `undefined`, והכפתור לא קיים — לא מוסתר ב-CSS, פשוט לא מרונדר.
 *
 * ⚠️ **ההערות יושבות ב-localStorage של הדפדפן ולא במסד.** זו החלטה
 * מכוונת: כתיבה ל-`message` היא נתיב כתיבה חדש לטבלה רגישה, כלומר
 * קטגוריה 1 אצל גיא (Issue #28). הדרך הזו מאפשרת להתחיל לבדוק היום
 * בלי להמתין לאישור.
 *
 * ⚠️ **והמחיר נאמר ולא מוסתר:** ניקוי נתוני האתר בדפדפן מוחק את
 * ההערות. לכן יש כפתור ייצוא, והוא מה שמוציא אותן החוצה.
 */
export function FeedbackNote({
  turnId,
  note,
  onSave,
}: {
  turnId: string;
  note: string;
  onSave: (turnId: string, note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);

  if (!open) {
    return (
      <button
        type="button"
        className="feedback__flag"
        onClick={() => {
          setDraft(note);
          setOpen(true);
        }}
        // ⚠️ הכפתור אומר אם יש כבר הערה. בלי זה אין דרך לדעת על מה
        // כתבת, וההערה השנייה דורסת את הראשונה בלי שתראי.
        aria-label={note ? "יש הערה — לעריכה" : "כתיבת הערה"}
      >
        {/* Said in words, at full strength (Alon, 01.10: "no send button" — the faint "⚐ הערה"
            pill was missed, and the box with its buttons opens only from it). */}
        {note ? "✎ עריכת ההערה" : "✎ הוספת הערה"}
      </button>
    );
  }

  return (
    <div className="feedback">
      <textarea
        className="feedback__text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="מה לא בסדר בתשובה הזו?"
        rows={3}
        autoFocus
      />
      <div className="feedback__actions">
        <button
          type="button"
          onClick={() => {
            onSave(turnId, draft.trim());
            setOpen(false);
          }}
        >
          {/* "Send", not "save" (Alon, 01.10: "no send button") — it saves in the browser and
              sends to the server in one click; the screen counts notes as sent or not sent. */}
          שליחה
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          ביטול
        </button>
      </div>
    </div>
  );
}
