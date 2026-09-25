import { describe, expect, it } from "vitest";
import { canonicalPostUrl, communityDocId } from "../community-id";

/**
 * המזהה של מסמך קהילתי נגזר מ-URL של פוסט, ולכן **הנורמליזציה היא
 * הקונבנציה** — לא ה-hash.
 *
 * אותו פוסט מגיע שוב ושוב בצורות שונות: עם `?fbclid=…` שפייסבוק מוסיף
 * לכל שיתוף, מהמארח הנייד, עם ובלי סלאש מסיים. כל וריאציה היא `id` אחר,
 * וכל `id` אחר הוא שורה כפולה באינדקס — בלי שגיאה, בלי NULL, ובלי שום
 * דרך להבחין בין "פוסט חדש" ל"אותו פוסט בפעם השלישית".
 *
 * ⚠️ **ולכן הבדיקה היא על השקילות, לא על הפורמט.** בדיקה שמוודאת
 * ש-`communityDocId` מחזיר מחרוזת באורך הנכון הייתה עוברת גם אילו
 * הנורמליזציה לא קיימת בכלל.
 */

const POST = "https://www.facebook.com/groups/123456/posts/7890/";

describe("canonicalPostUrl — שלושת המקרים ששמו את הכלל בסיכון", () => {
  it("מתעלם מ-fbclid ומכל פרמטר מעקב אחר", () => {
    expect(canonicalPostUrl(`${POST}?fbclid=IwAR0abcXYZ`)).toBe(canonicalPostUrl(POST));
    expect(canonicalPostUrl(`${POST}?utm_source=newsletter&utm_medium=email`)).toBe(
      canonicalPostUrl(POST),
    );
    expect(canonicalPostUrl(`${POST}?__cft__[0]=AZX&__tn__=%2CO`)).toBe(canonicalPostUrl(POST));
  });

  it("מתעלם מ-www ומהמארחים הניידים", () => {
    for (const host of ["facebook.com", "m.facebook.com", "mbasic.facebook.com", "web.facebook.com"]) {
      expect(canonicalPostUrl(POST.replace("www.facebook.com", host))).toBe(canonicalPostUrl(POST));
    }
  });

  it("מתעלם מסלאש מסיים, מ-http מול https ומאותיות גדולות במארח", () => {
    expect(canonicalPostUrl("https://www.facebook.com/groups/123456/posts/7890")).toBe(
      canonicalPostUrl(POST),
    );
    expect(canonicalPostUrl("http://www.FaceBook.com/groups/123456/posts/7890/")).toBe(
      canonicalPostUrl(POST),
    );
  });
});

describe("canonicalPostUrl — מה שאסור לו למזג", () => {
  /**
   * 🔴 זה מה שרשימת-החסימה הייתה שוברת. `comment_id` **הוא** חלק מהזהות:
   * תגובה אינה הפוסט. רשימת-היתר שומרת רק פרמטרים שהם זהות, ולכן היא
   * שומרת אותו — ורשימת-חסימה של "פרמטרים מיותרים" הייתה מוחקת אותו
   * יחד עם fbclid, וממזגת תגובה לתוך הפוסט שלה.
   */
  it("תגובה אינה אותו פריט כמו הפוסט", () => {
    expect(canonicalPostUrl(`${POST}?comment_id=555`)).not.toBe(canonicalPostUrl(POST));
  });

  it("פוסטים שונים נשארים שונים", () => {
    expect(canonicalPostUrl(POST)).not.toBe(
      canonicalPostUrl("https://www.facebook.com/groups/123456/posts/7891/"),
    );
    expect(canonicalPostUrl(POST)).not.toBe(
      canonicalPostUrl("https://www.facebook.com/groups/999999/posts/7890/"),
    );
  });

  it("סדר הפרמטרים אינו משנה זהות", () => {
    expect(canonicalPostUrl("https://www.facebook.com/permalink.php?story_fbid=7890&id=123456")).toBe(
      canonicalPostUrl("https://www.facebook.com/permalink.php?id=123456&story_fbid=7890"),
    );
  });

  it("נורמליזציה של ערך מנורמל אינה משנה אותו", () => {
    const once = canonicalPostUrl(`${POST}?fbclid=IwAR0abcXYZ`);
    expect(canonicalPostUrl(once)).toBe(once);
  });
});

describe("canonicalPostUrl — קלט פסול נופל בקול", () => {
  /**
   * ⚠️ **אין נפילה שקטה לקלט.** פונקציה שמחזירה את המחרוזת כמו שהיא
   * כשהיא אינה URL הייתה יוצרת `id` יציב לזבל, והזבל היה נראה כמו פוסט.
   */
  for (const bad of ["", "   ", "לא URL בכלל", "javascript:alert(1)", "/groups/123/posts/7890"]) {
    it(`נופל על ${JSON.stringify(bad)}`, () => {
      expect(() => canonicalPostUrl(bad)).toThrow();
    });
  }
});

describe("communityDocId", () => {
  it("אותו פוסט — אותו מזהה, בכל וריאציה", () => {
    const id = communityDocId(POST);
    for (const variant of [
      `${POST}?fbclid=IwAR0abcXYZ`,
      "https://m.facebook.com/groups/123456/posts/7890",
      "http://facebook.com/groups/123456/posts/7890/#comments",
    ]) {
      expect(communityDocId(variant)).toBe(id);
    }
  });

  it("בתבנית שהקונבנציה מבטיחה", () => {
    expect(communityDocId(POST)).toMatch(/^community-fb-[0-9a-f]{16}$/);
  });

  it("פוסטים שונים — מזהים שונים", () => {
    expect(communityDocId(POST)).not.toBe(
      communityDocId("https://www.facebook.com/groups/123456/posts/7891/"),
    );
  });
});
