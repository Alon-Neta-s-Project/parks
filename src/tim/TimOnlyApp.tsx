import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Orb } from "../components/Orb";
import { Thinking } from "../components/Thinking";
import { shouldAskUpFront } from "../lib/ask-intent";
import { askTim, type TimReply, type TimTurn } from "../lib/tim";

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
  /**
   * null בזמן שהתשובה בדרך, `"clarify"` כשטים שאל חזרה במקום לענות.
   */
  reply: TimReply | "clarify" | null;
}

/**
 * ⚠️ **`feedback` הוא איך גרסת הבדיקה נבדלת — ולא עותק של הקובץ הזה.**
 *
 * נטע ביקשה "ממש העתקה של טים למקום אחר". שתי העתקות של מסך הצ'אט היו
 * מתפצלות תוך שבוע, ואז גרסת הבדיקה הייתה בודקת משהו אחר ממה שרץ
 * בפועל — בדיוק הכשל שהפרויקט הזה נבנה נגדו.
 *
 * מה שנפרד בפועל: `tim-test.html`, בנייה נפרדת, כתובת נפרדת. מה שמשותף:
 * מסך הצ'אט עצמו. כשטים משתנה, גרסת הבדיקה משתנה איתו.
 */
export interface TimOnlyAppProps {
  /**
   * כשאינו מוגדר — אין פידבק, ואין כפתור. זו הבנייה הציבורית.
   *
   * 🔴 **והרכיב מגיע כפונקציה, לא כייבוא — וזה לא סגנון.**
   *
   * בגרסה הראשונה `TimOnlyApp` ייבא את `FeedbackNote` ישירות ובדק את
   * ה-prop לפני הרינדור. הקוד **נכנס לחבילה הציבורית בכל זאת**: ייבוא
   * סטטי נכלל גם כשהענף לא נבחר, ו-tree-shaking אינו יכול להסיר רכיב
   * שמופיע ב-JSX. נמצא בבדיקת החבילה שנבנתה, לא בקריאה.
   *
   * עכשיו הקובץ הזה אינו יודע ש-`FeedbackNote` קיים. רק
   * `test-main.tsx` מייבא אותו, ולכן הוא אינו יכול להגיע לבנייה
   * הציבורית — מהמבנה, לא מחוכמת ה-bundler.
   */
  feedback?: {
    /**
     * 🔴 **השאלה והתשובה עוברות, ולא רק המזהה.**
     *
     * בסבב הראשון (25.09) הגיעו אליי ארבע הערות מסומנות q0…q3 ובלי
     * שום הקשר — לא מה נשאל ולא מה טים ענה. הערה על תשובה שאיני
     * רואה היא ניחוש, והפונקציה במסד כבר קיבלה שדות לשניהם. הם
     * פשוט מעולם לא נשלחו.
     */
    renderNote: (turn: { id: string; question: string; answer: string }) => React.ReactNode;
    /** מוצג בסוף השיחה — ייצוא כל ההערות. */
    footer: React.ReactNode;
  };
}

