import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * מה שכתוב בזמן שהתשובה בדרך.
 *
 * ⚠️ **שישה ניסוחים ולא אחד** (בקשת פיליפ, 07.09). משפט קבוע שחוזר בכל
 * הודעה קורא כמו מסך טעינה; שישה קוראים כמו מישהו שבאמת בודק.
 *
 * ⚠️ ושלושתם נשמרים על אותו קו: **אף אחד מהם אינו מבטיח תשובה.** "מיד
 * אענה לך" הוא הבטחה שנשברת כשהתשובה היא "אין לי את זה" — וזה בדיוק
 * הכלל שהחום של טים לעולם אינו נכנס לביטחון.
 */
export function pickWaiting(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)] ?? "";
}

/**
 * ⚠️ **הבחירה ב-`useMemo` ולא בגוף הרינדור**, וזו אינה קוסמטיקה: הרכיב
 * מתרנדר שוב בכל שינוי מצב, ובחירה חדשה בכל רינדור הייתה מחליפה את
 * הטקסט מול העיניים כמה פעמים בשנייה. הבחירה נעשית פעם אחת לכל הרכבה,
 * וההרכבה היא בדיוק הודעה אחת.
 */
export function Thinking({ className }: { className?: string }) {
  const { t } = useTranslation();
  const options = t("ask.thinking", { returnObjects: true }) as string[];
  const text = useMemo(
    () => pickWaiting(Array.isArray(options) ? options : [String(options)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <span className={className} aria-live="polite">
      {text}
    </span>
  );
}
