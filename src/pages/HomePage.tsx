import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Orb } from "../components/Orb";
import { useContent } from "../data/content";

/**
 * מסך הכניסה, לפי `design/canvas/TimHomeLaylaInspired.dc.html`.
 *
 * ⚠️ **תצלום הטירה מאושר** (דנה, 07.09 — מאגר חינמי, בלי דרישת קרדיט),
 * ולכן הוא מומש כמו ב-artboard ובלי שורת ייחוס.
 *
 * ⚠️ **שלוש תמונות הפארקים שבמסילה — לא מומשו.** האישור ניתן לתצלום
 * הטירה בלבד, ויש ב-artboard שלוש תמונות לעשרה פארקים. הכלל שנקבע הוא
 * תמונה מזהה־פארק **ספציפית** בכל מקום ששם פארק מופיע, ואיסור על תמונה
 * כפולה — כלומר שלוש תמונות אינן "התחלה", הן הפרה.
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
        {/*
          ⚠️ **שתי שכבות ההצללה הן תיקון קריאוּת, לא קישוט** (נטע, 03.09,
          סבב 3): ההצללה הקודמת התחילה רק ב-430 הפיקסלים התחתונים, והשורות
          הראשונות של הכותרת ישבו כמעט ישירות על פרטי הטירה. הרמפה מתחילה
          מוקדם יותר ותלולה יותר, כדי שהניגודיות כבר תיבנה כשהטקסט מתחיל.

          ⚠️ ו-aria-hidden: התמונה דקורטיבית. alt תיאורי היה מוקרא למי
          שמשתמש בקורא מסך בלי שהוא מוסיף מידע.
        */}
        <div className="greet__bg" aria-hidden="true">
          <img src="/home-hero.jpg" alt="" className="greet__photo" />
          <div className="greet__veil greet__veil--top" />
          <div className="greet__veil greet__veil--bottom" />
        </div>
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
                {/* ⚠️ הקובץ נקרא לפי ה-slug של הפארק ולא לפי מפת שמות.
                    מפה הייתה מסמך שלישי שצריך לתחזק, ומסמך כזה מתיישן
                    בשקט — פארק שישנה שם היה מקבל תמונה של פארק אחר.

                    ⚠️ ו-onError מסתיר את התמונה במקום להשאיר אייקון
                    שבור: הכרטיס נבנה כך שהוא שלם גם בלי תמונה, ולכן
                    תמונה חסרה מורידה קישוט ולא הופכת שורה לתקולה.
                    alt ריק בכוונה — התמונה דקורטיבית, והשם כתוב לידה. */}
                <img
                  className="parkcard__img"
                  src={`/parks/${park.slug}.webp`}
                  alt=""
                  loading="lazy"
                  width={400}
                  height={260}
                  onError={(e) => {
                    e.currentTarget.hidden = true;
                  }}
                />
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