export default function TimOnlyApp({ feedback }: TimOnlyAppProps = {}) {
  const { t } = useTranslation();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** השאלה שממתינה לפרטים על מי ששואל, אם נשאלה כזו. */
  const [pending, setPending] = useState<string | null>(null);
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

    /**
     * ⚠️ **בקשה לבחור עבור מי ששואל אינה נשלחת לטים כמו שהיא.**
     *
     * 🔴 שני באגים שדווחו נפלו כאן: "מה דעתך על 3 ימי דיסני ויומיים
     * יוניברסל" ו"איזה פארק מתאים לזוג בני 30". טים ענה תוכן כללי על
     * סוגי כרטיסים, או סירב והפנה החוצה — שניהם בלי לשאול דבר על מי
     * שואל.
     *
     * ⚠️ **והשאלות נשאלות באמת, לא כהבטחה.** הניסוח שאושר אומר "כמה
     * שאלות קצרות קודם", ומסך שאומר את זה ואינו שואל דבר גרוע מהמצב
     * הקודם. השאלות מוצגות מיד, והתשובה עליהן נשלחת לטים **יחד עם
     * השאלה המקורית** — כי `askTim` שולח הודעה בודדת בלי היסטוריה,
     * ותשובה שתישלח לבדה הייתה מגיעה אליו בלי הקשר בכלל.
     */
    // 🔴 **שאלת הבירור נשאלה גם באמצע שיחה שכבר ענתה עליה.**
    //
    // נטע ניהלה שיחה שלמה — משפחה עם ילדים בני 5 ו-7, ארבעה ימי פארקים,
    // עולמות דיסני והארי פוטר — ואז שאלה "מעדיפים פארקים עם תפאורה
    // יפה". המסך פתח מחדש ב"כמה שאלות קצרות קודם", כאילו לא ידע עליה
    // דבר. **וזה קרה בלי שטים בכלל נשאל**, כי הענף הזה עוצר לפניו.
    //
    // ⚠️ הכלל "לשאול לפני שממליצים" יושם בלי תנאי, והתעלם ממה שכבר
    // נאמר — אותה תבנית שחזרה כאן היום: כלל נכון שהוחל באופן גורף.
    //
    // ⚠️ **ומהרגע שיש היסטוריה, ההכרעה אינה כאן.** טים מקבל את השיחה
    // כולה מאז v12, והוא זה שיודע אם עדיין חסר לו משהו. מסך שחוסם
    // לפניו מונע ממנו להשתמש במה שכבר יש.
    if (pending === null && shouldAskUpFront(text, turns.length > 0)) {
      setTurns((current) => [...current, { id, question: text, reply: "clarify" }]);
      setPending(text);
      setDraft("");
      return;
    }

    const forTim = pending ? `${pending}\n\nפרטים על מי ששואל: ${text}` : text;
    setPending(null);

    setTurns((current) => [...current, { id, question: text, reply: null }]);
    setDraft("");
    setBusy(true);

    // ⚠️ askTim אינו זורק — הוא מחזיר כישלון מוטבע עם סיבה. זה מכוון:
    // לכל סיבה יש טקסט משלה שאומר למי שקוראת **מה לעשות**, ו-catch אחד
    // היה מכווץ את חמשתן ל"משהו השתבש".
    // 🔴 **ההיסטוריה, וזה מה שהיה חסר כשטים שאל שלוש פעמים אותו דבר.**
    //
    // נבנית מהתורות שכבר על המסך, ולכן היא בדיוק מה שהמשתמשת רואה —
    // ולא מבנה מקביל שיכול להיפרד ממנו.
    //
    // ⚠️ רק תשובות שהצליחו נכנסות. הודעת שגיאה אינה דבר שטים אמר,
    // ושליחתה חזרה אליו כאילו אמר אותה מלמדת אותו לחזור עליה.
    // 🔴 **הפתיח של המסך הוא דבר שטים אמר — ולא הגיע אליו.**
    //
    // נטע, 25.09: "כבר שאלת איך לקרוא לי ועכשיו אתה שואל שוב?"
    // המסך מציג "איך לקרוא לך?", היא ענתה "נטעל'ה", ולטים הגיעה
    // מילה בודדת בלי שום הקשר. הוא לא ידע שהשאלה כבר נשאלה, אז
    // שאל אותה שוב.
    //
    // ⚠️ **ההודעה הייתה על המסך ולא בשיחה.** שני מקומות שמחזיקים
    // את אותה שיחה, ורק אחד מהם נשלח. היא נכנסת עכשיו כתור ראשון
    // של טים, לפני הכול.
    const history: TimTurn[] = [
      { role: "model", text: t("timOnly.greeting") },
      ...turns.flatMap((t) => {
      const said: TimTurn[] = [{ role: "user", text: t.question }];
      if (t.reply && t.reply !== "clarify" && t.reply.status === "ok") {
        said.push({ role: "model", text: t.reply.answer });
      }
        return said;
      }),
    ];

    const reply = await askTim(forTim, undefined, history);
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
                {turn.reply === "clarify" ? (
                  /* ⚠️ הניסוח שאושר, ומיד אחריו השאלות עצמן. מסך שאומר
                     "כמה שאלות קצרות קודם" ואינו שואל דבר הוא הבטחה
                     ריקה — גרועה יותר מהתשובה הכללית שהייתה כאן קודם.

                     ⚠️ **ובלי מספר קבוע, הכרעת פולה 09.09.** "שלוש" נכתב
                     כשבאמת היו שלוש; האונבורדינג עבר לשש, והמספר נשאר
                     והפך להצהרה שגויה. ניסוח בלי מספר נשאר נכון בשתי
                     הגרסאות. */
                  <>
                    {t("timOnly.planningFirst")}
                    <div className="bubble__note">{t("timOnly.planningAsk")}</div>
                    <div className="bubble__note">{t("timOnly.planningHint")}</div>
                  </>
                ) : turn.reply === null ? (
                  <Thinking className="bubble__typing" />
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
                    {/* ⚠️ הסיבה שהשרת מסר, ולא רק הקטגוריה. `upstream` מכנס
                        חמש תקלות שונות למשפט אחד, והפרט שמפריד ביניהן הגיע
                        בתשובה ונזרק. זו אותה נפילה שקטה שהכלל אוסר — והיא
                        עלתה עשר דקות של ניחושים בעלייה הראשונה לאוויר.

                        הטקסט מגיע מהפונקציה שלנו, שמוחקת ממנו מחרוזות שנראות
                        כמו מפתח לפני שהוא יוצא (`upstreamReason`). */}
                    {turn.reply.detail && (
                      <span className="bubble__note">
                        {t("ask.timFailedDetail", { detail: turn.reply.detail })}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {/* ⚠️ רק כשיש reply. אין טעם להעיר על תשובה שעוד בדרך. */}
              {feedback && turn.reply !== null
                ? feedback.renderNote({
                    id: turn.id,
                    question: turn.question,
                    // ⚠️ שלושת המצבים מקבלים מילה. "" היה נקרא כתשובה ריקה.
                    answer:
                      turn.reply === "clarify"
                        ? "[טים שאל חזרה במקום לענות]"
                        : turn.reply.status === "ok"
                          ? turn.reply.answer
                          : `[שגיאה: ${turn.reply.reason}]`,
                  })
                : null}
            </div>
          </div>
        ))}

        {feedback ? feedback.footer : null}

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
