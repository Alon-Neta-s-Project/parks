import { useTranslation } from "react-i18next";
import type { Experience } from "../data/schema";
import { fitFor, type Member } from "../lib/group";

/**
 * Who in this group can ride, worked out on the spot.
 *
 * Never stored: a saved tag would go stale the moment a child's height is
 * corrected, and then two sources would disagree about who can ride.
 */
export function FitTag({ experience, members }: { experience: Experience; members: Member[] }) {
  const { t } = useTranslation();
  if (!members.length) return null;

  const result = fitFor(experience, members);

  if (result.fit === "unknown") {
    // An unchecked height limit is not a clean bill of health.
    const why = result.unmeasured.length
      ? t("fit.unmeasuredWhy", { count: result.unmeasured.length })
      : t("fit.unknownWhy");
    return (
      <span className="chip chip--missing" title={why}>
        {t("fit.unknown")}
      </span>
    );
  }

  if (result.fit === "everyone") {
    return <span className="chip chip--open">{t("fit.everyone")}</span>;
  }

  return (
    <span className="chip chip--warn">
      {t("fit.some", { count: result.canRide.length, total: members.length })}
    </span>
  );
}
