import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { experiences as all, parkBySlug, parks } from "../data";
import type { Experience, IntensityLevel } from "../data/schema";
import { Intensity } from "../components/Intensity";
import { searchExperiences } from "../lib/recommend";

/**
 * Park page and cross-park browse are the same component. The brief calls this
 * a mode, not a second screen: with a park in the route it is scoped, without
 * one it is not.
 *
 * The filter bar is visible rather than tucked into a menu, because it is the
 * distinguishing feature. Filters we hold no data for are shown disabled with
 * the reason, instead of quietly returning nothing.
 */
export function BrowsePage() {
  const { t } = useTranslation();
  const { park: parkParam } = useParams();
  const parkName = parkParam ? decodeURIComponent(parkParam) : null;
  const park = parkName ? parks.find((p) => p.name === parkName) ?? parkBySlug(parkName) : null;

  const [land, setLand] = useState<string | null>(null);
  const [kind, setKind] = useState<"attraction" | "entertainment" | null>(null);
  const [intensityMax, setIntensityMax] = useState<IntensityLevel | null>(null);
  const [includeUnrated, setIncludeUnrated] = useState(true);
  const [fastAccess, setFastAccess] = useState<"multi" | "single" | null>(null);
  const [sort, setSort] = useState<"land" | "intensity">("land");

  const scope = park ? [park.name] : undefined;

  const lands = useMemo(
    () => [...new Set((park ? all.filter((e) => e.park === park.name) : all).map((e) => e.land))].sort(),
    [park],
  );

  const results = useMemo(() => {
    let list = searchExperiences({
      parks: scope,
      kinds: kind ? [kind] : undefined,
      intensityMax,
      includeUnrated,
      land: land ?? undefined,
    });
    if (fastAccess === "multi") list = list.filter((e) => e.fastAccess.system === "Multi Pass");
    if (fastAccess === "single") list = list.filter((e) => e.fastAccess.singlePassRequired);

    return [...list].sort((a, b) =>
      sort === "intensity"
        ? (b.intensity.value ?? -1) - (a.intensity.value ?? -1) || a.nameEn.localeCompare(b.nameEn)
        : a.land.localeCompare(b.land) || a.nameEn.localeCompare(b.nameEn),
    );
  }, [scope, kind, intensityMax, includeUnrated, land, fastAccess, sort]);

  const clear = () => {
    setLand(null); setKind(null); setIntensityMax(null);
    setIncludeUnrated(true); setFastAccess(null);
  };

  return (
    <main className="page">
      <nav className="crumbs"><Link to="/">{t("nav.home")}</Link></nav>

      <header className="hero hero--tight">
        <h1 className={park ? "en" : undefined}>{park ? park.name : t("nav.browse")}</h1>
        <p>
          {t("park.count", { count: park ? park.count : all.length })}
          {park && <> · {t("park.rated", { rated: park.rated })} · {t("park.lands", { n: park.lands.length })}</>}
        </p>
      </header>

      <div className="filterbar" role="group" aria-label={t("filters.title")}>
        <div className="filterbar__scroll">
          <select className="fselect" value={land ?? ""} onChange={(e) => setLand(e.target.value || null)}
                  aria-label={t("filters.land")}>
            <option value="">{t("filters.land")} — {t("filters.any")}</option>
            {lands.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>

          <select className="fselect" value={kind ?? ""}
                  onChange={(e) => setKind((e.target.value || null) as typeof kind)}
                  aria-label={t("filters.kind")}>
            <option value="">{t("filters.kind")} — {t("filters.any")}</option>
            <option value="attraction">{t("filters.attraction")}</option>
            <option value="entertainment">{t("filters.entertainment")}</option>
          </select>

          <select className="fselect" value={intensityMax ?? ""}
                  onChange={(e) => setIntensityMax((e.target.value ? Number(e.target.value) : null) as IntensityLevel | null)}
                  aria-label={t("filters.intensity")}>
            <option value="">{t("filters.intensity")} — {t("filters.any")}</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>≤ {n}</option>)}
          </select>

          <select className="fselect" value={fastAccess ?? ""}
                  onChange={(e) => setFastAccess((e.target.value || null) as typeof fastAccess)}
                  aria-label={t("filters.fastAccess")}>
            <option value="">{t("filters.fastAccess")} — {t("filters.any")}</option>
            <option value="multi">{t("filters.multiPass")}</option>
            <option value="single">{t("filters.singlePass")}</option>
          </select>

          <label className="ftoggle">
            <input type="checkbox" checked={includeUnrated}
                   onChange={(e) => setIncludeUnrated(e.target.checked)} />
            {t("filters.showUnrated")}
          </label>

          {/* Held back until the content carries them — shown so the shape of the
              product is visible and the gap is not silently missing. */}
          <span className="chip chip--missing">{t("facts.height")} · {t("filters.unavailable")}</span>
          <span className="chip chip--missing">{t("facts.motionWarning")} · {t("filters.unavailable")}</span>
          <span className="chip chip--missing">{t("facts.wheelchair")} · {t("filters.unavailable")}</span>

          <button type="button" className="ghost" onClick={clear}>{t("filters.clear")}</button>
        </div>

        <div className="sortrow">
          <span className="num">{t("filters.results", { count: results.length })}</span>
          <label>
            {t("filters.sort")}:{" "}
            <select className="fselect fselect--bare" value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="land">{t("filters.sortLand")}</option>
              <option value="intensity">{t("filters.sortIntensity")}</option>
            </select>
          </label>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="empty">
          <p>{t("park.empty")}</p>
          <p className="muted">{t("park.emptyHint")}</p>
        </div>
      ) : (
        <ul className="resultlist">
          {results.map((e) => <ResultRow key={e.id} experience={e} showPark={!park} />)}
        </ul>
      )}
    </main>
  );
}

function ResultRow({ experience: e, showPark }: { experience: Experience; showPark: boolean }) {
  const { t } = useTranslation();
  return (
    <li>
      <Link to={`/experience/${e.id}`} className="rrow">
        <span className="rrow__top">
          <span className="rrow__n en">{e.nameEn}</span>
          <span className="rrow__sub en">{e.subtype}</span>
        </span>
        <span className="rrow__meta en">{showPark ? `${e.park} · ${e.land}` : e.land}</span>
        <span className="rrow__tags">
          <Intensity value={e.intensity.value} />
          {e.fastAccess.singlePassRequired && <span className="chip chip--warn">{t("card.singlePass")}</span>}
          {e.fastAccess.system === "Multi Pass" && <span className="chip chip--way">{t("card.multiPass")}</span>}
          {e.fastAccess.unconfirmed && <span className="chip chip--missing">{t("card.unconfirmed")}</span>}
          {e.status.state !== "open" && <span className="chip chip--warn">{t("card.checkStatus")}</span>}
        </span>
      </Link>
    </li>
  );
}
