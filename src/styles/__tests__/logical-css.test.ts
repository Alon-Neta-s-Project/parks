import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { P } from "../../../scripts/paths";

/**
 * ⚠️ **הכלל "CSS לוגי בלבד" עבר מהערה לאכיפה.**
 *
 * הוא נכתב ב-CLAUDE.md מהיום הראשון, והוא נשמר — סרקתי, ואין ולו הפרה
 * אחת. אבל **כלל שנשמר בזכות זהירות אינו כלל**, והוא נשבר בפעם הראשונה
 * שמישהו ממהר. הבדיקה הזו היא מה שהופך אותו למשהו שאי אפשר לעבור עליו
 * בשקט.
 *
 * ⚠️ **והיא כתובה גם נגד ספרייה שעדיין אין לנו.** אין בפרויקט
 * Tailwind או shadcn — ואם יוכנסו, ברירת המחדל שלהם היא קלאסים פיזיים
 * (`ml-`, `pr-`, `left-`). הבדיקה חוסמת אותם מראש, כדי שההחלטה להכניס
 * ספרייה לא תגרור איתה בשקט מאה מחלקות שמניחות אנגלית.
 *
 * חריג לגיטימי מסומן במפורש בשורה עצמה — `physical-ok` — כדי שיהיה
 * נראה בסקירה ולא ייבלע.
 */

const ALLOW = "physical-ok";

function walk(dir: string, ext: string[], out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

const lines = (f: string) =>
  readFileSync(f, "utf8").split("\n").map((text, i) => ({ f, n: i + 1, text }))
    .filter((l) => !l.text.includes(ALLOW));

describe("CSS לוגי בלבד", () => {
  const css = walk(join(P.WEB_SRC, "styles"), [".css"]).filter((f) => !f.includes("__tests__"));
  const tsx = walk(P.WEB_SRC, [".tsx"]);

  it("אין תכונות CSS פיזיות בגיליונות הסגנון", () => {
    // margin-left, padding-right, border-left, inset-right, ובודדים left:/right:
    const physical = /(^|[;{\s])(?:(?:margin|padding|border|inset|scroll-margin|scroll-padding)-)?(left|right)\s*:/i;
    const align = /text-align\s*:\s*(left|right)\b/i;
    const bad = css.flatMap(lines).filter((l) => physical.test(l.text) || align.test(l.text));
    expect(bad.map((b) => `${b.f}:${b.n}  ${b.text.trim()}`)).toEqual([]);
  });

  it("אין סגנון פיזי בתוך רכיבים", () => {
    const inline = /\b(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight|insetLeft|insetRight)\b/;
    const align = /textAlign\s*:\s*["'](left|right)["']/;
    const bad = tsx.flatMap(lines).filter((l) => inline.test(l.text) || align.test(l.text));
    expect(bad.map((b) => `${b.f}:${b.n}  ${b.text.trim()}`)).toEqual([]);
  });

  // ⚠️ נגד ספרייה שעדיין לא נכנסה. ראה ההערה בראש הקובץ.
  it("אין קלאסים פיזיים בסגנון Tailwind, גם אם תיכנס", () => {
    const cls = /(?:^|["'\s])-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r)-[\w./[\]]+/;
    const bad = tsx.flatMap(lines)
      .filter((l) => /className\s*=/.test(l.text) && cls.test(l.text));
    expect(bad.map((b) => `${b.f}:${b.n}  ${b.text.trim()}`)).toEqual([]);
  });

  /**
   * ⚠️ **אייקון כיווני אינו מתהפך לבד עם `dir`.** חץ הוא הכיוון שלו,
   * ודפדפן אינו יודע ש"קדימה" בעברית הוא שמאלה. תו חץ שנכתב ישירות
   * ברכיב הוא החלטה קשיחה על שפה — הוא נכון בעברית ושגוי באנגלית,
   * וייגרר לגרסה האנגלית בשקט.
   *
   * לכן חץ חייב להיות אייקון שמצויר בכיוון הקנוני (ימינה) ומתהפך
   * ב-`[dir="rtl"]` דרך `scaleX(-1)`.
   */
  it("אין תווי חץ קשיחים ברכיבים — חץ חייב להיות אייקון שמתהפך", () => {
    const arrows = /[←→↑↓‹›❮❯⟵⟶◀▶▸◂▻◅➜➔⇦⇨]/;
    const bad = tsx.flatMap(lines).filter((l) => arrows.test(l.text));
    expect(bad.map((b) => `${b.f}:${b.n}  ${b.text.trim()}`)).toEqual([]);
  });
});
