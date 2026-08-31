import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { coverage, parks } from "../data";

export function HomePage() {
  const { t } = useTranslation();
  return (
    <main className="page">
      <header className="hero">
        <h1>{t("home.title")}</h1>
        <p>{t("home.lead", { count: coverage.total })}</p>
        <div className="hero__actions">
          <Link className="btn btn--primary" to="/chat">{t("home.askTim")}</Link>
          <Link className="btn" to="/browse">{t("home.browseAll")}</Link>
        </div>
      </header>

      <section className="block">
        <h2>{t("home.parksTitle")}</h2>
        <ul className="parkgrid">
          {parks.map((park) => (
            <li key={park.name}>
              <Link to={`/park/${encodeURIComponent(park.name)}`} className="parkcard">
                <span className="parkcard__n en">{park.name}</span>
                <span className="parkcard__r en">{park.resort}</span>
                <span className="parkcard__s">
                  {t("park.count", { count: park.count })} · {t("park.rated", { rated: park.rated })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="block block--how">
        <h2>{t("home.howTitle")}</h2>
        <p>{t("home.how")}</p>
        <p className="num">{t("trust.checked", { date: coverage.verifiedAt })}</p>
      </section>
    </main>
  );
}
