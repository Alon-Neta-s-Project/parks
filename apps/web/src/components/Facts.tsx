import { useTranslation } from "react-i18next";
import type { Experience, QuadState } from "../data/schema";
import { Intensity } from "./Intensity";

/**
 * The fact block. Every row traces to a column in product_export.csv.
 *
 * A field with no value renders as an explicit "no data" row rather than
 * disappearing — the gap is information, and hiding it would let a reader
 * assume the answer is "no".
 */

function Row({ label, children, missing = false, note }: {
  label: string; children: React.ReactNode; missing?: boolean; note?: string;
}) {
  return (
    <div className={missing ? "fact fact--missing" : "fact"}>
      <span className="fact__k">{label}</span>
      <span className="fact__v">{children}</span>
      {note && <span className="fact__note">{note}</span>}
    </div>
  );
}

/** Four-state values read differently from a plain yes/no and must say so. */
function Quad({ value }: { value: QuadState }) {
  const { t } = useTranslation();
  if (value === "true") return <>{t("facts.yes")}</>;
  if (value === "false") return <>{t("facts.no")}</>;
  if (value === "na") return <>{t("facts.na")}</>;
  return <>{t("facts.unknown")}</>;
}

const isMissing = (v: QuadState) => v === null;

export function Facts({ experience: e }: { experience: Experience }) {
  const { t } = useTranslation();

  return (
    <div className="facts">
      <Row label={t("facts.intensity")} missing={!e.intensity.rated}
           note={e.intensity.rated ? undefined : t("facts.unratedNote")}>
        <Intensity value={e.intensity.value} />
      </Row>

      {/* 0 means "checked, no limit" and must read as words. Rendering it as a
          number would put "0 ס\"מ" on the card, which is a bug, not a fact. */}
      <Row label={t("facts.height")} missing={e.heightRequirementCm === null}>
        {e.heightRequirementCm === null
          ? t("facts.unknown")
          : e.heightRequirementCm === 0
            ? t("facts.noHeight")
            : <span className="num">{t("facts.heightCm", { cm: e.heightRequirementCm })}</span>}
      </Row>

      {/* Not tagged is stated, not left silent — and nothing here is inferred
          from category. A dark_ride is an indoor tracked ride, not a scary one. */}
      {/* 🔴 **קודם כל ערך שאינו null הוצג כ"כן".** כלומר שורה שנבדקה
          ונמצא שאין בה חושך — `false` — הוצגה כ"כן, יש חושך". זה היפוך
          מלא של הנתון, על השדה שמשפחה עם ילד שמפחד מחושך קוראת.

          ⚠️ ומאז מיגרציה 040 יש כאן גם "na": מופע שהשאלה אינה חלה עליו.
          `Quad` הוא אותו רכיב שמשמש את שאר העמודות הארבע־מצביות, והוא
          מבדיל בין ארבעתם. */}
      <Row
        label={t("facts.sensitivities")}
        missing={e.sensEnclosedDark === null}
        note={e.sensEnclosedDark === null ? t("facts.notTaggedWhy") : undefined}
      >
        {e.sensEnclosedDark === null
          ? t("facts.notTagged")
          : <Quad value={e.sensEnclosedDark} />}
      </Row>

      <Row label={t("facts.motionWarning")} missing={isMissing(e.motionSicknessWarning)}>
        {e.motionSicknessWarning === "true" ? t("facts.motionYes")
          : e.motionSicknessWarning === "false" ? t("facts.motionNo")
          : <Quad value={e.motionSicknessWarning} />}
      </Row>

      <Row label={t("facts.wheelchair")} missing={e.wheelchair === null}>
        {e.wheelchair ? t(`facts.wheelchair_${e.wheelchair}`) : t("facts.unknown")}
      </Row>

      <Row label={t("facts.duration")} missing={e.durationMinutes === null}>
        {e.durationMinutes !== null
          ? <span className="num">{t("facts.minutes", { n: e.durationMinutes })}</span>
          : t("facts.unknown")}
      </Row>

      <Row label={t("facts.opened")} missing={e.openedYear === null}>
        {e.openedYear !== null ? <span className="num">{e.openedYear}</span> : t("facts.unknown")}
      </Row>

      <Row label={t("facts.environment")} missing={e.environment === null}>
        {e.environment ?? t("facts.unknown")}
      </Row>

      <Row label={t("facts.airConditioned")} missing={isMissing(e.airConditioned)}>
        <Quad value={e.airConditioned} />
      </Row>

      {/* Three values rather than four — the schema keeps this an enum. */}
      <Row label={t("facts.getsWet")} missing={e.getsWet === null}>
        {e.getsWet ? t(`facts.wet_${e.getsWet}`) : t("facts.unknown")}
      </Row>

      <Row label={t("facts.bigDrops")} missing={isMissing(e.bigDrops)}>
        <Quad value={e.bigDrops} />
      </Row>

      <Row label={t("facts.spinning")} missing={isMissing(e.spinning)}>
        <Quad value={e.spinning} />
      </Row>

      <Row label={t("facts.motionSimulator")} missing={isMissing(e.isMotionSimulator)}>
        <Quad value={e.isMotionSimulator} />
      </Row>

      <Row label={t("facts.screens3d")} missing={isMissing(e.usesLargeScreensOr3d)}>
        <Quad value={e.usesLargeScreensOr3d} />
      </Row>

      {e.maxSpeedKmh !== null && (
        <Row label={t("facts.speed")}>
          <span className="num">{t("facts.kmh", { n: e.maxSpeedKmh })}</span>
        </Row>
      )}
      {e.inversions !== null && (
        <Row label={t("facts.inversions")}><span className="num">{e.inversions}</span></Row>
      )}
    </div>
  );
}

export function Ticket({ experience: e }: { experience: Experience }) {
  const { t } = useTranslation();
  return (
    <div className="ticket">
      <div className="ticket__row">
        <div>
          <div className="ticket__k">{t("ticket.admission")}</div>
          <div className="ticket__v en">{e.admission}</div>
        </div>
      </div>
      <div className="ticket__row">
        <div>
          <div className="ticket__k">{t("ticket.fastAccess")}</div>
          <div className="ticket__v en">{e.fastAccess.summary || t("ticket.noFastAccess")}</div>
        </div>
      </div>
      <div className="ticket__row">
        <div>
          <div className="ticket__k">{t("ticket.reservation")}</div>
          <div className="ticket__v en">{e.reservation}</div>
        </div>
      </div>
      {e.fastAccess.singlePassRequired && (
        <div className="ticket__flag">
          <span>{t("card.singlePass")} — {e.fastAccess.summary}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Freshness without attribution. The export carries a date and no source, by
 * decision: when the information was checked is what a reader needs; where it
 * came from stays internal.
 */
export function Trust({ experience: e }: { experience: Experience }) {
  const { t } = useTranslation();
  return (
    <div className="trust">
      <div className="trust__date num">{t("trust.checked", { date: e.lastVerified })}</div>
      <div className="trust__note">{t("trust.noSource")}</div>
    </div>
  );
}
