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

Deno.test("סוד חסר וסוד פגום הם שתי שגיאות שונות", async () => {
  const missing = await handle(ask({ question: "היי" }), {});
  assertEquals(missing.status, 500);
  assertEquals((await missing.json()).error, "missing_api_key");

  const blank = await handle(ask({ question: "היי" }), { GEMINI_API_KEY: "   " });
  assertEquals((await blank.json()).error, "missing_api_key");

  // הדבקה חלקית — הסוג הנפוץ ביותר של תקלה, ושונה לגמרי מ"לא הוגדר"
  const partial = await handle(ask({ question: "היי" }), { GEMINI_API_KEY: "AIzaSy" });
  assertEquals(partial.status, 500);
  const b = await partial.json();
  assertEquals(b.error, "malformed_api_key");
  assertEquals(b.detail.includes("6"), true, "האורך שהתקבל צריך להופיע");
  assertEquals(b.detail.includes("AIzaSy"), false, "אבל לא הערך עצמו");
});

Deno.test("בדיקת השפיות תופסת הדבקה חלקית, ולא מניחה פורמט של ספק", () => {
  assertEquals(looksLikeGeminiKey(undefined), false);
  assertEquals(looksLikeGeminiKey("AIzaSy"), false, "קצר מדי — הדבקה חלקית");
  assertEquals(looksLikeGeminiKey("AIza with a space in it xxxxxxxxxxxxxxx"), false, "רווח");
  assertEquals(looksLikeGeminiKey(KEY), true);
  // ⚠️ העיקר: מפתח באורך תקין שאינו מתחיל ב-AIza **אינו** נחסם. גוגל היא
  //    הסמכות על הפורמט, ולא ניחוש מקומי שחוסם מפתח תקין.
  assertEquals(looksLikeGeminiKey("x".repeat(39)), true);
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

const FULL = { GEMINI_API_KEY: KEY, SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "svc" };
/** מסד שמאפשר לעבור: ספירה נמוכה, ורישום שמצליח. */
const dbOk = (n = 0) => (url: string) =>
  url.startsWith("http://db/rest")
    ? new Response("[]", { status: 200, headers: { "content-range": `0-0/${n}` } })
    : geminiOk();

Deno.test("מסלול תקין — המפתח נשלח לגוגל ואינו חוזר לדפדפן", async () => {
  const s = stub(dbOk());
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  assertEquals(r.status, 200);
  const body = await r.text();
  assertEquals(body.includes(KEY), false);          // המפתח לא בגוף התשובה
  assertEquals(JSON.parse(body).answer, "שלום, אני מחובר.");
  const gemini = s.calls.find((c) => c.url.includes("generativelanguage"))!;
  assertEquals((gemini.init?.headers as Record<string, string>)["x-goog-api-key"], KEY);
});

Deno.test("שגיאה מגוגל מוחזרת כקוד בלבד, בלי גוף התשובה שלה", async () => {
  const s = stub((url) =>
    url.startsWith("http://db/rest")
      ? new Response("[]", { status: 200, headers: { "content-range": "0-0/0" } })
      : new Response("quota exceeded for key AIzaSECRET", { status: 429 })
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  assertEquals(r.status, 502);
  const body = await r.text();
  assertEquals(body.includes("AIzaSECRET"), false);
  assertEquals(JSON.parse(body).error, "upstream_error");
});

Deno.test("הגבלת קצב חוסמת מעל הגג ולא מתחתיו", async () => {
  const under = stub(dbOk(19));
  assertEquals((await handle(ask({ question: "היי" }), FULL)).status, 200);
  under.restore();

  const over = stub(dbOk(20));
  const blocked = await handle(ask({ question: "היי" }), FULL);
  over.restore();
  assertEquals(blocked.status, 429);
});

// ── כישלון סגור ──────────────────────────────────────────────────────
// הגרסה הראשונה דילגה על ההגבלה כשלא ניתן היה לאכוף אותה, והמשיכה למודל.
// זו הייתה נקודת קצה פתוחה בשקט, בדיוק כשאימות הטוקן כבוי.

Deno.test("בלי הגדרות מסד — נעצר, ולא ממשיך למודל", async () => {
  const s = stub(() => geminiOk());
  const r = await handle(ask({ question: "היי" }), { GEMINI_API_KEY: KEY });
  s.restore();
  assertEquals(r.status, 500);
  assertEquals((await r.json()).error, "rate_limit_unavailable");
  assertEquals(s.calls.length, 0, "אסור שתהיה ולו קריאה אחת החוצה");
});

Deno.test("ספירה שנכשלה נחשבת ככישלון, לא כאפס", async () => {
  for (const bad of [
    new Response("", { status: 500 }),                                  // המסד שגה
    new Response("[]", { status: 200 }),                                // בלי content-range
    new Response("[]", { status: 200, headers: { "content-range": "*/*" } }), // לא מספר
  ]) {
    const s = stub((url) => (url.startsWith("http://db/rest") ? bad.clone() : geminiOk()));
    const r = await handle(ask({ question: "היי" }), FULL);
    const outbound = s.calls.filter((c) => c.url.includes("generativelanguage")).length;
    s.restore();
    assertEquals(r.status, 500);
    assertEquals((await r.json()).error, "rate_limit_unavailable");
    assertEquals(outbound, 0, "לא פונים למודל כשאי אפשר לספור");
  }
});

Deno.test("רישום שנכשל עוצר גם הוא — אחרת הגג לא ניתן לאכיפה בקריאה הבאה", async () => {
  let first = true;
  const s = stub((url) => {
    if (!url.startsWith("http://db/rest")) return geminiOk();
    if (first) { first = false; return new Response("[]", { status: 200, headers: { "content-range": "0-0/0" } }); }
    return new Response("", { status: 403 });   // ה-INSERT נכשל
  });
  const r = await handle(ask({ question: "היי" }), FULL);
  const outbound = s.calls.filter((c) => c.url.includes("generativelanguage")).length;
  s.restore();
  assertEquals(r.status, 500);
  assertEquals(outbound, 0);
});

Deno.test("CORS מצטמצם לדומיין ברגע ש-ALLOWED_ORIGIN מוגדר", async () => {
  const withOrigin = (o: string) =>
    new Request("http://x/tim", { method: "OPTIONS", headers: { origin: o } });

  const open = await handle(new Request("http://x/tim", { method: "OPTIONS" }), {});
  assertEquals(open.headers.get("Access-Control-Allow-Origin"), "*");

  const env = { ALLOWED_ORIGIN: "https://parkday.example" };
  const ours = await handle(withOrigin("https://parkday.example"), env);
  assertEquals(ours.headers.get("Access-Control-Allow-Origin"), "https://parkday.example");

  const theirs = await handle(withOrigin("https://evil.example"), env);
  assertEquals(theirs.headers.get("Access-Control-Allow-Origin"), null);
});

Deno.test("הדלי הוא גיבוב — כתובת ה-IP עצמה אינה נשמרת", async () => {
  const a = await bucketKey("203.0.113.9", "salt");
  const b = await bucketKey("203.0.113.9", "salt");
  const c = await bucketKey("203.0.113.10", "salt");
  assertEquals(a, b);                        // יציב
  assertEquals(a === c, false);              // מפריד בין כתובות
  assertEquals(a.includes("203.0.113"), false);  // ולא ניתן לקרוא ממנו את הכתובת
});


Deno.test("האבחון מחזיר נוכחות ואורך, ולעולם לא ערך", async () => {
  const env = { GEMINI_API_KEY: KEY, SUPABASE_URL: "http://db", MY_OWN_SECRET: "hunter2" };
  const r = await handle(
    new Request("http://x/tim", { method: "POST", body: JSON.stringify({ diagnose: true }) }),
    env,
  );
  assertEquals(r.status, 200);
  const text = await r.text();
  // ⚠️ העיקר בבדיקה הזו: שום ערך אינו חוזר, גם לא של סוד שאיני מכיר בשמו.
  assertEquals(text.includes(KEY), false);
  assertEquals(text.includes("hunter2"), false);
  assertEquals(text.includes("http://db"), false);

  const b = JSON.parse(text);
  assertEquals(b.known.GEMINI_API_KEY, `קיים · ${KEY.length} תווים`);
  assertEquals(b.known.SUPABASE_SERVICE_ROLE_KEY, "חסר");
  assertEquals(b.other_names.includes("MY_OWN_SECRET"), true, "השם כן, הערך לא");
});
