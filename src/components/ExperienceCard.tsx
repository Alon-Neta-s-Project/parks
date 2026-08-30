import { useTranslation } from "react-i18next";
import type { Experience } from "../data/schema";
import { Intensity } from "./Intensity";

/**
 * One row per experience. Three facts at most, per the design direction —
 * intensity, how the queue works, and a flag only when there is one.
 */
export function ExperienceCard({ experience }: { experience: Experience }) {
  const { t } = useTranslation();
  const { fastAccess, status } = experience;

  return (
    <li className="exp">
      <span className="exp__row">
        <span className="exp__n">{experience.nameEn}</span>
        <span className="exp__sub">{experience.subtype}</span>
      </span>
      <span className="exp__tags">
        <Intensity value={experience.intensity.value} />

        {fastAccess.singlePassRequired && (
          <span className="chip chip--warn">{t("card.singlePass")}</span>
        )}
        {fastAccess.system === "Multi Pass" && (
          <span className="chip chip--way">{t("card.multiPass")}</span>
        )}
        {fastAccess.system === "None" && (
          <span className="chip">{t("card.noFastAccess")}</span>
        )}
        {fastAccess.unconfirmed && (
          <span className="chip chip--missing">{t("card.unconfirmed")}</span>
        )}

        {status.state === "check" && (
          <span className="chip chip--warn">{t("card.checkStatus")}</span>
        )}
      </span>
    </li>
  );
}
