import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Experience } from "../data/schema";
import { Intensity } from "./Intensity";

/**
 * One row per experience: three facts at most, per the design direction.
 * Everything else — the ticket wording, the status sentence, the sources and
 * their authority tier — sits behind a tap, so the list stays scannable without
 * the trust footer being dropped.
 */
export function ExperienceCard({ experience }: { experience: Experience }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { fastAccess, status } = experience;

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

          {fastAccess.singlePassRequired && (
            <span className="chip chip--warn">{t("card.singlePass")}</span>
          )}
          {fastAccess.system === "Multi Pass" && (
            <span className="chip chip--way">{t("card.multiPass")}</span>
          )}
          {fastAccess.system === "None" && <span className="chip">{t("card.noFastAccess")}</span>}
          {fastAccess.unconfirmed && (
            <span className="chip chip--missing">{t("card.unconfirmed")}</span>
          )}
          {status.state === "check" && (
            <span className="chip chip--warn">{t("card.checkStatus")}</span>
          )}
        </span>
      </button>

      {open && (
        <div className="detail">
          <dl>
            <dt>{t("card.admission")}</dt>
            <dd>{experience.admission}</dd>

            <dt>{t("card.fastAccess")}</dt>
            <dd>
              {fastAccess.summary}
              {fastAccess.notes && fastAccess.notes !== "N/A" && (
                <span className="detail__aside">{fastAccess.notes}</span>
              )}
            </dd>

            {status.note && (
              <>
                <dt>{t("card.statusNote")}</dt>
                <dd>{status.note}</dd>
              </>
            )}

            {experience.intensity.basis && (
              <>
                <dt>{t("card.intensity")}</dt>
                <dd>{experience.intensity.basis}</dd>
              </>
            )}
          </dl>

          <div className="detail__sources">
            <span className="detail__label">{t("card.sources")}</span>
            <ul>
              {experience.sources.map((source) => (
                <li key={source.url}>
                  <span className={source.tier === 1 ? "tier tier--t1" : "tier tier--t4"}>
                    {t(source.tier === 1 ? "card.tier1" : "card.tier4")}
                  </span>
                  <a href={source.url} target="_blank" rel="noreferrer noopener" className="en">
                    {source.url.replace(/^https?:\/\//, "")}
                  </a>
                </li>
              ))}
            </ul>
            <span className="detail__label">
              {t("card.verified", { date: experience.sourceVerifiedAt })}
            </span>
          </div>

          <div className="detail__missing">
            <b>{t("card.missingTitle")}</b>
            {t("card.missingList")}
          </div>
        </div>
      )}
    </li>
  );
}
