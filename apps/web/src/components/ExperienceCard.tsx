import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Experience } from "../data/schema";
import type { Member } from "../lib/group";
import { dependsFor, uncheckedFor, type Sensitivity } from "../lib/sensitivity";
import { FitTag } from "./FitTag";
import { Intensity } from "./Intensity";

/**
 * One row per experience: three facts at most, per the design direction.
 * Everything else — the ticket wording, the status sentence and the date the
 * information was checked — sits behind a tap, so the list stays scannable.
 *
 * No source is shown anywhere, by decision: the product says when something was
 * checked, never what it was checked against.
 */
export function ExperienceCard({
  experience,
  members = [],
  sensitivities = [],
}: {
  experience: Experience;
  members?: Member[];
  /**
   * What this group asked Tim to watch for.
   *
   * ⚠️ Only these are marked. Printing every sensitivity under every ride would
   * bury the one that matters to this family under five that do not.
   */
  sensitivities?: Sensitivity[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { fastAccess, status } = experience;

  // ⚠️ A ride that reached this list is not flagged for anything the group
  // named — the filter already removed those. What is left to say is the part
  // the list cannot show by itself: which of those questions was never asked of
  // this ride, and which one has an answer that depends on the rider.
  const unchecked = uncheckedFor(experience, sensitivities);
  const depends = dependsFor(experience, sensitivities);
  const names = (list: Sensitivity[]) =>
    list.map((s) => t(`questions.sensitivities.${s}`)).join(" · ");

  return (
    <li className="exp">
      <button
        type="button"
        className="exp__main"
        aria-expanded={open}
        aria-label={t("card.detailsFor", { name: experience.nameEn })}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="exp__row">
          <span className="exp__n">{experience.nameEn}</span>
          <span className="exp__sub">{experience.subtype}</span>
        </span>
        <span className="exp__tags">
          <Intensity value={experience.intensity.value} />
          <FitTag experience={experience} members={members} />

          {fastAccess.singlePassRequired && (
            <span className="chip chip--warn">{t("card.singlePass")}</span>
          )}
          {fastAccess.system === "Multi Pass" && (
            <span className="chip chip--way">{t("card.multiPass")}</span>
          )}
          {fastAccess.system === null && <span className="chip">{t("card.noFastAccess")}</span>}
          {fastAccess.unconfirmed && (
            <span className="chip chip--missing">{t("card.unconfirmed")}</span>
          )}
          {status.state === "check" && (
            <span className="chip chip--warn">{t("card.checkStatus")}</span>
          )}
          {depends.length > 0 && (
            <span className="chip chip--way" title={t("sensitivity.transferNote")}>
              {t("sensitivity.depends", { list: names(depends) })}
            </span>
          )}
          {unchecked.length > 0 && (
            <span className="chip chip--missing">
              {t("sensitivity.unchecked", {
                count: unchecked.length,
                list: names(unchecked),
              })}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="detail">
          <dl>
            <dt>{t("ticket.admission")}</dt>
            <dd>{experience.admission}</dd>
            <dt>{t("ticket.fastAccess")}</dt>
            <dd>{experience.fastAccess.summary || t("ticket.noFastAccess")}</dd>
            {experience.status.note && (
              <>
                <dt>{t("card.statusNote")}</dt>
                <dd>{experience.status.note}</dd>
              </>
            )}
          </dl>

          {/* Freshness only. The export carries no source, by decision. */}
          <div className="detail__checked">
            <span className="detail__label num">
              {t("trust.checked", { date: experience.lastVerified })}
            </span>
          </div>

          <Link className="deeplink" to={`/experience/${experience.id}`}>
            {t("card.fullPage")}
          </Link>
        </div>
      )}
    </li>
  );
}
