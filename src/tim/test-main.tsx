import { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import TimOnlyApp from "./TimOnlyApp";
import { FeedbackNote } from "./FeedbackNote";
import { KEY_STORAGE, saveNote, testerKey, type SaveState } from "./save-note";
import "../i18n";
import "../styles/global.css";
import "./test-feedback.css";

/**
 * טים — **גרסת בדיקה**. נקודת כניסה נפרדת, בנייה נפרדת, כתובת נפרדת.
 *
 * 🔴 **הדרישה של נטע: שלא יתערבב עם הקיים.** לכן זה לא דגל בתוך
 * האפליקציה אלא `tim-test.html` נפרד — אי אפשר להגיע לכאן בטעות
 * מהמסך הרגיל, ואי אפשר להגיע לשם בטעות מכאן.
 *
 * ⚠️ **ומסך הצ'אט עצמו אינו מועתק.** הוא אותו `TimOnlyApp` בדיוק,
 * והפידבק נכנס כ-prop. שני עותקים של מסך צ'אט היו מתפצלים תוך שבוע,
 * וגרסת הבדיקה הייתה בודקת משהו אחר ממה שרץ בפועל.
 *
 * ⚠️ **ההערות נשמרות בדפדפן *וגם* נשלחות למסד** (`tester_note`, מיגרציה
 * 046). הדפדפן ראשון כדי שהערה לא תאבד כששליחה נכשלת — ולכן המסך אומר
 * במפורש כמה לא הגיעו, ולכן הייצוא הידני נשאר.
 */

const KEY = "tim-test-notes-v1";

/**
 * מזהה לסבב הבדיקה הנוכחי. נוצר פעם אחת לטעינת דף, כדי שכל ההערות
 * מאותה שיחה יגיעו מקובצות ולא כשורות בודדות מנותקות.
 */
const SESSION = `s${Date.now().toString(36)}`;

function load(): Record<string, string> {
  // ⚠️ localStorage זורק בחלון פרטי ובחסימת נתוני אתר. נפילה כאן הייתה
  // מונעת מהמסך לעלות בכלל.
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function TestHarness() {
  const [notes, setNotes] = useState<Record<string, string>>(load);
  const [copied, setCopied] = useState(false);
  /** מצב שליחה לכל הערה. חסר = עוד לא נשלחה בסשן הזה. */
  const [sent, setSent] = useState<Record<string, SaveState>>({});
  const [key, setKey] = useState(testerKey);

  const onSave = useCallback((turnId: string, note: string) => {
    // 🔴 **המסד אחרי הדפדפן, לא במקומו.** אם השליחה נכשלת ההערה כבר
    // שמורה מקומית — והמסך יראה שהיא לא הגיעה.
    if (note !== "") {
      setSent((s) => ({ ...s, [turnId]: "sending" }));
      void saveNote({ turnRef: turnId, sessionRef: SESSION, note }).then((state) =>
        setSent((s) => ({ ...s, [turnId]: state })),
      );
    }
    setNotes((prev) => {
      const next = { ...prev };
      // ⚠️ הערה ריקה מוחקת ולא שומרת מחרוזת ריקה. "" ו"אין הערה" הם
      // אותו דבר מבחינת המשתמשת, ושונים לגמרי בייצוא.
      if (note === "") delete next[turnId];
      else next[turnId] = note;
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* חלון פרטי — ההערה תחיה עד לרענון, והייצוא עדיין עובד */
      }
      return next;
    });
  }, []);

  const entries = Object.entries(notes);

  const text =
    entries.length === 0
      ? ""
      : [
          `פידבק מסבב בדיקה · ${new Date().toLocaleString("he-IL")}`,
          "",
          ...entries.map(([id, note]) => `[${id}]\n${note}`),
        ].join("\n\n");

  return (
    <>
      <div className="testbar">
        {key
          ? "גרסת בדיקה — ההערות נשמרות בדפדפן וגם נשלחות לקודי"
          : "גרסת בדיקה — ⚠️ בלי מפתח, ההערות נשמרות בדפדפן בלבד"}
        {key ? null : (
          <input
            className="testbar__key"
            type="password"
            placeholder="מפתח בודק"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) return;
              try {
                localStorage.setItem(KEY_STORAGE, v);
              } catch {
                /* חלון פרטי — יחזיק עד רענון */
              }
              setKey(v);
            }}
          />
        )}
      </div>
      <TimOnlyApp
        feedback={{
          renderNote: (id) => (
            <FeedbackNote turnId={id} note={notes[id] ?? ""} onSave={onSave} />
          ),
          footer:
            entries.length === 0 ? null : (
              <div className="feedback__export">
                <div>
                  {entries.length} הערות בשיחה הזו
                  {/* ⚠️ מה שלא הגיע למסד נאמר במפורש. שתיקה כאן הייתה
                      נקראת כ"הכול נשלח". */}
                  {(() => {
                    const stuck = entries.filter(([id]) => sent[id] !== "saved").length;
                    return stuck === 0 ? " · כולן נשלחו ✓" : ` · ${stuck} לא נשלחו — להעתיק ידנית`;
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(text).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    );
                  }}
                >
                  העתקה לשליחה
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`למחוק ${entries.length} הערות?`)) return;
                    setNotes({});
                    try {
                      localStorage.removeItem(KEY);
                    } catch {
                      /* אין מה לנקות */
                    }
                  }}
                >
                  ניקוי
                </button>
                {copied ? <span>הועתק ✓</span> : null}
                {/* ⚠️ הטקסט מוצג ולא רק מועתק. אם ההעתקה נכשלת — וזה
                    קורה בדפדפנים שחוסמים clipboard — יש מה לסמן ביד. */}
                <pre className="feedback__preview">{text}</pre>
              </div>
            ),
        }}
      />
    </>
  );
}

document.documentElement.lang = "he";
document.documentElement.dir = "rtl";

const root = document.getElementById("root");
if (!root) throw new Error("root element missing from tim-test.html");

createRoot(root).render(
  <StrictMode>
    <TestHarness />
  </StrictMode>,
);
