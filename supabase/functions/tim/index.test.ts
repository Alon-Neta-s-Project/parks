// בלי תלויות, מאותה סיבה שהפונקציה עצמה בלי תלויות: הכול נבדק מקומית.
function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ?? "לא זהה"}\n  התקבל : ${a}\n  ציפינו: ${b}`);
}
import { handle, thinkingConfig, looksLikeGeminiKey, bucketKey } from "./index.ts";

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

/** מודל חדש מחזיר כמה חלקים, והראשון אינו בהכרח הטקסט. */
const geminiMultiPart = () =>
  new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ thought: true }, { text: "חלק" }, { text: "שני" }] },
      finishReason: "STOP",
    }],
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

const FULL = { GEMINI_API_KEY: KEY, SUPABASE_URL: "http://db", SUPABASE_ANON_KEY: "anon-key-value" };
/** מסד שמאפשר לעבור: ספירה נמוכה, ורישום שמצליח. */
/** check_rate_limit מחזירה 'ok' | 'user' | 'global' — הגדר שנגע, לא רק אם. */
const dbSays = (verdict: "ok" | "user" | "global") => (url: string) =>
  url.includes("/rpc/check_rate_limit")
    ? new Response(JSON.stringify(verdict), { status: 200 })
    : geminiOk();

Deno.test("מסלול תקין — המפתח נשלח לגוגל ואינו חוזר לדפדפן", async () => {
  const s = stub(dbSays("ok"));
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
    url.includes("/rpc/check_rate_limit")
      ? new Response('"ok"', { status: 200 })
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
  const under = stub(dbSays("ok"));
  assertEquals((await handle(ask({ question: "היי" }), FULL)).status, 200);
  under.restore();

  const over = stub(dbSays("user"));
  const blocked = await handle(ask({ question: "היי" }), FULL);
  over.restore();
  assertEquals(blocked.status, 429);
});

// שני הגדרות אינם אותה הודעה. מבקרת שנשלחה לחכות שעה בזמן שהמכסה
// היומית נגמרה תגלה את זה רק בעוד שעה — וזה כשל שקט.
Deno.test("הגדר האישי והגלובלי נבדלים בתשובה, לא רק בקוד", async () => {
  const u = stub(dbSays("user"));
  const user = await handle(ask({ question: "היי" }), FULL);
  u.restore();
  const g = stub(dbSays("global"));
  const global = await handle(ask({ question: "היי" }), FULL);
  g.restore();

  assertEquals(user.status, 429);
  assertEquals(global.status, 429);
  const ub = await user.json(), gb = await global.json();
  assertEquals(ub.scope, "user");
  assertEquals(gb.scope, "global");
  assertEquals(ub.retry_after_minutes, 60);
  assertEquals(gb.retry_after_minutes, 60 * 24);
});

// מסד שנשאר על 020 מחזיר true. אם true ייקרא כ"מותר", הגדר היומי נעלם
// בלי שאיש יראה — ולכן בוליאני הוא כישלון מפורש, לא היתר.
Deno.test("בוליאני מ-020 אינו נחשב היתר", async () => {
  const s = stub((url) =>
    url.includes("/rpc/") ? new Response("true", { status: 200 }) : geminiOk()
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  const outbound = s.calls.filter((c) => c.url.includes("generativelanguage")).length;
  s.restore();
  assertEquals(r.status, 500);
  const b = await r.json();
  assertEquals(b.error, "rate_limit_unavailable");
  assertEquals(b.detail.includes("021"), true, "השגיאה חייבת לומר איזו מיגרציה חסרה");
  assertEquals(outbound, 0);
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

Deno.test("תשובה שאינה 'ok'/'user'/'global' נחשבת ככישלון, לא כהיתר", async () => {
  for (const bad of [
    new Response("", { status: 500 }),                    // המסד שגה
    new Response("", { status: 404 }),                    // המיגרציה לא רצה
    new Response("not json", { status: 200 }),            // גוף שאינו JSON
    new Response(JSON.stringify({ ok: 1 }), { status: 200 }), // JSON, אבל לא הפסק
    new Response('"maybe"', { status: 200 }),             // טקסט שאינו במילון
  ]) {
    const s = stub((url) => (url.includes("/rpc/") ? bad.clone() : geminiOk()));
    const r = await handle(ask({ question: "היי" }), FULL);
    const outbound = s.calls.filter((c) => c.url.includes("generativelanguage")).length;
    s.restore();
    assertEquals(r.status, 500);
    assertEquals((await r.json()).error, "rate_limit_unavailable");
    assertEquals(outbound, 0, "לא פונים למודל כשאי אפשר לספור");
  }
});

Deno.test("הספירה וההכנסה אטומיות — קריאה אחת למסד, לא שתיים", async () => {
  const s = stub(dbSays("ok"));
  await handle(ask({ question: "היי" }), FULL);
  const dbCalls = s.calls.filter((c) => c.url.includes("http://db")).length;
  s.restore();
  // בגרסה הקודמת היו שתי בקשות — ספירה ואז הכנסה — ושתי קריאות במקביל
  // יכלו לעבור את הגג יחד.
  assertEquals(dbCalls, 1);
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


Deno.test("אבחון מודלים מחזיר שמות בלבד, ומסנן לפי generateContent", async () => {
  const s = stub(() =>
    new Response(JSON.stringify({
      models: [
        { name: "models/gemini-x-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-y", supportedGenerationMethods: ["embedContent"] },
      ],
    }), { status: 200 })
  );
  const r = await handle(
    new Request("http://x/tim", { method: "POST", body: JSON.stringify({ diagnose: "models" }) }),
    { GEMINI_API_KEY: KEY },
  );
  const text = await r.text();
  s.restore();
  assertEquals(r.status, 200);
  assertEquals(text.includes(KEY), false, "המפתח לא חוזר");
  const b = JSON.parse(text);
  assertEquals(b.usable, ["gemini-x-flash"]);   // רק מה שיודע generateContent
});

Deno.test("404 מגוגל מסביר שהשם אינו קיים, ומצביע על האבחון", async () => {
  const s = stub((url) =>
    url.includes("/rpc/") ? new Response('"ok"', { status: 200 }) : new Response("", { status: 404 })
  );
  const r = await handle(ask({ question: "היי" }), { ...FULL, GEMINI_MODEL: "no-such-model" });
  s.restore();
  const b = await r.json();
  assertEquals(r.status, 502);
  assertEquals(b.model, "no-such-model");
  assertEquals(b.hint.includes("diagnose"), true);
});


Deno.test("תשובה בכמה חלקים נאספת, ולא רק parts[0]", async () => {
  const s = stub((url) =>
    url.includes("/rpc/") ? new Response('"ok"', { status: 200 }) : geminiMultiPart()
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  assertEquals(r.status, 200);
  // parts[0] הוא "מחשבה" בלי טקסט. הגרסה הקודמת הייתה מחזירה empty_answer
  // על תשובה תקינה לחלוטין.
  assertEquals((await r.json()).answer, "חלק\nשני");
});

Deno.test("תשובה ריקה מסבירה למה, ולא רק שהיא ריקה", async () => {
  const s = stub((url) =>
    url.includes("/rpc/")
      ? new Response('"ok"', { status: 200 })
      : new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }), { status: 200 })
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  const b = await r.json();
  assertEquals(r.status, 502);
  assertEquals(b.error, "empty_answer");
  assertEquals(b.finish_reason, "MAX_TOKENS");
});

Deno.test("גוף שאינו JSON מגוגל אינו מפיל את הפונקציה", async () => {
  const s = stub((url) =>
    url.includes("/rpc/") ? new Response('"ok"', { status: 200 }) : new Response("<html>", { status: 200 })
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  // הפרסור הזה היה היחיד שנשאר בלי catch, וחריגה ממנו הייתה יוצאת כ-500
  // גולמי בלי גוף — שגיאה שאי אפשר לאבחן.
  assertEquals(r.status, 502);
  assertEquals((await r.json()).error, "empty_answer");
});


Deno.test("503 מגוגל מקבל ניסיון חוזר אחד, ומצליח בו", async () => {
  let geminiCalls = 0;
  const s = stub((url) => {
    if (url.includes("/rpc/")) return new Response('"ok"', { status: 200 });
    geminiCalls += 1;
    return geminiCalls === 1 ? new Response("", { status: 503 }) : geminiOk();
  });
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  assertEquals(r.status, 200);
  assertEquals(geminiCalls, 2, "ניסיון אחד ועוד אחד");
  assertEquals((await r.json()).answer, "שלום, אני מחובר.");
});

Deno.test("503 שחוזר גם בניסיון השני מוחזר עם הסבר, ובלי ניסיון שלישי", async () => {
  let geminiCalls = 0;
  const s = stub((url) => {
    if (url.includes("/rpc/")) return new Response('"ok"', { status: 200 });
    geminiCalls += 1;
    return new Response("", { status: 503 });
  });
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  const b = await r.json();
  assertEquals(r.status, 502);
  assertEquals(geminiCalls, 2, "בדיוק שניים — לא לולאה");
  assertEquals(b.status, 503);
  assertEquals(b.hint.includes("עמוסה"), true);
});

Deno.test("404 אינו זמני, ולכן אינו מנוסה שוב", async () => {
  let geminiCalls = 0;
  const s = stub((url) => {
    if (url.includes("/rpc/")) return new Response('"ok"', { status: 200 });
    geminiCalls += 1;
    return new Response("", { status: 404 });
  });
  await handle(ask({ question: "היי" }), FULL);
  s.restore();
  assertEquals(geminiCalls, 1, "שם מודל שגוי לא מתקן את עצמו בניסיון חוזר");
});

// ── מדידת שימוש ──────────────────────────────────────────────────────
// ההערכה שלי לעלות הודעה שגתה פעם אחת בפי עשרים. המספרים של גוגל
// חוזרים ב-usageMetadata, ומכאן ההחלטות נשענות עליהם ולא על טבלה.

Deno.test("usageMetadata מוחזר, כולל אסימוני חשיבה וקאש", async () => {
  const s = stub((url) =>
    url.includes("/rpc/")
      ? new Response('"ok"', { status: 200 })
      : new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "שלום" }] } }],
          usageMetadata: {
            promptTokenCount: 180,
            candidatesTokenCount: 90,
            thoughtsTokenCount: 40,
            cachedContentTokenCount: 128,
          },
        }),
        { status: 200 },
      )
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  const b = await r.json();
  assertEquals(b.usage, { input: 180, output: 90, thinking: 40, cached_input: 128 });
});

// ⚠️ גוגל אינה מחזירה cachedContentTokenCount כשהקאש לא נגע. אם החֶסֶר
// היה חוזר כ-null, "לא ידוע" היה נקרא כ"אולי כן" — ואנחנו שוקלים על סמך
// המספר הזה אם קאשינג שווה משהו. חסר = 0, במפורש.
Deno.test("קאש שלא נגע נספר כאפס, לא כלא-ידוע", async () => {
  const s = stub((url) =>
    url.includes("/rpc/")
      ? new Response('"ok"', { status: 200 })
      : new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "שלום" }] } }],
          usageMetadata: { promptTokenCount: 180, candidatesTokenCount: 90 },
        }),
        { status: 200 },
      )
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  const b = await r.json();
  assertEquals(b.usage.cached_input, 0);
  assertEquals(b.usage.thinking, 0);
});

Deno.test("בלי usageMetadata התשובה עדיין נמסרת, והמדידה null", async () => {
  const s = stub(dbSays("ok"));
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  const b = await r.json();
  assertEquals(b.answer, "שלום, אני מחובר.");
  assertEquals(b.usage, null);
});

// ── תקציב החשיבה ─────────────────────────────────────────────────────
// נמדד: חשיבה 505 מול תשובה 154 — 72% מעלות ההודעה. הידית היקרה ביותר.
// היא opt-in כדי שפריסה לא תשנה התנהגות שכבר עובדת.

/** הגוף שנשלח לגוגל, כאובייקט. */
const sentToGemini = (calls: { url: string; init?: RequestInit }[]) =>
  // deno-lint-ignore no-explicit-any
  JSON.parse(calls.find((c) => c.url.includes("generativelanguage"))!.init!.body as any);

Deno.test("בלי הסוד — לא נשלח thinkingConfig כלל", async () => {
  const s = stub(dbSays("ok"));
  await handle(ask({ question: "היי" }), FULL);
  s.restore();
  const body = sentToGemini(s.calls);
  assertEquals("thinkingConfig" in body.generationConfig, false);
  assertEquals(body.generationConfig.maxOutputTokens, 2048);
});

Deno.test("עם הסוד — התקציב נשלח כמספר", async () => {
  const s = stub(dbSays("ok"));
  await handle(ask({ question: "היי" }), { ...FULL, GEMINI_THINKING_BUDGET: "128" });
  s.restore();
  assertEquals(sentToGemini(s.calls).generationConfig.thinkingConfig, { thinkingBudget: 128 });
});

Deno.test("אפס הוא תקציב, לא 'לא הוגדר'", async () => {
  const s = stub(dbSays("ok"));
  await handle(ask({ question: "היי" }), { ...FULL, GEMINI_THINKING_BUDGET: "0" });
  s.restore();
  assertEquals(sentToGemini(s.calls).generationConfig.thinkingConfig, { thinkingBudget: 0 });
});

// סוד עם שגיאת הקלדה שמפיל את טים לגמרי הוא מחיר גבוה מדי על ידית
// אופציונלית. ערך שאינו מספר מתעלמים ממנו, ולא שולחים אותו הלאה.
Deno.test("ערך פגום בסוד אינו נשלח, וטים ממשיך לעבוד", async () => {
  for (const bad of ["", "   ", "הרבה", "NaN"]) {
    const s = stub(dbSays("ok"));
    const r = await handle(ask({ question: "היי" }), { ...FULL, GEMINI_THINKING_BUDGET: bad });
    s.restore();
    assertEquals(r.status, 200, `נשבר על ${JSON.stringify(bad)}`);
    assertEquals("thinkingConfig" in sentToGemini(s.calls).generationConfig, false);
  }
});

// המודל יושב בסוד ולא בקוד, כדי שמעבר ל-3.6 לא ידרוש פריסת קוד.
Deno.test("שם המודל מגיע מהסוד, ומוחזר בתשובה", async () => {
  const s = stub(dbSays("ok"));
  const r = await handle(ask({ question: "היי" }), { ...FULL, GEMINI_MODEL: "gemini-3.6-flash" });
  s.restore();
  assertEquals((await r.json()).model, "gemini-3.6-flash");
  assertEquals(s.calls.some((c) => c.url.includes("gemini-3.6-flash")), true);
});

Deno.test("GEMINI_THINKING_LEVEL נשלח כשהוא מוגדר, ולצד budget", async () => {
  const s = stub(dbSays("ok"));
  await handle(ask({ question: "היי" }), { ...FULL, GEMINI_THINKING_LEVEL: "low" });
  s.restore();
  assertEquals(sentToGemini(s.calls).generationConfig.thinkingConfig, { thinkingLevel: "low" });

  const s2 = stub(dbSays("ok"));
  await handle(ask({ question: "היי" }), {
    ...FULL,
    GEMINI_THINKING_BUDGET: "128",
    GEMINI_THINKING_LEVEL: "low",
  });
  s2.restore();
  assertEquals(sentToGemini(s2.calls).generationConfig.thinkingConfig, {
    thinkingBudget: 128,
    thinkingLevel: "low",
  });
});

// ⚠️ סוד שלא הגיע לפונקציה, וסוד שהגיע והמודל התעלם ממנו, נראים זהים
// מבחוץ. האבחון חייב להראות את מה שנשלח בפועל — ומאותו חישוב, אחרת הוא
// לוח בקרה שמראה מתג במצב שאינו המצב.
Deno.test("האבחון מראה את מה שנשלח בפועל, ומאותו מקור", async () => {
  const env = { ...FULL, GEMINI_THINKING_LEVEL: "low" };
  const r = await handle(
    new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnose: true }),
    }),
    env,
  );
  const b = await r.json();
  assertEquals(b.sent_to_model, thinkingConfig(env));
  assertEquals(b.sent_to_model, { thinkingConfig: { thinkingLevel: "low" } });
  assertEquals(b.known.GEMINI_THINKING_LEVEL, "קיים · 3 תווים");
  assertEquals(b.known.GEMINI_THINKING_BUDGET, "חסר");
});

Deno.test("בלי שום סוד חשיבה — האבחון מראה ריק, לא ניחוש", async () => {
  const r = await handle(
    new Request("http://x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnose: true }),
    }),
    FULL,
  );
  assertEquals((await r.json()).sent_to_model, {});
});

// ── סיבת השגיאה מגוגל ────────────────────────────────────────────────
// "400" בלי סיבה עלה לנו סבב שלם: לא ידענו איזה שדה נדחה. מוחזר
// error.message בלבד — משפט על הבקשה, לא תוכן שלה.

Deno.test("סיבת 400 מוחזרת, והמפתח לא נוסע איתה", async () => {
  const s = stub((url) =>
    url.includes("/rpc/") ? new Response('"ok"', { status: 200 }) : new Response(
      JSON.stringify({
        error: {
          message: 'Invalid JSON payload received. Unknown name "thinkingLevel" at ' +
            "'generation_config.thinking_config'. key=AIzaSyDEADBEEFdeadbeef123456789",
        },
      }),
      { status: 400 },
    )
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  const b = await r.json();
  assertEquals(b.status, 400);
  assertEquals(b.upstream_detail.includes("thinkingLevel"), true, "הסיבה חייבת לשרוד");
  assertEquals(b.upstream_detail.includes("AIzaSyDEADBEEF"), false, "המפתח אסור שישרוד");
});

Deno.test("גוף שאינו JSON, או בלי error.message — לא ממציאים סיבה", async () => {
  for (const bad of ["<html>502</html>", "{}", '{"error":{}}', '{"error":{"message":123}}']) {
    const s = stub((url) =>
      url.includes("/rpc/")
        ? new Response('"ok"', { status: 200 })
        : new Response(bad, { status: 400 })
    );
    const r = await handle(ask({ question: "היי" }), FULL);
    s.restore();
    assertEquals((await r.json()).upstream_detail, null, `על ${bad}`);
  }
});

// הודעה ארוכה עלולה לגרור איתה חלקים מהבקשה. נחתכת.
Deno.test("סיבה ארוכה נחתכת ל-300 תווים", async () => {
  const s = stub((url) =>
    url.includes("/rpc/") ? new Response('"ok"', { status: 200 }) : new Response(
      JSON.stringify({ error: { message: "ש".repeat(5000) } }),
      { status: 400 },
    )
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  assertEquals((await r.json()).upstream_detail.length, 300);
});

// ── 🔴 הפרצה שגיא מצא ────────────────────────────────────────────────
// הגגות נשלחו כארגומנטים לפונקציה שמוענקת ל-anon — מפתח ציבורי בהגדרה.
// כל מי שפתחה את כלי המפתחים יכלה לקרוא ישירות ל-RPC עם p_max: 999999
// ולעבור את שני הגגות, בלי לגעת בפונקציה הזו בכלל.
//
// הבדיקה נועלת את התיקון: **דלי בלבד נשלח.** כל שדה נוסף כאן הוא גג
// שהקוראת בוחרת לעצמה, וזה בדיוק מה שהיה.

Deno.test("נשלח דלי בלבד — שום גג אינו נשלח מהקוד למסד", async () => {
  const s = stub(dbSays("ok"));
  await handle(ask({ question: "היי" }), FULL);
  s.restore();
  const rpc = s.calls.find((c) => c.url.includes("/rpc/check_rate_limit"))!;
  // deno-lint-ignore no-explicit-any
  const sent = JSON.parse(rpc.init!.body as any);
  assertEquals(Object.keys(sent), ["p_bucket"]);
});

Deno.test("404 מהמסד מפנה למיגרציה 026, לא לחתימה הישנה", async () => {
  const s = stub((url) =>
    url.includes("/rpc/") ? new Response("", { status: 404 }) : geminiOk()
  );
  const r = await handle(ask({ question: "היי" }), FULL);
  s.restore();
  assertEquals((await r.json()).detail.includes("026"), true);
});
