import { useTranslation } from "react-i18next";
import type { Member } from "../lib/group";
import type { Sensitivity } from "../lib/sensitivity";
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
  members = [],
  sensitivities = [],
}: {
  result: Result;
  includeUnrated: boolean;
  onToggleUnrated: () => void;
  members?: Member[];
  /** Passed through so each row can mark what was never checked for this group. */
  sensitivities?: Sensitivity[];
}) {
  /** With one park the name is already known and repeating it is noise. */
  const multiPark = new Set(result.groups.map((g) => g.park)).size > 1;
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
    notes.unconfirmedFastAccess > 0 ||
    notes.sensitivityUncheckedExcluded > 0 ||
    notes.condensedAway > 0;

  return (
    <div className="result">
      {result.groups.map((group) => (
        <section className="landgroup" key={`${group.park}/${group.land}`}>
          <header className="landgroup__head">
            <span className="landgroup__title">
              <b>{group.land}</b>
              {multiPark && <span className="landgroup__park">{group.park}</span>}
            </span>
            <span className="num">{group.items.length}</span>
          </header>
          <ul>
            {group.items.map((experience) => (
              <ExperienceCard
                key={experience.id}
                experience={experience}
                members={members}
                sensitivities={sensitivities}
              />
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
            {/* ⚠️ A short list is not the same sentence as "that is all there
                is". These rides were held back because nobody checked them for
                what the family asked to avoid, and the count is the difference
                between not knowing and there being none. */}
            {notes.sensitivityUncheckedExcluded > 0 && (
              <li>
                {t("sensitivity.excluded", {
                  count: notes.sensitivityUncheckedExcluded,
                })}
              </li>
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
            {notes.condensedAway > 0 && (
              <li>{t("notes.condensedAway", { count: notes.condensedAway })}</li>
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
