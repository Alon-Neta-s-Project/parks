import { useTranslation } from "react-i18next";
import type { Recommendation as Result } from "../lib/recommend";
import { ExperienceCard } from "./ExperienceCard";

/**
 * The answer. Grouped by land, with everything that would mislead the reader if
 * left unsaid stated underneath rather than quietly filtered away.
 */
export function Recommendation({
  result,
  includeUnrated,
  onToggleUnrated,
}: {
  result: Result;
  includeUnrated: boolean;
  onToggleUnrated: () => void;
}) {
  const { t } = useTranslation();
  const { notes } = result;

  if (result.total === 0) {
    return (
      <div className="result">
        <div className="bubble bubble--tim">
          {t("result.empty")}
          <div className="bubble__note">{t("result.emptyHint")}</div>
        </div>
      </div>
    );
  }

  const hasNotes =
    notes.unratedExcluded > 0 ||
    notes.unratedParks.length > 0 ||
    notes.singlePass.length > 0 ||
    notes.needsCheck.length > 0 ||
    notes.unconfirmedFastAccess > 0;

  return (
    <div className="result">
      {result.groups.map((group) => (
        <section className="landgroup" key={group.land}>
          <header className="landgroup__head">
            <b>{group.land}</b>
            <span className="num">{group.items.length}</span>
          </header>
          <ul>
            {group.items.map((experience) => (
              <ExperienceCard key={experience.id} experience={experience} />
            ))}
          </ul>
        </section>
      ))}

      {hasNotes && (
        <div className="notes">
          <h3>{t("notes.title")}</h3>
          <ul>
            {notes.unratedParks.length > 0 && (
              <li>{t("notes.unratedParks", { parks: notes.unratedParks.join(", ") })}</li>
            )}
            {notes.unratedExcluded > 0 && (
              <li>{t("notes.unratedExcluded", { count: notes.unratedExcluded })}</li>
            )}
            {notes.singlePass.length > 0 && (
              <li>
                <span>
                  {t("notes.singlePass", { count: notes.singlePass.length })}
                  {/* Each name isolated on its own, rather than joined into the
                      sentence — a run of Latin inside Hebrew drags the trailing
                      punctuation with it. */}
                  <span className="notes__names">
                    {notes.singlePass.map((e) => (
                      <span className="en" key={e.id}>
                        {e.nameEn}
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            )}
            {notes.needsCheck.length > 0 && (
              <li>{t("notes.needsCheck", { count: notes.needsCheck.length })}</li>
            )}
            {notes.unconfirmedFastAccess > 0 && (
              <li>{t("notes.unconfirmed", { count: notes.unconfirmedFastAccess })}</li>
            )}
          </ul>
        </div>
      )}

      <div className="options" style={{ paddingInlineStart: 0 }}>
        {(includeUnrated || notes.unratedExcluded > 0) && (
          <button type="button" className="option" onClick={onToggleUnrated}>
            {includeUnrated
              ? t("result.hideUnrated")
              : t("result.showUnrated", { count: notes.unratedExcluded })}
          </button>
        )}
      </div>

      {result.verifiedAt && (
        <p className="thinking" style={{ paddingInlineStart: 0 }}>
          {t("result.verified", { date: result.verifiedAt })}
        </p>
      )}
    </div>
  );
}
