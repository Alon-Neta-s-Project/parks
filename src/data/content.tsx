import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadContent, type SourceState } from "./source";
import { experiences as bundled, parks as bundledParks } from "./index";
import type { Experience, Park } from "./schema";

/**
 * התוכן שהמסך מציג, ומאיפה הוא הגיע.
 *
 * ⚠️ **הפער שזה סוגר.** `loadContent()` נכתב, נבדק, ומעולם לא נקרא. חמישה
 * רכיבים ייבאו את הקובץ המצורף ישירות, ולכן 242 השורות שנטענו למסד לא
 * הגיעו לאיש — האפליקציה הציגה את מה שנבנה בזמן ה-build.
 *
 * ⚠️ **וזה בדיוק הכשל שהמוצר בנוי נגדו:** תוכן ישן שמוצג כאילו הוא עדכני.
 * לכן המצב אינו נבלע כאן — הוא נחשף דרך `status`, והממשק אומר אותו.
 */
interface ContentValue {
  status: SourceState["status"];
  experiences: Experience[];
  parks: Park[];
  /** קיים רק כשמוצג הקובץ המצורף. */
  reason: Extract<SourceState, { status: "bundled" }>["reason"] | null;
  /** שורות שהמסד החזיר ולא ניתן היה להבין. ריק אינו "הכל תקין" בלבד. */
  refused: string[];
  bySlug: (slug: string) => Experience | undefined;
  parkBySlug: (slug: string) => Park | undefined;
  inPark: (park: string) => Experience[];
  coverage: { total: number; rated: number; verifiedAt: string | null };
}

const ContentContext = createContext<ContentValue | null>(null);

/**
 * הגזירה, כפונקציה טהורה.
 *
 * ⚠️ **מופרדת מה-Provider כדי שתהיה ניתנת לבדיקה בלי לרנדר.** ההבטחה
 * שנשמרת כאן — ש"מצורף" ו"מסד" אינם נראים אותו דבר לקורא — היא בדיוק
 * מה שנשבר קודם בשקט, ובדיקה עליה שווה יותר מבדיקה על JSX.
 */
export function deriveContent(state: SourceState): ContentValue {
  const { experiences, parks } = state;
  return {
    status: state.status,
    experiences,
    parks,
    reason: state.status === "bundled" ? state.reason : null,
    refused: state.status === "database" ? state.refused : [],
    bySlug: (slug) => experiences.find((e) => e.id === slug),
    parkBySlug: (slug) => parks.find((p) => p.slug === slug),
    inPark: (park) => experiences.filter((e) => e.park === park),
    coverage: {
      total: experiences.length,
      rated: experiences.filter((e) => e.intensity.rated).length,
      verifiedAt: experiences[0]?.lastVerified ?? null,
    },
  };
}

/**
 * ⚠️ **המצב ההתחלתי הוא "loading" עם התוכן המצורף, ולא מסך ריק.**
 * מסך ריק לשנייה הוא הפסד ודאי; תוכן מצורף שמסומן ככזה הוא מה שהמוצר
 * הבטיח — לעבוד בלי מפתחות, ולומר שזה מה שקורה.
 */
export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SourceState>({
    status: "loading",
    experiences: bundled,
    parks: bundledParks,
  });

  useEffect(() => {
    let live = true;
    loadContent().then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, []);

  const value = useMemo(() => deriveContent(state), [state]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

/**
 * ⚠️ **זורק כשאין ספק.** רכיב שמוצג מחוץ ל-ContentProvider היה נופל
 * בשקט לקובץ המצורף — וזה בדיוק מה שהיה כאן עד עכשיו. עדיף שייפול ברעש
 * בפיתוח מאשר יציג תוכן ישן בייצור.
 */
export function useContent(): ContentValue {
  const v = useContext(ContentContext);
  if (!v) throw new Error("useContent נקרא מחוץ ל-ContentProvider");
  return v;
}
