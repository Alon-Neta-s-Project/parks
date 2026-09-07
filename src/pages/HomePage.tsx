import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Orb } from "../components/Orb";
import { useContent } from "../data/content";

/**
 * מסך הכניסה, לפי `design/canvas/TimHomeLaylaInspired.dc.html`.
 *
 * ⚠️ **מה שלא מומש מה-artboard, ובכוונה:** ברקע שלו יש תצלום טירה. אין
 * לנו את התמונה ואין הכרעה על זכויות, **ותמונה גנרית במקומה תהיה גרועה
 * מכלום** — היא מבטיחה משהו שאינו שלנו. במקומה נשאר הרקע הקרם והזוהר
 * של טים, שהם ממילא מה שנושא את המסך.
 *
 * ⚠️ **וכל הערכים מהטוקנים ולא מה-artboard.** ה-artboard כותב #2B2420
 * ישירות; כאן זה `--pw-ink`. צבע קשיח ברכיב הוא הדרך שבה ערכת נושא
 * מפסיקה להיות ערכת נושא.
 */
export function HomePage() {
  const { coverage, parks } = useContent();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");

  /** ⚠️ שאלה ריקה אינה שאלה. */
  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    navigate(`/chat?q=${encodeURIComponent(q)}`);
  };

  return (
    <main className="page home">
      <header className="greet">
        <Orb large />
        {/* ⚠️ הכותרת נשברת לשתי שורות בניסוח עצמו, כמו ב-artboard. */}
        <h1 className="greet__title">{t("home.heroTitle")}</h1>
        <p className="greet__lead">{t("home.heroLead")}</p>

        <form
          className="composer"
          onSubmit={(e) => { e.preventDefault(); ask(draft); }}
        >
          <input
            className="composer__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("home.composerPlaceholder")}
            aria-label={t("home.composerPlaceholder")}
          />
          <button type="submit" className="composer__send" aria-label={t("ask.send")}>
            {/* ⚠️ אייקון כיווני, לא תו חץ. ראה ההערה ב-Chat.tsx. */}
            <svg className="icon-dir" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor"
                    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>

        <div className="chips">
          {[t("home.chip1"), t("home.chip2")].map((c) => (
            <button key={c} type="button" className="chip" onClick={() => ask(c)}>
              {c}
            </button>
          ))}
        </div>

        <p className="greet__trust">{t("home.trust")}</p>
      </header>

      {/* ⚠️ שורת הפארקים היא ניווט, לא שיחה — הצ'יפים למעלה פותחים שיחה,
          זו פותחת מדריך. ההבחנה מסומנת ב-artboard במפורש. */}
      <section className="block">
        <h2 className="sect__title">{t("home.byParkTitle")}</h2>
        <p className="sect__lead">{t("home.byParkLead")}</p>
        <ul className="parkrail">
          {parks.map((park) => (
            <li key={park.name}>
              <Link to={`/park/${encodeURIComponent(park.name)}`} className="parkcard">
                <span className="parkcard__n en">{park.name}</span>
                <span className="parkcard__r en">{park.resort}</span>
                <span className="parkcard__s">{t("park.count", { count: park.count })}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="btn" to="/browse">{t("home.allParksCta")}</Link>
      </section>

      <section className="block block--how">
        <h2 className="sect__title">{t("home.howTitle")}</h2>
        <p>{t("home.how")}</p>
        <p className="num">{t("trust.checked", { date: coverage.verifiedAt })}</p>
      </section>
    </main>
  );
}
