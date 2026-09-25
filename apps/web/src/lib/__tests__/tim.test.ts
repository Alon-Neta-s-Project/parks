import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ isConfigured: true }));
vi.stubEnv("VITE_SUPABASE_URL", "https://p.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
// ⚠️ **ריק במפורש.** Vite טוען את apps/web/.env.local גם לבדיקות, ומי שמריץ
// את dev:local מחזיק שם VITE_TIM_URL. בלי השורה הזו הבדיקות עברו אצל מי
// שאין לו את הקובץ ונפלו אצל מי שיש — בדיקה שתלויה במכונה שמריצה אותה.
vi.stubEnv("VITE_TIM_URL", "");

const { askTim } = await import("../tim");

const reply = (body: unknown, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("טים מהדפדפן", () => {
  it("תשובה תקינה חוזרת כתשובה", async () => {
    reply({ answer: "שלום" });
    expect(await askTim("היי")).toEqual({ status: "ok", answer: "שלום" });
  });

  // ⚠️ המפתח של ג'מיני לא יוצא לדפדפן. נשלח רק anon.
  it("נשלח מפתח anon בלבד, אל הפונקציה", async () => {
    reply({ answer: "x" });
    await askTim("היי");
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // ⚠️ ה-slug האמיתי בסופהבייס, ולא השם שמוצג שם בממשק. הבדיקה נכתבה
    // מול "tim" ועברה, בעוד הכתובת החיה החזירה 404 — כלומר היא אימתה את
    // מה שהנחנו במקום את מה שקיים.
    expect(url).toBe("https://p.supabase.co/functions/v1/quick-worker");
    expect((init.headers as Record<string, string>).apikey).toBe("anon-key");
    expect(JSON.stringify(init.headers)).not.toContain("AIza");
  });

  // ⚠️ "נסי בעוד שעה" למי שהמכסה היומית נגמרה הוא שקר שיתגלה בעוד שעה.
  /**
   * ⚠️ **השרת העצמאי (apps/server), לצד פונקציית ה-Edge — לא במקומה.**
   * בלי VITE_TIM_URL שום דבר לא משתנה, וזו הבדיקה שלמעלה. עם הערך,
   * השאלה הולכת אליו — כך מריצים את הממשק מקומית מול השרת המקומי.
   */
  it("VITE_TIM_URL, כשמוגדר, הוא הכתובת — ובלעדיו נשארים בפונקציה", async () => {
    vi.stubEnv("VITE_TIM_URL", "http://localhost:8787/tim");
    reply({ answer: "שלום" });
    await askTim("שאלה");
    const calls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls()[0]![0]).toBe("http://localhost:8787/tim");
    vi.stubEnv("VITE_TIM_URL", "");
    await askTim("שאלה");
    expect(calls()[1]![0]).toBe("https://p.supabase.co/functions/v1/quick-worker");
  });

  it("גדר אישי וגדר יומי הם שתי סיבות שונות", async () => {
    reply({ error: "rate_limited", scope: "user" }, 429);
    expect((await askTim("א")).status === "failed" && (await askTim("א"))).toMatchObject({
      reason: "rate_limited_user",
    });
    reply({ error: "rate_limited", scope: "global" }, 429);
    expect(await askTim("א")).toMatchObject({ reason: "rate_limited_global" });
  });

  it("תשובה ריקה אינה נחשבת תשובה", async () => {
    reply({ answer: "   " });
    expect((await askTim("א")).status).toBe("failed");
  });

  it("רשת שנפלה מוחזרת כסיבה, ולא כחריגה", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await askTim("א")).toEqual({ status: "failed", reason: "unreachable" });
  });

  it("שגיאת שרת מוחזרת עם הקוד שלה", async () => {
    reply({ error: "upstream_error" }, 502);
    expect(await askTim("א")).toMatchObject({ reason: "upstream", detail: "[upstream_error]" });
  });

  // ⚠️ הבדיקה שנולדה מהעלייה הראשונה לאוויר. הפונקציה מחזירה hint בעברית
  // שאומר מה לתקן, וקודם נקרא ממנה רק שם השגיאה — כלומר המסך הציג
  // "upstream_error" והוראת התיקון נזרקה. הסדר כאן הוא הנבדק: ההוראה
  // ראשונה, שם השגיאה אחרונה.
  it("ההוראה מה לתקן מגיעה לפני שם השגיאה, ולא במקומה", async () => {
    reply({
      error: "upstream_error",
      status: 404,
      upstream_detail: "models/gemini-9 is not found",
      hint: "להגדיר סוד GEMINI_MODEL עם שם מהרשימה",
    }, 502);
    const r = await askTim("א");
    expect(r).toMatchObject({ reason: "upstream" });
    expect(r.status === "failed" && r.detail).toBe(
      "להגדיר סוד GEMINI_MODEL עם שם מהרשימה · models/gemini-9 is not found · [upstream_error 404]",
    );
  });

  // ⚠️ גוף שאינו JSON, או תשובה בלי שום שדה מוכר. בלי זה המסך היה מציג
  // מחרוזת ריקה — כלומר שורה שנייה שאינה אומרת דבר, וזו הנפילה השקטה
  // שהשורה הזו נועדה למנוע.
  it("תשובה בלי שדות מוכרים נופלת לקוד ה-HTTP ולא לריק", async () => {
    reply({}, 500);
    const r = await askTim("א");
    expect(r.status === "failed" && r.detail).toBe("HTTP 500");
  });
});
