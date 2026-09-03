import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ isConfigured: true }));
vi.stubEnv("VITE_SUPABASE_URL", "https://p.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");

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
    expect(url).toBe("https://p.supabase.co/functions/v1/tim");
    expect((init.headers as Record<string, string>).apikey).toBe("anon-key");
    expect(JSON.stringify(init.headers)).not.toContain("AIza");
  });

  // ⚠️ "נסי בעוד שעה" למי שהמכסה היומית נגמרה הוא שקר שיתגלה בעוד שעה.
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
    expect(await askTim("א")).toMatchObject({ reason: "upstream", detail: "upstream_error" });
  });
});
