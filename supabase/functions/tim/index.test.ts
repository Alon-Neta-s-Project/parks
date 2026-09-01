// בלי תלויות, מאותה סיבה שהפונקציה עצמה בלי תלויות: הכול נבדק מקומית.
function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ?? "לא זהה"}\n  התקבל : ${a}\n  ציפינו: ${b}`);
}
import { handle, looksLikeGeminiKey, bucketKey } from "./index.ts";

const KEY = "AIza" + "x".repeat(35);
const ask = (body: unknown, method = "POST") =>
  // GET אינו יכול לשאת גוף — Request זורק. הבדיקה על 405 שולחת GET ריק.
  new Request("http://x/tim", method === "GET" ? { method } : { method, body: JSON.stringify(body) });

/** מחליף את fetch הגלובלי, ומחזיר את מה שנשלח כדי שאפשר יהיה לבדוק אותו. */
function stub(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((u: string | URL | Request, i?: RequestInit) => {
    const url = String(u);
    calls.push({ url, init: i });
    return Promise.resolve(handler(url, i));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

const geminiOk = () =>
  new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: "שלום, אני מחובר." }] } }],
  }), { status: 200 });

Deno.test("מפתח חסר → נאמר בדיוק מה חסר, בלי לדלוף כלום", async () => {
  const r = await handle(ask({ question: "היי" }), {});
  assertEquals(r.status, 500);
  const b = await r.json();
  assertEquals(b.error, "missing_api_key");
});

Deno.test("מפתח שאינו נראה כמו מפתח Gemini נדחה לפני שמנסים לקרוא איתו", () => {
  assertEquals(looksLikeGeminiKey("sk-proj-abc"), false);
  assertEquals(looksLikeGeminiKey(undefined), false);
  assertEquals(looksLikeGeminiKey(KEY), true);
});

Deno.test("שאלה ריקה, ארוכה מדי, ו-JSON פגום — כל אחת עם קוד משלה", async () => {
  assertEquals((await handle(ask({ question: "" }), { GEMINI_API_KEY: KEY })).status, 400);
  assertEquals((await handle(ask({}), { GEMINI_API_KEY: KEY })).status, 400);
  const long = { question: "א".repeat(1001) };
  assertEquals((await handle(ask(long), { GEMINI_API_KEY: KEY })).status, 413);
});

Deno.test("GET נדחה, OPTIONS מקבל CORS", async () => {
  assertEquals((await handle(ask({}, "GET"), { GEMINI_API_KEY: KEY })).status, 405);
  const o = await handle(new Request("http://x", { method: "OPTIONS" }), {});
  assertEquals(o.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("מסלול תקין — המפתח נשלח לגוגל ואינו חוזר לדפדפן", async () => {
  const s = stub(() => geminiOk());
  const r = await handle(ask({ question: "היי" }), { GEMINI_API_KEY: KEY });
  s.restore();
  assertEquals(r.status, 200);
  const body = await r.text();
  assertEquals(body.includes(KEY), false);          // המפתח לא בגוף התשובה
  assertEquals(JSON.parse(body).answer, "שלום, אני מחובר.");
  assertEquals((s.calls[0].init?.headers as Record<string, string>)["x-goog-api-key"], KEY);
});

Deno.test("שגיאה מגוגל מוחזרת כקוד בלבד, בלי גוף התשובה שלה", async () => {
  const s = stub(() => new Response("quota exceeded for key AIzaSECRET", { status: 429 }));
  const r = await handle(ask({ question: "היי" }), { GEMINI_API_KEY: KEY });
  s.restore();
  assertEquals(r.status, 502);
  const body = await r.text();
  assertEquals(body.includes("AIzaSECRET"), false);
  assertEquals(JSON.parse(body).error, "upstream_error");
});

Deno.test("הגבלת קצב חוסמת מעל הגג ולא מתחתיו", async () => {
  const env = { GEMINI_API_KEY: KEY, SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "svc" };

  const under = stub((url) =>
    url.startsWith("http://db/rest")
      ? new Response("[]", { status: 200, headers: { "content-range": "0-0/19" } })
      : geminiOk()
  );
  assertEquals((await handle(ask({ question: "היי" }), env)).status, 200);
  under.restore();

  const over = stub((url) =>
    url.startsWith("http://db/rest")
      ? new Response("[]", { status: 200, headers: { "content-range": "0-0/20" } })
      : geminiOk()
  );
  const blocked = await handle(ask({ question: "היי" }), env);
  over.restore();
  assertEquals(blocked.status, 429);
});

Deno.test("הדלי הוא גיבוב — כתובת ה-IP עצמה אינה נשמרת", async () => {
  const a = await bucketKey("203.0.113.9", "salt");
  const b = await bucketKey("203.0.113.9", "salt");
  const c = await bucketKey("203.0.113.10", "salt");
  assertEquals(a, b);                        // יציב
  assertEquals(a === c, false);              // מפריד בין כתובות
  assertEquals(a.includes("203.0.113"), false);  // ולא ניתן לקרוא ממנו את הכתובת
});
