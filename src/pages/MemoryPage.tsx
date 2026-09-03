import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HEIGHT_ASK_BELOW_AGE, type Member } from "../lib/group";
import { clear as clearSession, load, save } from "../lib/persist";
import { emptyProfile, type Profile } from "../lib/profile";

/**
 * "What Tim knows about me" — visible, editable, deletable.
 *
 * This is the safety net for the group description arriving as one sentence:
 * "me, my husband and three kids aged 4, 7 and 11" has to become five rows, and
 * when that extraction gets something wrong this is where it is corrected. So
 * every row is editable and removable on its own, never only as a set.
 *
 * It also states what is deliberately not stored, because a page that only lists
 * what was kept invites the question of what else was.
 */
export function MemoryPage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile>(load()?.profile ?? emptyProfile);

  const persist = (next: Profile) => {
    setProfile(next);
    const current = load();
    save({ profile: next, step: current?.step ?? 0, started: current?.started ?? false });
  };

  const updateMember = (id: string, patch: Partial<Member>) =>
    persist({
      ...profile,
      members: profile.members.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });

  const removeMember = (id: string) =>
    persist({ ...profile, members: profile.members.filter((m) => m.id !== id) });

  const nothingKnown =
    profile.members.length === 0 &&
    profile.attractionTypes.length === 0 &&
    profile.worlds.length === 0 &&
    profile.parkDays === null &&
    profile.visitStyle === null &&
    profile.dates === null &&
    profile.parks.length === 0;

  return (
    <main className="page">
      <header className="hero hero--tight">
        <h1>{t("memory.title")}</h1>
        <p>{t("memory.lead")}</p>
      </header>

      {nothingKnown ? (
        <div className="empty">
          <p>{t("memory.empty")}</p>
          <p className="muted">{t("memory.emptyHint")}</p>
        </div>
      ) : (
        <>
          <section className="block">
            <h2>{t("memory.group")}</h2>
            {profile.members.length === 0 ? (
              <p className="muted">{t("memory.unset")}</p>
            ) : (
              <ul className="group__list">
                {profile.members.map((m) => (
                  <li key={m.id} className="member">
                    <label className="member__field">
                      <span className="member__why">{t("memory.editAge")}</span>
                      <input
                        type="number"
                        className="finput"
                        value={m.age}
                        min={0}
                        max={120}
                        aria-label={t("memory.editAge")}
                        onChange={(e) => updateMember(m.id, { age: Number(e.target.value) })}
                      />
                    </label>

                    {/* Height is only ever kept below 14, and the page says why. */}
                    {m.age < HEIGHT_ASK_BELOW_AGE && (
                      <label className="member__field">
                        <span className="member__why">{t("memory.editHeight")}</span>
                        <input
                          type="number"
                          className="finput"
                          value={m.heightCm ?? ""}
                          min={40}
                          max={200}
                          aria-label={t("memory.editHeight")}
                          onChange={(e) =>
                            updateMember(m.id, {
                              heightCm: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </label>
                    )}

                    <button
                      type="button"
                      className="member__x"
                      aria-label={t("memory.removeMember")}
                      onClick={() => removeMember(m.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted" style={{ marginBlockStart: "var(--pw-s3)" }}>
              {t("memory.heightWhy")}
            </p>
          </section>

          <section className="block">
            <h2>{t("memory.preferences")}</h2>
            <div className="facts">
              {/* ⚠️ כל שדה שלא נענה מוצג כ"עוד לא נאמר" ולא מוסתר. מסך
                  שמראה רק את מה שידוע נראה מלא גם כשהוא ריק, והמשתמשת אינה
                  יכולה לדעת מה טים בכלל שאל. */}
              <div className="fact">
                <span className="fact__k">{t("memory.attractionTypes")}</span>
                <span className="fact__v">
                  {profile.attractionTypes.length
                    ? profile.attractionTypes
                        .map((id) => t(`questions.attractionTypes.${id}`))
                        .join(" · ")
                    : t("memory.unset")}
                </span>
              </div>
              <div className="fact">
                <span className="fact__k">{t("memory.worlds")}</span>
                <span className="fact__v">
                  {profile.worlds.length
                    ? profile.worlds
                        .map((id) => t(`questions.worlds.${id}`, { defaultValue: id }))
                        .join(" · ")
                    : t("memory.unset")}
                </span>
              </div>
              <div className="fact">
                <span className="fact__k">{t("memory.parkDays")}</span>
                <span className="fact__v">
                  {profile.parkDays === null
                    ? t("memory.unset")
                    : profile.parkDays === "unsure"
                      ? t("questions.parkDays.unsure")
                      : t("memory.parkDays_n", { days: profile.parkDays })}
                </span>
              </div>
              <div className="fact">
                <span className="fact__k">{t("memory.visitStyle")}</span>
                <span className="fact__v">
                  {profile.visitStyle
                    ? t(`questions.visitStyle.${profile.visitStyle}`)
                    : t("memory.unset")}
                </span>
              </div>
              <div className="fact">
                <span className="fact__k">{t("memory.dates")}</span>
                <span className="fact__v">
                  {profile.dates ? t(`questions.dates.${profile.dates}`) : t("memory.unset")}
                </span>
              </div>
              <div className="fact">
                <span className="fact__k">{t("memory.parks")}</span>
                <span className="fact__v en">
                  {profile.parks.length ? profile.parks.join(" · ") : t("memory.unset")}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="block block--how">
        <h2>{t("memory.notStored")}</h2>
        <p>{t("memory.notStoredList")}</p>
      </section>

      <div className="options" style={{ paddingInlineStart: 0 }}>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            clearSession();
            setProfile(emptyProfile);
          }}
        >
          {t("memory.clearAll")}
        </button>
      </div>
    </main>
  );
}
