import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { bySlug } from "../data";
import { REQUIRED_FIELDS, type Experience } from "../data/schema";
import { Facts, Ticket, Trust } from "../components/Facts";

/** Which required fields this experience still has no value for. */
function missingFields(e: Experience): string[] {
  return REQUIRED_FIELDS.filter((f) => {
    if (f === "intensity") return !e.intensity.rated;
    if (f === "heightRequirementCm") return e.heightRequirementCm === null && !e.noHeightLimit;
    const v = e[f as keyof Experience];
    return v === null || v === "";
  });
}

export function ExperiencePage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const experience = slug ? bySlug(slug) : undefined;

  if (!experience) return <main className="page"><p>404</p></main>;

  const missing = missingFields(experience);
  const complete = REQUIRED_FIELDS.length - missing.length;

  return (
    <main className="page">
      <nav className="crumbs">
        <Link to="/">{t("nav.home")}</Link>
        <span>·</span>
        <Link to={`/park/${encodeURIComponent(experience.park)}`} className="en">{experience.park}</Link>
      </nav>

      <header className="detail-head">
        <h1 className="en">{experience.nameEn}</h1>
        {experience.nameHe ? (
          <p className="detail-head__he">{experience.nameHe}</p>
        ) : (
          <span className="chip chip--missing">{t("facts.noHebrewName")}</span>
        )}
        <div className="detail-head__meta">
          <span className="chip"><span className="en">{experience.land}</span></span>
          <span className="chip">{experience.subtype}</span>
          {experience.status.state === "open" && <span className="chip chip--open">● {t("facts.open")}</span>}
          {experience.status.state !== "open" && (
            <span className="chip chip--warn">{t("card.checkStatus")}</span>
          )}
        </div>
        {experience.status.note && <p className="detail-head__status en">{experience.status.note}</p>}
      </header>

      <section className="block">
        <h2>{t("facts.title")}</h2>
        <Facts experience={experience} />
      </section>

      <section className="block">
        <h2>{t("ticket.title")}</h2>
        <Ticket experience={experience} />
      </section>

      <section className="block">
        <h2>{t("trust.title")}</h2>
        <Trust experience={experience} />
        <div className="completeness">
          <span className="meter">
            <i style={{ inlineSize: `${Math.round((complete / REQUIRED_FIELDS.length) * 100)}%` }} />
          </span>
          <span>
            {missing.length === 0
              ? t("trust.complete")
              : `${t("trust.missingTitle")}: ${missing.length} — ${missing
                  .map((f) => t(`facts.${f === "heightRequirementCm" ? "height"
                    : f === "officialMotionSicknessWarning" ? "motionWarning"
                    : f === "nameHe" ? "unknown" : f === "durationMinutes" ? "duration"
                    : f === "openedYear" ? "opened" : f === "airConditioned" ? "airConditioned"
                    : f === "getsWet" ? "getsWet" : f}`))
                  .join(" · ")}`}
          </span>
        </div>
      </section>
    </main>
  );
}
