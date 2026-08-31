import { useTranslation } from "react-i18next";
import report from "../../reports/import-gap-report.json";
import { experiences } from "../data";

/**
 * Content completeness, built from the gap report the importer writes.
 *
 * Deliberately reads the report rather than recomputing: the admin view and the
 * import must never disagree about what is missing.
 */
export function AdminPage() {
  const { t } = useTranslation();
  const r = report as {
    ranAt: string; rows: { read: number; accepted: number; rejected: number };
    fieldCoverage: { field: string; filled: number; total: number }[];
    pagesComplete: number; incompleteCount: number;
    columns: { missingFromExport: string[]; presentButNotMapped: string[]; heldBackByDecision: string[] };
    valueProblems: string[];
  };

  return (
    <main className="page">
      <header className="hero hero--tight">
        <h1>{t("admin.title")}</h1>
        <p>{t("admin.lead")}</p>
        <p className="muted num">{t("admin.ran", { date: r.ranAt })}</p>
      </header>

      <section className="block">
        <ul className="statgrid">
          <li><b className="num">{r.rows.accepted}</b><span>{t("admin.rows")}</span></li>
          <li><b className="num">{r.pagesComplete}</b><span>{t("admin.complete")}</span></li>
          <li><b className="num">{r.rows.rejected}</b><span>נדחו</span></li>
          <li><b className="num">{r.valueProblems.length}</b><span>ערכים בעייתיים</span></li>
        </ul>
      </section>

      <section className="block">
        <h2>{t("admin.coverage")}</h2>
        <table className="dtable">
          <thead>
            <tr><th>{t("admin.field")}</th><th>{t("admin.coverage")}</th><th /></tr>
          </thead>
          <tbody>
            {r.fieldCoverage.map((c) => {
              const pct = Math.round((c.filled / c.total) * 100);
              return (
                <tr key={c.field}>
                  <td className="en">{c.field}</td>
                  <td className="num">{c.filled} / {c.total}</td>
                  <td>
                    <span className="bar"><i style={{ inlineSize: `${pct}%` }} data-zero={pct === 0} /></span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {(r.columns.missingFromExport.length > 0 || r.columns.heldBackByDecision.length > 0) && (
        <section className="block">
          <h2>עמודות</h2>
          {r.columns.missingFromExport.length > 0 && (
            <p>חסרות מהייצוא: <span className="en">{r.columns.missingFromExport.join(", ")}</span></p>
          )}
          {r.columns.presentButNotMapped.length > 0 && (
            <p>בייצוא אך לא ממופות: <span className="en">{r.columns.presentButNotMapped.join(", ")}</span></p>
          )}
          <p className="muted">
            מוחזקות בכוונה: <span className="en">{r.columns.heldBackByDecision.join(", ")}</span>
          </p>
        </section>
      )}

      <section className="block">
        <h2>{t("admin.missingBy")}</h2>
        <table className="dtable">
          <thead><tr><th>מתקן</th><th>פארק</th><th>חסר</th></tr></thead>
          <tbody>
            {experiences.slice(0, 60).map((e) => {
              const missing = r.fieldCoverage
                .filter((c) => c.filled === 0)
                .map((c) => c.field);
              return (
                <tr key={e.id}>
                  <td className="en">{e.nameEn}</td>
                  <td className="en">{e.park}</td>
                  <td className="num">{e.intensity.rated ? missing.length - 1 : missing.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
