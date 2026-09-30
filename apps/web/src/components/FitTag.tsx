import { useTranslation } from "react-i18next";
import type { Experience } from "../data/schema";
import { fitLabel } from "../lib/fit-label";
import { fitFor, type Member } from "../lib/group";

/**
 * Who in this group can ride, worked out on the spot.
 *
 * Never stored: a saved tag would go stale the moment a child's height is
 * corrected, and then two sources would disagree about who can ride.
 * The words are chosen in `fitLabel` (lib/fit-label.ts), where they are tested.
 */
export function FitTag({ experience, members }: { experience: Experience; members: Member[] }) {
  const { t } = useTranslation();
  if (!members.length) return null;

  const label = fitLabel(fitFor(experience, members), members.length, experience.maxHeightRequirementCm);
  const title = label.why ? t(`fit.${label.why.key}`, label.why.values) : undefined;
  return (
    <span className={`chip chip--${label.tone}`} title={title}>
      {t(`fit.${label.key}`, label.values)}
    </span>
  );
}
