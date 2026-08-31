import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { coverage, parks as allParks } from "../data";
import { clear, load, save } from "../lib/persist";
import { applyPatch, emptyProfile, questions, type Profile } from "../lib/profile";
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
  const [started, setStarted] = useState(restored?.started ?? false);
  const [step, setStep] = useState(restored?.step ?? 0);
  const [profile, setProfile] = useState<Profile>(restored?.profile ?? emptyProfile);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draftParks, setDraftParks] = useState<string[]>(restored?.profile.parks ?? []);
  const [resumed] = useState(Boolean(restored?.started));

  const question = questions[step];
  const done = step >= questions.length;
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
  useEffect(() => {
    if (!started) return;
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

  const answer = (key: string, label: string, patch: Partial<Profile>, reply?: string) => {
    setProfile((current) => applyPatch(current, patch));
    setTurns((current) => [
      ...current,
      { id: `${key}-${current.length}`, prompt: t(`questions.${key}.prompt`), answer: label, reply },
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

      {!started && (
        <div className="options" ref={optionsRef}>
          <button type="button" className="option option--go" onClick={() => setStarted(true)}>
            {t("intro.start")}
          </button>
        </div>
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

      {started && question && (
        <>
          <div className="msg">
            <Orb />
            <div className="bubble bubble--tim">
              {t(`questions.${question.id}.prompt`)}
              {question.id === "intensity" && (
                <div className="bubble__note">{t("questions.intensity.note")}</div>
              )}
            </div>
          </div>

          {question.source === "parks" ? (
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
                      undefined,
                    )
                  }
                >
                  {t(`questions.${question.id}.${option.id}`)}
                </button>
              ))}
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
              <div className="bubble__note">
                {t("answers.missing")} <strong>{t("answers.missingFields")}</strong>{" "}
                {t("answers.missingTail")}
              </div>
            </div>
          </div>

          <Recommendation
            result={result}
            includeUnrated={profile.includeUnrated}
            onToggleUnrated={toggleUnrated}
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
            {step + 1} / {questions.length}
          </span>
        </div>
      )}
    </div>
  );
}
