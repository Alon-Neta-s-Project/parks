import { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import TimOnlyApp from "./TimOnlyApp";
import { FeedbackNote } from "./FeedbackNote";
import { KEY_STORAGE, lastSaveError, saveNote, testerKey, type SaveState } from "./save-note";
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
  /** הלוח סגור כברירת מחדל — הוא כלי, לא חלק מהשיחה. */
  const [panelOpen, setPanelOpen] = useState(false);
  /** מצב שליחה לכל הערה. חסר = עוד לא נשלחה בסשן הזה. */
  const [sent, setSent] = useState<Record<string, SaveState>>({});
  /**
   * ⚠️ ההקשר של כל הערה — נשמר כדי שגם הייצוא הידני לא ימסור הערות
   * מרחפות. אינו נשמר ב-localStorage: הוא נגזר מהשיחה שעל המסך,
   * ושיחה שנסגרה אין מה להעיר עליה.
   */
  const [ctx, setCtx] = useState<Record<string, { question: string; answer: string }>>({});
  const [key, setKey] = useState(testerKey);

  const onSave = useCallback((turnId: string, note: string, ctx?: { question: string; answer: string }) => {
    // 🔴 **המסד אחרי הדפדפן, לא במקומו.** אם השליחה נכשלת ההערה כבר
    // שמורה מקומית — והמסך יראה שהיא לא הגיעה.
    if (ctx) setCtx((c) => ({ ...c, [turnId]: ctx }));
    if (note !== "") {
      setSent((s) => ({ ...s, [turnId]: "sending" }));
      void saveNote({
        turnRef: turnId,
        sessionRef: SESSION,
        note,
        question: ctx?.question,
        answer: ctx?.answer,
      }).then((state) =>
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
          // ⚠️ גם הייצוא הידני נושא הקשר. בלעדיו הוא מוסר הערות
          // מרחפות — וזה בדיוק מה שקרה ב-25.09.
          ...entries.map(([id, note]) => {
            const c = ctx[id];
            return c
              ? `[${id}]\nנשאל: ${c.question}\nטים ענה: ${c.answer}\nההערה: ${note}`
              : `[${id}]\n${note}`;
          }),
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
          renderNote: (turn) => (
            <FeedbackNote
              turnId={turn.id}
              note={notes[turn.id] ?? ""}
              onSave={(id, note) =>
                onSave(id, note, { question: turn.question, answer: turn.answer })
              }
            />
          ),
          footer:
            entries.length === 0 ? null : (
              /**
               * 🔴 **נטע, 25.09: "לא נוח שתיבת ההצעות יושבת לי בצ'אט".**
               *
               * הלוח היה פתוח תמיד, עם התצוגה המקדימה של כל ההערות,
               * ודחף את השיחה מטה. בטלפון הוא תפס חצי מסך.
               *
               * עכשיו: כפתור אחד צף, והלוח נפתח מעליו. השיחה נשארת
               * שיחה.
               */
              <>
                <button
                  type="button"
                  className="notes-pill"
                  onClick={() => setPanelOpen((v) => !v)}
                  aria-expanded={panelOpen}
                >
                  {/* ⚠️ המספר על הכפתור, כדי שלא צריך לפתוח כדי לדעת. */}
                  הערות · {entries.length}
                  {entries.filter(([id]) => sent[id] !== "saved").length > 0 ? " ⚠️" : ""}
                </button>

                {panelOpen ? (
                  <div className="notes-panel" role="dialog" aria-label="ההערות בשיחה">
                    <div className="notes-panel__head">
                      <span>
                        {entries.length} הערות בשיחה הזו
                        {/* ⚠️ מה שלא הגיע למסד נאמר במפורש. שתיקה כאן
                            הייתה נקראת כ"הכול נשלח". */}
                        {(() => {
                          const stuck = entries.filter(([id]) => sent[id] !== "saved").length;
                          if (stuck === 0) return " · כולן נשלחו ✓";
                          // 🔴 הסיבה, ולא רק המספר.
                          const why = lastSaveError();
                          return ` · ${stuck} לא נשלחו${why ? ` — ${why}` : ""}`;
                        })()}
                      </span>
                      <button type="button" onClick={() => setPanelOpen(false)} aria-label="סגירה">
                        ✕
                      </button>
                    </div>

                    <div className="notes-panel__actions">
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
                          setPanelOpen(false);
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
                    </div>

                    {/* ⚠️ הטקסט מוצג ולא רק מועתק. אם ההעתקה נכשלת —
                        וזה קורה בדפדפנים שחוסמים clipboard — יש מה
                        לסמן ביד. */}
                    <pre className="feedback__preview">{text}</pre>
                  </div>
                ) : null}
              </>
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
