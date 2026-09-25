import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Thinking } from "./Thinking";
import { useContent } from "../data/content";
import { clear, load, save } from "../lib/persist";
import {
  applyPatch,
  emptyProfile,
  numberedQuestions,
  questions,
  type Profile,
} from "../lib/profile";
import type { TFunction } from "i18next";
import { HEIGHT_ASK_BELOW_AGE, type Member } from "../lib/group";
import { GroupBuilder } from "./GroupBuilder";
import { acknowledge } from "../lib/acknowledge";
import { FactAnswer } from "./FactAnswer";
import { classify, findExperience, whichFact, type FactKey } from "../lib/intent";
import { askTim, type TimReply } from "../lib/tim";
import type { Experience } from "../data/schema";
import { recommend } from "../lib/recommend";
import { refinements } from "../lib/refine";
import { Orb } from "./Orb";
import { PathLine } from "./PathLine";
import { Recommendation } from "./Recommendation";

interface Turn {
  id: string;
  prompt: string;
  answer: string;
  /** Shown under Tim's line when the answer changed how he behaves. */
  reply?: string;
}

const restored = load();

export function Chat() {
  const { t } = useTranslation();
  const { coverage, parks: allParks } = useContent();
  const [params, setParams] = useSearchParams();
  const [started, setStarted] = useState(restored?.started ?? false);
  const [step, setStep] = useState(restored?.step ?? 0);
  const [profile, setProfile] = useState<Profile>(restored?.profile ?? emptyProfile);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draftParks, setDraftParks] = useState<string[]>(restored?.profile.parks ?? []);
  /**
   * מה שנבחר עד כה בשאלת בחירה-מרובה, לפני האישור.
   *
   * ⚠️ טיוטה ולא פרופיל. בחירה-מרובה נשמרת רק כשהמשתמש מאשרת: לחיצה על
   * צ'יפ שנייה מבטלת אותו, ואם כל לחיצה הייתה נכתבת לפרופיל, ביטול היה
   * משאיר ערך שהיא כבר הסירה.
   */
  const [draftMulti, setDraftMulti] = useState<string[]>([]);
  /** How many times each question has been put. Two is the ceiling. */
  const [asked, setAsked] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");
  /** Answers given before onboarding, so a question is never held hostage to it. */
  const [answered, setAnswered] = useState<
    { id: string; question: string; experience: Experience | null; fact: FactKey | null }[]
  >([]);
  const [resumed] = useState(Boolean(restored?.started));

  const question = questions[step];
  const onboardingDone = step >= questions.length;
  /**
   * The number the reader sees. A follow-up shows its parent's number, so the
   * counter never advances for a question that was never counted.
   */
  const stepNumber = Math.max(
    1,
    numberedQuestions.findIndex(
      (q) => q.id === (question?.followUpTo ?? question?.id),
    ) + 1,
  );
  /**
   * Which park is trip context, not a profile axis, so it is not one of the
   * three opening questions — it is asked once there is actually a day to plan.
   */
  const needsPark = onboardingDone && profile.parks.length === 0;
  const done = onboardingDone && !needsPark;

  const unmeasuredCount = profile.members.filter(
    (m) => m.age < HEIGHT_ASK_BELOW_AGE && m.heightCm === null,
  ).length;
  const result = useMemo(() => (done ? recommend(profile) : null), [done, profile]);

  useEffect(() => {
    save({ profile, step, started });
  }, [profile, step, started]);

  /**
   * Each new question or answer is a new set of buttons appearing below the
   * fold. Move focus to the first one so the conversation is operable from the
   * keyboard, and let a screen reader announce Tim's line as it arrives.
   */
  const optionsRef = useRef<HTMLDivElement>(null);
  /**
   * Set when the step changed because of typing rather than clicking.
   *
   * Pressing Enter in the composer starts the conversation, and moving focus to
   * the first option in the same keystroke let that same Enter land on the
   * button and answer question one by itself. Skipping the focus move for that
   * one transition fixes it without depending on event timing.
   */
  const skipFocus = useRef(false);
  useEffect(() => {
    if (!started) return;
    if (skipFocus.current) {
      skipFocus.current = false;
      return;
    }
    optionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [started, step, turns.length]);

  const reset = () => {
    clear();
    setStarted(false);
    setStep(0);
    setProfile(emptyProfile);
    setTurns([]);
    setDraftParks([]);
  };

  /**
   * Iron rule five is satisfied by asking, not by being answered.
   *
   * A skipped question is put once more if it still matters, and after that Tim
   * moves on with what he has and says outright what is missing. He does not
   * raise it again: there is a segment that does not plan by choice, and
   * pressing them is exactly what drives them away.
   */
  const skip = (questionId: string) => {
    const times = (asked[questionId] ?? 1) + 1;
    setAsked((current) => ({ ...current, [questionId]: times }));

    if (times > 2) {
      setProfile((current) => ({
        ...current,
        askedAndDropped: [...current.askedAndDropped, questionId],
      }));
      setTurns((current) => [
        ...current,
        {
          id: `${questionId}-dropped-${current.length}`,
          prompt: t(`questions.${questionId}.prompt`),
          answer: t("questions.skip"),
          reply: t("answers.droppedOk"),
        },
      ]);
      setStep((current) => current + 1);
    }
  };

  /**
   * Route what was typed by what it asks for, not by what we still want to know.
   *
   * A pointed question gets its answer immediately — it goes through the data
   * and never touches the profile, so there is nothing to gate it on. A request
   * to plan opens the three questions instead of producing something generic,
   * because a generic plan handed back to "plan me a day" is a failure rather
   * than a reasonable default.
   */
  /**
   * מה שטים ענה על שאלה פתוחה, לפי מזהה השאלה.
   *
   * ⚠️ נשמר לצד התמלול ולא בתוכו: התמלול הוא מה שהמשתמש אמרה ומה
   * שהנתונים ענו — שניהם מיידיים וּודאיים. תשובת המודל מגיעה מאוחר יותר
   * ועשויה לא להגיע כלל, ומיזוג השניים היה מטשטש איזה חלק מהמסך הוא
   * עובדה מהטבלה ואיזה הוא תשובה של מודל.
   */
  const [timAnswers, setTimAnswers] = useState<Record<string, TimReply | "asking">>({});

  /**
   * שאלה שהגיעה ממסך הכניסה.
   *
   * ⚠️ **נצרכת פעם אחת ונמחקת מה-URL.** אחרת רענון היה שואל את אותה
   * שאלה שוב — ועל נקודת קצה שעולה כסף, "שוב" הוא לא רק מציק.
   */
  const submit = (raw?: string) => {
    // ⚠️ הטקסט מתקבל כארגומנט ולא נקרא מ-state. שאלה שמגיעה מה-URL
    // מגיעה לפני ש-setDraft הספיק להתעדכן, וקריאה מה-state הייתה
    // שולחת את הערך הקודם — כלומר את השאלה הקודמת, או ריק.
    const text = (raw ?? draft).trim();
    if (!text) return;
    setDraft("");

    const intent = classify(text);
    if (intent === "planning") {
      skipFocus.current = true;
      setStarted(true);
      setAnswered((current) => [
        ...current,
        { id: `q${current.length}`, question: text, experience: null, fact: null },
      ]);
      return;
    }

    const experience = findExperience(text);
    const id = `q${answered.length}`;
    setAnswered((current) => [
      ...current,
      { id, question: text, experience, fact: whichFact(text) },
    ]);

    // ⚠️ טים נשאל **רק** את מה שהנתונים לא ענו עליו. עובדה על מתקן מסוים
    // נענית מהטבלה — מיידית, בחינם, ומדויקת יותר ממה שמודל היה אומר.
    // שליחת "מה גובה המינימום ב-X" למודל הייתה תשלום על תשובה פחות טובה.
    if (!experience) {
      setTimAnswers((current) => ({ ...current, [id]: "asking" }));
      askTim(text).then((reply) =>
        setTimAnswers((current) => ({ ...current, [id]: reply })),
      );
    }
  };

  const answer = (key: string, label: string, patch: Partial<Profile>, reply?: string) => {
    // ⚠️ נגזר מהפרופיל **שאחרי** התשובה ולא מזה שלפניה, אחרת המספר
    // שהמשפחה קוראת שייך לתשובה הקודמת שלה. והחישוב יושב כאן ולא בתוך
    // ה-setProfile: תופעת לוואי בתוך מעדכן־מצב נקראת פעמיים ב-StrictMode,
    // וכל תשובה הייתה נרשמת פעמיים ביומן.
    const next = applyPatch(profile, patch);
    const ack = reply ? null : acknowledge(key, next);
    const note = ack
      ? t(ack.key, { count: ack.count, total: ack.total, list: ack.list })
      : reply;

    setProfile(next);
    setTurns((current) => [
      ...current,
      {
        id: `${key}-${current.length}`,
        prompt: t(`questions.${key}.prompt`),
        answer: label,
        reply: note,
      },
    ]);
    setStep((current) => current + 1);
  };

  /**
   * A refinement is an answer like any other, so it lands in the same transcript.
   * If it would empty the list it is rolled back rather than applied — handing
   * back nothing is not a useful response to "something calmer".
   */
  const refine = (id: string) => {
    const option = refinements.find((r) => r.id === id);
    if (!option) return;

    const previous = result?.total ?? 0;
    const next = option.apply(profile);
    const total = recommend(next).total;

    const reply =
      total === 0
        ? t("refine.emptied")
        : total === previous
          ? t("refine.same", { count: total })
          : t("refine.changed", { count: total, previous });

    setTurns((current) => [
      ...current,
      { id: `${id}-${current.length}`, prompt: t("refine.prompt"), answer: t(`refine.${id}`), reply },
    ]);
    if (total > 0) setProfile(next);
  };

  /**
   * All ten parks, straight from the dataset. Asking which resort first was a
   * question whose answer the park choice already contains.
   */
  const offeredParks = allParks;

  const toggleUnrated = () =>
    setProfile((current) => ({ ...current, includeUnrated: !current.includeUnrated }));

  /**
   * שאלה שהגיעה ממסך הכניסה.
   *
   * ⚠️ **נצרכת פעם אחת ונמחקת מה-URL.** אחרת רענון היה שואל את אותה
   * שאלה שוב — ועל נקודת קצה שעולה כסף, "שוב" אינו רק מציק.
   */
  const fromUrl = params.get("q");
  useEffect(() => {
    if (!fromUrl) return;
    setParams({}, { replace: true });
    submit(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);

  return (
    <div className="thread" aria-live="polite" aria-atomic="false">
      <div className="msg">
        <Orb />
        <div className="bubble bubble--tim">
          <strong>{t("intro.greeting")}</strong>
          <p>{t("intro.body", { count: coverage.total })}</p>
          <div className="bubble__note">
            {resumed ? t("app.resume") : t("intro.honesty")}
          </div>
        </div>
      </div>

      {answered.map((a) => (
        <div key={a.id} className="exchange">
          <div className="msg msg--me">
            <div className="bubble bubble--me">{a.question}</div>
          </div>
          <div className="msg">
            <Orb />
            {a.experience ? (
              <FactAnswer experience={a.experience} fact={a.fact} />
            ) : (
              <TimBubble question={a.question} state={timAnswers[a.id]} />
            )}
          </div>
        </div>
      ))}

      {!started && (
        <>
          <div className="composer">
            <input
              className="composer__input"
              value={draft}
              placeholder={t("ask.placeholder")}
              aria-label={t("ask.placeholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                submit();
              }}
            />
            <button type="button" className="send" onClick={() => submit()} aria-label={t("ask.send")}>
              {/* ⚠️ אייקון כיווני, ולא תו חץ. חץ שנכתב כתו הוא החלטה
                  קשיחה על שפה — חץ שמאלה נכון בעברית ושגוי באנגלית, ודפדפן
                  אינו מהפך אותו לפי dir. הוא מצויר כאן בכיוון הקנוני
                  (ימינה) ומתהפך ב-[dir="rtl"] דרך scaleX(-1) ב-CSS,
                  כך שגרסה אנגלית לא תדרוש שינוי ברכיב. */}
              <svg className="icon-dir" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor"
                      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="options" ref={optionsRef}>
            <button type="button" className="option option--go" onClick={() => setStarted(true)}>
              {answered.length ? t("ask.startPlanning") : t("intro.start")}
            </button>
          </div>

          {/* Offered after an answer, never before it. */}
          {answered.some((a) => a.experience) && (
            <div className="msg">
              <Orb />
              <div className="bubble bubble--tim">{t("ask.thenPlan")}</div>
            </div>
          )}
        </>
      )}

      {started &&
        turns.map((turn) => (
          <div key={turn.id} className="exchange">
            <div className="msg">
              <Orb />
              <div className="bubble bubble--tim">
                {turn.prompt}
                {turn.reply && <div className="bubble__note">{turn.reply}</div>}
              </div>
            </div>
            <div className="msg msg--me">
              <div className="bubble bubble--me">{turn.answer}</div>
            </div>
          </div>
        ))}

      {started && needsPark && (
        <>
          <div className="msg">
            <Orb />
            <div className="bubble bubble--tim">{t("questions.parks.contextPrompt")}</div>
          </div>
          <div className="options" ref={optionsRef}>
            {offeredParks.map((park) => {
              const chosen = draftParks.includes(park.name);
              return (
                <button
                  type="button"
                  key={park.name}
                  className="option"
                  aria-pressed={chosen}
                  onClick={() =>
                    setDraftParks((current) =>
                      chosen ? current.filter((n) => n !== park.name) : [...current, park.name],
                    )
                  }
                >
                  <span className="en">{park.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="option option--go"
              disabled={draftParks.length === 0}
              onClick={() => setProfile((c) => ({ ...c, parks: draftParks }))}
            >
              {t("questions.parks.confirm")}
            </button>
          </div>
        </>
      )}

      {started && question && (
        <>
          <div className="msg">
            <Orb />
            <div className="bubble bubble--tim">
              {t(`questions.${question.id}.prompt`)}
              {/* ⚠️ נגזר מהשאלה ולא מ-id קשיח. הבדיקה "האם זו שאלת הקבוצה"
                  הייתה משאירה כל שאלה חדשה בלי ההסבר שלה — והשאלה הבאה
                  שנוספה, הרגישויות, היא בדיוק כזו: היא שואלת דבר אישי
                  וההסבר למה הוא הדבר שמצדיק לשאול. */}
              {question.why && (
                <div className="bubble__note">{t(`questions.${question.id}.why`)}</div>
              )}
            </div>
          </div>

          {question.kind === "members" ? (
            <div className="options" ref={optionsRef}>
              <GroupBuilder
                onConfirm={(members: Member[]) =>
                  answer("group", summariseGroup(members, t), { members })
                }
                onSkip={() => skip("group")}
              />
            </div>
          ) : question.multi ? (
            /* ⚠️ בחירה מרובה. `multi` היה מוגדר בטיפוס ולא ממומש בשום מקום —
               שאלה שסומנה כך הייתה מתנהגת כבחירה יחידה בשקט, כלומר משפחה
               שאוהבת גם רכבות וגם מתקנים קלילים הייתה מאבדת אחת מהשתיים. */
            <div className="options" ref={optionsRef}>
              {question.options?.map((option) => {
                const chosen = draftMulti.includes(option.id);
                return (
                  <button
                    type="button"
                    key={option.id}
                    className="option"
                    aria-pressed={chosen}
                    onClick={() =>
                      setDraftMulti((current) => {
                        if (chosen) return current.filter((id) => id !== option.id);
                        // ⚠️ תשובה בלעדית מנקה את השאר, וכל שאר התשובות
                        // מנקות אותה. "אין רגישויות" לצד "פחד מחושך" אינן
                        // העדפה — הן שתי טענות סותרות על אותו ילד, ומיזוג
                        // שקט היה בוחר אחת מהן בלי שאיש יראה.
                        if (option.exclusive) return [option.id];
                        const exclusives = new Set(
                          question.options?.filter((o) => o.exclusive).map((o) => o.id),
                        );
                        return [...current.filter((id) => !exclusives.has(id)), option.id];
                      })
                    }
                  >
                    {t(`questions.${question.id}.${option.id}`)}
                  </button>
                );
              })}
              <button
                type="button"
                className="option option--go"
                disabled={draftMulti.length === 0}
                onClick={() => {
                  // ⚠️ ה-patch נבנה מכל מה שנבחר, ולא מהאופציה האחרונה.
                  // כל אופציה נושאת מערך בן איבר אחד, ואיחודם הוא התשובה.
                  const merged: Record<string, string[]> = {};
                  for (const id of draftMulti) {
                    const patch = question.options?.find((o) => o.id === id)?.patch ?? {};
                    for (const [field, value] of Object.entries(patch)) {
                      if (Array.isArray(value)) {
                        merged[field] = [...(merged[field] ?? []), ...(value as string[])];
                      }
                    }
                  }
                  const label = draftMulti
                    .map((id) => t(`questions.${question.id}.${id}`))
                    .join(" · ");
                  setDraftMulti([]);
                  answer(question.id, label, merged as Partial<Profile>);
                }}
              >
                {t(`questions.${question.id}.confirm`)}
              </button>
              <button type="button" className="ghost" onClick={() => skip(question.id)}>
                {t("questions.skip")}
              </button>
            </div>
          ) : question.source === "parks" ? (
            <div className="options" ref={optionsRef}>
              {offeredParks.map((park) => {
                const chosen = draftParks.includes(park.name);
                return (
                  <button
                    type="button"
                    key={park.name}
                    className="option"
                    aria-pressed={chosen}
                    aria-label={`${park.name} — ${t("questions.parks.ratedNote", { rated: park.rated, count: park.count })}`}
                    onClick={() =>
                      setDraftParks((current) =>
                        chosen ? current.filter((name) => name !== park.name) : [...current, park.name],
                      )
                    }
                  >
                    <span className="en">{park.name}</span>
                    <small>
                      {t("questions.parks.ratedNote", { rated: park.rated, count: park.count })}
                    </small>
                  </button>
                );
              })}
              <button
                type="button"
                className="option option--go"
                disabled={draftParks.length === 0}
                onClick={() => answer("parks", draftParks.join(" · "), { parks: draftParks })}
              >
                {t("questions.parks.confirm")}
              </button>
            </div>
          ) : (
            <div className="options" ref={optionsRef}>
              {question.options?.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className="option"
                  onClick={() =>
                    answer(
                      question.id,
                      t(`questions.${question.id}.${option.id}`),
                      option.patch,
                      // ⚠️ שאלת planningFocus ירדה, ואיתה משפט האישור שנלווה
                      // אליה. השארתי כאן undefined ולא ניסוח חלופי: אישור על
                      // שאלה שלא נבדק שהוא מוסיף בה משהו הוא רעש, וכשדנה
                      // תפרסם ניסוח סופי הוא ייכנס דרך he.json.
                      undefined,
                    )
                  }
                >
                  {t(`questions.${question.id}.${option.id}`)}
                </button>
              ))}
              <button type="button" className="ghost" onClick={() => skip(question.id)}>
                {t("questions.skip")}
              </button>
            </div>
          )}
        </>
      )}

      {done && result && (
        <>
          <div className="msg">
            <Orb />
            <div className="bubble bubble--tim">
              <strong>{t("result.heading")}</strong>
              <p>{t("result.summary", { count: result.total })}</p>
              <p>{t("result.grouped")}</p>
              {/* Iron rule five: recommend with what is known, and name the gap
                  outright rather than going quiet about it. */}
              {unmeasuredCount > 0 && (
                <div className="bubble__note">
                  {t("answers.missing")}{" "}
                  {t("answers.missingHeightFor", { count: unmeasuredCount })}
                </div>
              )}
            </div>
          </div>

          <Recommendation
            result={result}
            includeUnrated={profile.includeUnrated}
            onToggleUnrated={toggleUnrated}
            members={profile.members}
            sensitivities={profile.sensitivities}
          />

          <div className="coverage">
            <span className="meter">
              <i style={{ inlineSize: `${Math.round((coverage.rated / coverage.total) * 100)}%` }} />
            </span>
            <span>
              {t("coverage.intensity", { rated: coverage.rated, total: coverage.total })} ·{" "}
              {t("coverage.detail")}
            </span>
          </div>

          <div className="msg">
            <Orb />
            <div className="bubble bubble--tim">{t("refine.prompt")}</div>
          </div>
          <div className="options">
            {refinements
              .filter((option) => option.offered(profile))
              .map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className="option"
                  onClick={() => refine(option.id)}
                >
                  {t(`refine.${option.id}`)}
                </button>
              ))}
            <button type="button" className="ghost" onClick={reset}>
              {t("app.restart")}
            </button>
          </div>
        </>
      )}

      {started && !done && (
        <div className="thinking">
          <PathLine />
          <span className="num">
            {/*
              ⚠️ Numbered over the six, not over the array. The sensitivity
              follow-up rides along with the group question and must not push
              this to "7/6" — it is a follow-up that was kept, not a seventh
              question. `stepNumber` holds at the group question's number while
              the follow-up is on screen.
            */}
            {stepNumber} / {numberedQuestions.length}
          </span>
        </div>
      )}
    </div>
  );
}

/** A short, name-free description of the group, for the transcript. */
function summariseGroup(members: Member[], t: TFunction): string {
  const adults = members.filter((m) => m.age >= HEIGHT_ASK_BELOW_AGE).length;
  const children = members.filter((m) => m.age < HEIGHT_ASK_BELOW_AGE);
  const parts: string[] = [];
  if (adults) parts.push(`${adults} ${t("questions.group.addAdult")}`);
  for (const c of children) parts.push(t("questions.group.member_child", { age: c.age }));
  return parts.join(" · ");
}

/**
 * מה שמופיע כשהנתונים לא ענו.
 *
 * ⚠️ כישלון נראה, ואינו נופל בשקט אל "לא מצאתי". לכל סיבה טקסט משלה, כי
 * "אין לי את זה" ו"נגמרה המכסה להיום" מובילים את המשתמש לשני דברים
 * שונים לגמרי. זה אותו כלל שהמסד אוכף: אין נפילה שקטה.
 */
function TimBubble({ question, state }: { question: string; state?: TimReply | "asking" }) {
  const { t } = useTranslation();
  if (classify(question) === "planning") {
    return <div className="bubble bubble--tim">{t("ask.planningFirst")}</div>;
  }
  if (state === "asking") {
    return (
      <div className="bubble bubble--tim"><Thinking /></div>
    );
  }
  if (state?.status === "ok") {
    return <div className="bubble bubble--tim">{state.answer}</div>;
  }
  if (state?.status === "failed") {
    return (
      <div className="bubble bubble--tim">{t(`ask.timFailed.${state.reason}`)}</div>
    );
  }
  return <div className="bubble bubble--tim">{t("ask.notFound")}</div>;
}
