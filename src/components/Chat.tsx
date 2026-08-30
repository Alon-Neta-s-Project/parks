import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { coverage, parks as allParks } from "../data";
import { applyPatch, emptyProfile, questions, type Profile } from "../lib/profile";
import { recommend } from "../lib/recommend";
import { Orb } from "./Orb";
import { PathLine } from "./PathLine";
import { Recommendation } from "./Recommendation";

interface Turn {
  /** Which question produced this exchange, for keying and for going back. */
  key: string;
  prompt: string;
  answer: string;
  /** Shown under Tim's reply when the answer changes how he behaves. */
  reply?: string;
}

export function Chat() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draftParks, setDraftParks] = useState<string[]>([]);

  const question = questions[step];
  const done = step >= questions.length;
  const result = useMemo(() => (done ? recommend(profile) : null), [done, profile]);

  const reset = () => {
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
      { key, prompt: t(`questions.${key}.prompt`), answer: label, reply },
    ]);
    setStep((current) => current + 1);
  };

  /** Parks are offered from the dataset, narrowed by the chosen resort. */
  const offeredParks = useMemo(
    () =>
      allParks.filter((park) =>
        profile.resort === "both" || profile.resort === null
          ? true
          : park.resort === profile.resort,
      ),
    [profile.resort],
  );

  const toggleUnrated = () =>
    setProfile((current) => ({ ...current, includeUnrated: !current.includeUnrated }));

  return (
    <div className="thread">
      <div className="msg">
        <Orb />
        <div className="bubble bubble--tim">
          <strong>{t("intro.greeting")}</strong>
          <p>{t("intro.body", { count: coverage.total })}</p>
          <div className="bubble__note">{t("intro.honesty")}</div>
        </div>
      </div>

      {!started && (
        <div className="options">
          <button type="button" className="option option--go" onClick={() => setStarted(true)}>
            {t("intro.start")}
          </button>
        </div>
      )}

      {started &&
        turns.map((turn) => (
          <div key={turn.key}>
            <div className="msg">
              <Orb />
              <div className="bubble bubble--tim">
                {turn.prompt}
                {turn.reply && <div className="bubble__note">{turn.reply}</div>}
              </div>
            </div>
            <div className="msg msg--me" style={{ marginBlockStart: "var(--pw-s3)" }}>
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
              {question.id === "group" && (
                <div className="bubble__note">{t("questions.group.note")}</div>
              )}
            </div>
          </div>

          {question.source === "parks" ? (
            <div className="options">
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
                        chosen
                          ? current.filter((name) => name !== park.name)
                          : [...current, park.name],
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
                onClick={() =>
                  answer("parks", draftParks.join(" · "), { parks: draftParks })
                }
              >
                {t("questions.parks.confirm")}
              </button>
            </div>
          ) : (
            <div className="options">
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
                      // The one place Tim's behaviour visibly forks: a group that
                      // said it prefers to improvise is not pushed into a plan.
                      option.id === "flows" || option.id === "plans"
                        ? t(`answers.${option.id}`)
                        : undefined,
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

          <div className="options" style={{ paddingInlineStart: 0 }}>
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
