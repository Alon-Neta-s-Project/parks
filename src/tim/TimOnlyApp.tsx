import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Orb } from "../components/Orb";
import { askTim, type TimReply } from "../lib/tim";

/**
 * טים לבדו — הבנייה הראשונה שעולה לאוויר.
 *
 * ⚠️ **מה שהמסך הזה אינו מייבא, חשוב יותר ממה שהוא כן.**
 *
 * מסכי הרשימות — מדריך פארק, דף מתקן, עיון — מציגים 242 שורות, ולכן
 * 242 השורות **חייבות** להיות במחשב של מי שגולשת. אין דרך אחרת: דפדפן
 * אינו יכול להציג משהו שאין לו.
 *
 * טים הפוך: הדפדפן שולח שאלה אחת, השרת שולף מהמסד ומחזיר משפט. המאגר
 * נשאר בשרת.
 *
 * ולכן הקובץ הזה אינו מייבא **דבר** מ-`src/data`, לא ישירות ולא דרך
 * `recommend`, `profile` או `intent`. הרשימה מגיעה לחבילה דרך כל אחד
 * מהם, ובדיקה בזמן בנייה סופרת כמה שורות שרדו — התשובה חייבת להיות
 * אפס.
 *
 * ⚠️ ומה שנופל כאן ואינו נעלם: שאלות הפתיחה, ההמלצות, ומדריכי הפארקים.
 * הם בנויים, נבדקים, ומחכים לסבב שאחרי ההכרעה על הגנת הדאטא.
 */

interface Turn {
  id: string;
  question: string;
  /** null בזמן שהתשובה בדרך. */
  reply: TimReply | null;
}

export default function TimOnlyApp() {
  const { t } = useTranslation();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  /**
   * ⚠️ הטקסט מגיע כארגומנט ולא נקרא מהמצב. צ'יפ שמפעיל שליחה מיד אחרי
   * setDraft היה שולח את הערך הקודם — המצב ב-React מתעדכן אחרי הרינדור,
   * לא בשורה הבאה. זה נתפס כאן פעם אחת כבר.
   */
  const send = async (raw?: string) => {
    const text = (raw ?? draft).trim();
    if (!text || busy) return;

    const id = `q${turns.length}`;
    setTurns((current) => [...current, { id, question: text, reply: null }]);
    setDraft("");
    setBusy(true);

    // ⚠️ askTim אינו זורק — הוא מחזיר כישלון מוטבע עם סיבה. זה מכוון:
    // לכל סיבה יש טקסט משלה שאומר למי שקוראת **מה לעשות**, ו-catch אחד
    // היה מכווץ את חמשתן ל"משהו השתבש".
    const reply = await askTim(text);
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, reply } : turn)));
    setBusy(false);
  };

  const empty = turns.length === 0;

  return (
    <div className="app">
      <div className="app__inner timonly">
        <header className="topbar">
          <span className="topbar__brand">
            <Orb />
            <b>{t("app.title")}</b>
          </span>
          <span className="topbar__nav">
            <span className="chip chip--way">{t("timOnly.badge")}</span>
          </span>
        </header>

        {empty && (
          <section className="block">
            <div className="msg">
              <Orb />
              <div className="bubble bubble--tim">
                {t("timOnly.greeting")}
                <div className="bubble__note">{t("timOnly.scope")}</div>
              </div>
            </div>

            <div className="options">
              {(t("timOnly.examples", { returnObjects: true }) as string[]).map((example) => (
                <button
                  key={example}
                  type="button"
                  className="option"
                  onClick={() => void send(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </section>
        )}

        {turns.map((turn) => (
          <div key={turn.id}>
            <div className="msg msg--me">
              <div className="bubble bubble--me">{turn.question}</div>
            </div>

            <div className="msg">
              <Orb />
              <div className="bubble bubble--tim">
                {turn.reply === null ? (
                  <span className="bubble__typing">{t("ask.thinking")}</span>
                ) : turn.reply.status === "ok" ? (
                  /* ⚠️ טקסט ולא HTML. התשובה מגיעה ממודל, כלומר היא קלט
                     חיצוני — ו-React מסמן אותה מעצמו כל עוד היא נשארת
                     ילד־טקסט. `white-space: pre-line` ב-CSS שומר על
                     השורות בלי dangerouslySetInnerHTML. */
                  <span className="bubble__body">{turn.reply.answer}</span>
                ) : (
                  /* ⚠️ הטקסט נבחר לפי הסיבה, ומהמפתחות שכבר קיימים.
                     "שאלתם הרבה בזמן קצר" ו"לא הצלחתי להגיע לשרת" מובילים
                     לפעולות שונות לגמרי. */
                  <span className="bubble__error">
                    {t(`ask.timFailed.${turn.reply.reason}`)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        <div ref={endRef} />

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            className="composer__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("ask.placeholder")}
            aria-label={t("ask.placeholder")}
            disabled={busy}
          />
          <button
            type="submit"
            className="composer__send"
            aria-label={t("ask.send")}
            disabled={busy || draft.trim() === ""}
          >
            {/* ⚠️ חץ **מצויר** ולא תו חץ, ובכיוון הקנוני (שמאל־לימין).
                `[dir="rtl"] .icon-dir` הופך אותו, ותו חץ ברכיב מפיל את
                הבדיקה שאוכפת את הכלל. אותה תבנית כמו במסך הכניסה. */}
            <svg className="icon-dir" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor"
                    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>

        {/* ⚠️ נאמר במפורש ולא נרמז. משפחה שמקבלת תשובה בטוחה על מתקן
            צריכה לדעת שזו גרסה מוקדמת, ושהתשובות עדיין נבדקות. */}
        <p className="timonly__note">{t("timOnly.disclaimer")}</p>
      </div>
    </div>
  );
}
