import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HEIGHT_ASK_BELOW_AGE, needsHeight, type Member } from "../lib/group";

/**
 * Answering "who is coming, and how old" by building one row per person.
 *
 * Height is asked in the same breath as the age that makes it relevant, and only
 * under 14 — an adult clears every limit in the data. Asking later would mean
 * interrupting to ask again at every new ride, which is more intrusive than
 * asking once, not less.
 *
 * The reason is part of the question rather than decoration: asked about a child
 * with no explanation it reads as prying; with one it reads as sensible.
 */
export function GroupBuilder({
  onConfirm,
  onSkip,
}: {
  onConfirm: (members: Member[]) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<Member[]>([]);
  const [draftAge, setDraftAge] = useState("");

  const add = (age: number) =>
    setMembers((current) => [
      ...current,
      { id: `m${current.length}-${age}`, age, heightCm: null },
    ]);

  const setHeight = (id: string, cm: number | null) =>
    setMembers((current) => current.map((m) => (m.id === id ? { ...m, heightCm: cm } : m)));

  const remove = (id: string) =>
    setMembers((current) => current.filter((m) => m.id !== id));

  return (
    <div className="group">
      <ul className="group__list">
        {members.map((m) => (
          <li key={m.id} className="member">
            <span className="member__who">
              {m.age >= HEIGHT_ASK_BELOW_AGE
                ? t("questions.group.member_adult")
                : t("questions.group.member_child", { age: m.age })}
            </span>

            {needsHeight(m) ? (
              <label className="member__height">
                <span className="member__why">
                  {t("questions.group.heightPrompt", { age: m.age })}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={40}
                  max={200}
                  className="finput"
                  placeholder={t("questions.group.heightCm")}
                  aria-label={t("questions.group.heightCm")}
                  onChange={(e) =>
                    setHeight(m.id, e.target.value ? Number(e.target.value) : null)
                  }
                />
              </label>
            ) : (
              m.age < HEIGHT_ASK_BELOW_AGE && (
                <span className="chip chip--way num">{m.heightCm} ס״מ</span>
              )
            )}

            <button type="button" className="member__x" onClick={() => remove(m.id)}
                    aria-label={t("questions.group.remove")}>
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="group__add">
        <button type="button" className="option" onClick={() => add(30)}>
          + {t("questions.group.addAdult")}
        </button>
        <label className="group__age">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={17}
            className="finput"
            placeholder={t("questions.group.age")}
            aria-label={t("questions.group.age")}
            value={draftAge}
            onChange={(e) => setDraftAge(e.target.value)}
          />
          <button
            type="button"
            className="option"
            disabled={draftAge === ""}
            onClick={() => {
              add(Number(draftAge));
              setDraftAge("");
            }}
          >
            + {t("questions.group.addChild")}
          </button>
        </label>
      </div>

      <div className="options" style={{ paddingInlineStart: 0 }}>
        <button
          type="button"
          className="option option--go"
          disabled={members.length === 0}
          onClick={() => onConfirm(members)}
        >
          {t("questions.group.confirm")}
        </button>
        {/* Skipping is a real choice, not a failure state. */}
        <button type="button" className="ghost" onClick={onSkip}>
          {t("questions.group.skip")}
        </button>
      </div>
    </div>
  );
}
