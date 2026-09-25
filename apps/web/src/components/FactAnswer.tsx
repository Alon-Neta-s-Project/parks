import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Experience } from "../data/schema";
import type { FactKey } from "../lib/intent";

/**
 * The answer to a pointed factual question, straight from the row.
 *
 * Every line traces to a column, and where the column is empty it says so
 * rather than reaching for anything else. The date is shown; the source never
 * is, by decision.
 */
export function FactAnswer({ experience, fact }: { experience: Experience; fact: FactKey | null }) {
  const { t } = useTranslation();

  const value = (key: FactKey): string => {
    switch (key) {
      case "height":
        return experience.heightRequirementCm === null
          ? t("ask.noData")
          : experience.heightRequirementCm === 0
            ? t("facts.noHeight")
            : t("facts.heightCm", { cm: experience.heightRequirementCm });
      case "intensity":
        return experience.intensity.rated
          ? `${experience.intensity.value} / 4`
          : t("facts.unrated");
      case "nausea":
        return experience.motionSicknessWarning === "true" ? t("facts.motionYes")
          : experience.motionSicknessWarning === "false" ? t("facts.motionNo")
          : experience.motionSicknessWarning === "na" ? t("facts.na")
          : t("ask.noData");
      case "wet":
        return experience.getsWet ? t(`facts.wet_${experience.getsWet}`) : t("ask.noData");
      case "duration":
        return experience.durationMinutes === null
          ? t("ask.noData")
          : t("facts.minutes", { n: experience.durationMinutes });
      case "wheelchair":
        return experience.wheelchair
          ? t(`facts.wheelchair_${experience.wheelchair}`)
          : t("ask.noData");
      case "airConditioned":
        return experience.airConditioned === "true" ? t("facts.yes")
          : experience.airConditioned === "false" ? t("facts.no")
          : experience.airConditioned === "na" ? t("facts.na")
          : t("ask.noData");
      case "fastAccess":
        return experience.fastAccess.summary || t("ticket.noFastAccess");
    }
  };

  // With no specific fact named, lead with the three that decide whether a ride
  // is even an option for this group.
  const keys: FactKey[] = fact ? [fact] : ["intensity", "height", "nausea"];

  return (
    <div className="bubble bubble--tim">
      <strong className="en">{experience.nameEn}</strong>
      {experience.nameHe && <span className="factanswer__he"> · {experience.nameHe}</span>}
      <div className="facts" style={{ marginBlockStart: "var(--pw-s3)" }}>
        {keys.map((key) => (
          <div className="fact" key={key}>
            <span className="fact__k">{t(`ask.fact_${key}`)}</span>
            <span className="fact__v">{value(key)}</span>
          </div>
        ))}
      </div>
      <div className="cite num">{t("ask.checked", { date: experience.lastVerified })}</div>
      <Link className="deeplink" to={`/experience/${experience.id}`}>
        {t("card.fullPage")}
      </Link>
    </div>
  );
}
