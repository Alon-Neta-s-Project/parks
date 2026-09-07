import { describe, expect, it } from "vitest";
import i18n from "../index";
import he from "../he.json";

/**
 * 🔴 **מלכודת הרבים בעברית, שכבר תפסה אותנו.**
 *
 * לעברית ארבע קטגוריות רבים ב-Intl: `one` · `two` · `many` · `other`.
 * i18next **אינו** נופל מ-`two` ל-`other` — מפתח חסר מוחזר כשם המפתח
 * עצמו. כלומר בדיוק שתי שורות שנדחו היו מציגות למשתמשת את המחרוזת
 * `source.refused` על המסך.
 *
 * ⚠️ זו אינה בדיקה למחרוזת אחת. היא סורקת **כל** מפתח שיש לו צורת
 * רבים, כדי שהמלכודת תיתפס גם במחרוזת שתיכתב מחר.
 */
function pluralKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      if (k.endsWith("_one")) out.push(path.slice(0, -4));
    } else out.push(...pluralKeys(v, path));
  }
  return out;
}

describe("צורות רבים בעברית", () => {
  const keys = pluralKeys(he);

  it("יש בכלל מפתחות עם רבים", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)("%s נפתר לכל מספר, ולא מחזיר את שם המפתח", (key) => {
    // ⚠️ 2 הוא המקרה שנפל. 20 ו-30 הם קטגוריית many.
    for (const count of [0, 1, 2, 3, 10, 20, 30, 100, 242]) {
      const out = i18n.t(key, { count });
      expect(out, `count=${count}`).not.toBe(key);
      expect(out, `count=${count}`).not.toContain("_one");
    }
  });
});
