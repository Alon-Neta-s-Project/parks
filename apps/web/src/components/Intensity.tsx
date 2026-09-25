import { useTranslation } from "react-i18next";
import type { IntensityLevel } from "../data/schema";

/**
 * Four bars, filled to the rating. Levels 3 and 4 switch to the warm accent —
 * the only place intensity uses a signal colour.
 */
export function Intensity({ value }: { value: IntensityLevel | null }) {
  const { t } = useTranslation();

  if (value === null) {
    return <span className="chip chip--missing">{t("card.unrated")}</span>;
  }

  return (
    <span className="chip">
      <span
        className={value >= 3 ? "intensity intensity--high" : "intensity"}
        aria-hidden="true"
      >
        {[1, 2, 3, 4].map((step) => (
          <i key={step} className={step <= value ? "on" : undefined} />
        ))}
      </span>
      <span className="num">
        {value} / 4
      </span>
    </span>
  );
}
