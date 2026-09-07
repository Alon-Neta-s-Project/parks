import { useTranslation } from "react-i18next";
import { useContent } from "../data/content";

/**
 * מאיפה הגיע מה שאתם רואים.
 *
 * ⚠️ **הכלל שהרכיב הזה קיים בשבילו** (CLAUDE.md): אין נפילה שקטה למקור
 * נתונים ישן. הקובץ המצורף הוא נפילה לגיטימית — הוא שומר על המוצר עובד
 * בלי מפתחות ובלי רשת — אבל **ברגע שהוא מה שמוצג, זה חייב להיראות.**
 *
 * ⚠️ ולכן זה אינו "שגיאה": מסד זמין אינו מציג דבר, וקובץ מצורף אינו
 * צועק. הוא אומר, בשקט, מה נכון.
 */
export function SourceNotice() {
  const { t } = useTranslation();
  const { status, reason, refused } = useContent();

  // ⚠️ שורות שנדחו הן אובדן חלקי שקט אם לא נאמר. 240 מתוך 242 נראה תקין.
  if (status === "database") {
    if (refused.length === 0) return null;
    return (
      <p className="notice notice--warn" role="status">
        {t("source.refused", { count: refused.length })}
      </p>
    );
  }

  if (status !== "bundled" || !reason) return null;

  return (
    <p className="notice notice--warn" role="status">
      <b>{t("source.bundledTitle")}</b> {t(`source.${reason.kind}`)}
    </p>
  );
}
