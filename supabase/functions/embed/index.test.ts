// בלי תלויות, כמו בפונקציה עצמה.
function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ?? "לא זהה"}\n  התקבל : ${a}\n  ציפינו: ${b}`);
}

import { handle } from "./index.ts";

const SECRET = "ingest-secret-value";
const FULL = {
  INGEST_SECRET: SECRET,
  SUPABASE_URL: "http://db",
  SUPABASE_ANON_KEY: "anon-key",
  GEMINI_API_KEY: "AIzaSyTESTKEY0000000000000000000000000000",
};

const post = (headers: Record<string, string> = { "x-ingest-secret": SECRET }) =>
  new Request("http://x", { method: "POST", headers });

interface Call { url: string; init?: RequestInit }
function stub(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const chunk = (id: string) => ({ id, content: "## שאלה\n\nתשובה ארוכה מספיק." });
const vec = (n = 1536) => Array.from({ length: n }, () => 0.01);

/** מסד שמחזיר `pending` קטעים, ומקבל כתיבות. */
const db = (pending: unknown[], remaining: unknown = 0) => (url: string) => {
  if (url.includes("generativelanguage")) {
    return new Response(
      JSON.stringify({ embeddings: (pending as unknown[]).map(() => ({ values: vec() })) }),
      { status: 200 },
    );
  }
  if (url.endsWith("/ingest_set_embedding")) return new Response("true", { status: 200 });
  if (url.endsWith("/ingest_remaining")) {
    return new Response(JSON.stringify(remaining), { status: 200 });
  }
  return new Response(JSON.stringify(pending), { status: 200 });
};

// ── השער ──────────────────────────────────────────────────────────────
// ⚠️ נקודת קצה שעולה כסף. סוד שלא הוגדר אינו "אין צורך בסוד".

Deno.test("בלי INGEST_SECRET — נעצר, ולא פונה לשום מקום", async () => {
  const s = stub(() => new Response("[]"));
  const r = await handle(post(), { ...FULL, INGEST_SECRET: undefined });
  s.restore();
  assertEquals(r.status, 500);
  assertEquals((await r.json()).error, "not_configured");
  assertEquals(s.calls.length, 0, "אסור שתהיה ולו קריאה אחת החוצה");
});

Deno.test("סוד שגוי נדחה, ולא נפנה למודל", async () => {
  const s = stub(() => new Response("[]"));
  const r = await handle(post({ "x-ingest-secret": "wrong-secret" }), FULL);
  s.restore();
  assertEquals(r.status, 403);
  assertEquals(s.calls.length, 0);
});

Deno.test("GET נדחה", async () => {
  assertEquals((await handle(new Request("http://x"), FULL)).status, 405);
});

// ── המסלול התקין ──────────────────────────────────────────────────────

Deno.test("מסלול תקין — הווקטור ושם המודל נכתבים יחד", async () => {
  const pending = [chunk("a"), chunk("b")];
  const s = stub(db(pending));
  const r = await handle(post(), FULL);
  s.restore();
  const body = await r.json();
  assertEquals(r.status, 200);
  assertEquals(body.embedded, 2);
  assertEquals(body.model, "gemini-embedding-001");
  assertEquals(body.dimensions, 1536);

  // ⚠️ ה-check במסד אוכף שהשניים ריקים או מלאים יחד. כתיבה של אחד מהם
  // בלבד הייתה נדחית, וזו בדיוק ההגנה — אז הבדיקה מוודאת שהיא נשמרת.
  const write = s.calls.find((c) => c.url.endsWith("/ingest_set_embedding"))!;
  const sent = JSON.parse(write.init!.body as string);
  assertEquals(Object.keys(sent).sort(), ["p_id", "p_model", "p_secret", "p_vector"]);
});

// ⚠️ המסמכים והשאלה מקודדים בתפקידים שונים. קידוד שניהם באותו תפקיד
// עובד — ומחזיר תוצאות גרועות יותר בלי שום שגיאה.
Deno.test("המסמכים מקודדים כ-RETRIEVAL_DOCUMENT, ובממד הנכון", async () => {
  const s = stub(db([chunk("a")]));
  await handle(post(), FULL);
  s.restore();
  const call = s.calls.find((c) => c.url.includes("generativelanguage"))!;
  const sent = JSON.parse(call.init!.body as string);
  assertEquals(sent.requests[0].taskType, "RETRIEVAL_DOCUMENT");
  assertEquals(sent.requests[0].outputDimensionality, 1536);
});

Deno.test("המפתח של ג'מיני אינו נשלח למסד, ולהיפך", async () => {
  const s = stub(db([chunk("a")]));
  await handle(post(), FULL);
  s.restore();
  for (const call of s.calls) {
    const headers = JSON.stringify(call.init?.headers ?? {});
    if (call.url.includes("generativelanguage")) {
      assertEquals(headers.includes("anon-key"), false, "מפתח המסד הגיע לגוגל");
    } else {
      assertEquals(headers.includes("AIza"), false, "מפתח ג'מיני הגיע למסד");
    }
  }
});

Deno.test("אין מה לחשב — מדווח done ולא פונה למודל", async () => {
  const s = stub(() => new Response("[]", { status: 200 }));
  const r = await handle(post(), FULL);
  s.restore();
  assertEquals(await r.json(), { done: true, embedded: 0, remaining: 0, model: "gemini-embedding-001" });
  assertEquals(s.calls.some((c) => c.url.includes("generativelanguage")), false);
});

// ── מה שאסור להיכתב ───────────────────────────────────────────────────
// ⚠️ התאמה לפי מיקום על מספרים שונים מצמידה וקטור לקטע הלא נכון —
// שליפה שמחזירה את התשובה הלא נכונה, בלי שום סימן שמשהו נשבר.

Deno.test("פחות וקטורים מקטעים — לא נכתב דבר", async () => {
  const pending = [chunk("a"), chunk("b"), chunk("c")];
  const s = stub((url) =>
    url.includes("generativelanguage")
      ? new Response(JSON.stringify({ embeddings: [{ values: vec() }, { values: vec() }] }), { status: 200 })
      : new Response(JSON.stringify(pending), { status: 200 })
  );
  const r = await handle(post(), FULL);
  s.restore();
  assertEquals(r.status, 502);
  assertEquals((await r.json()).error, "count_mismatch");
  assertEquals(s.calls.some((c) => c.url.endsWith("/ingest_set_embedding")), false, "אסור שתהיה כתיבה");
});

Deno.test("ממד שגוי — לא נכתב דבר", async () => {
  const pending = [chunk("a")];
  const s = stub((url) =>
    url.includes("generativelanguage")
      ? new Response(JSON.stringify({ embeddings: [{ values: vec(768) }] }), { status: 200 })
      : new Response(JSON.stringify(pending), { status: 200 })
  );
  const r = await handle(post(), FULL);
  s.restore();
  const body = await r.json();
  assertEquals(body.error, "wrong_dimension");
  assertEquals(body.received, 768);
  assertEquals(s.calls.some((c) => c.url.endsWith("/ingest_set_embedding")), false);
});

// ⚠️ "לא הצלחתי לספור" ו"אפס נשארו" הם שני דברים, ואחד מהם אומר
// "סיימנו" בטעות. זה בדיוק הבאג שכבר נתפס פעם אחת בהגבלת הקצב.
Deno.test("ספירה שנכשלה מוחזרת כ-null ולא כאפס", async () => {
  const pending = [chunk("a")];
  // ⚠️ ingest_remaining שנכשלת — "לא הצלחתי לספור", לא "אפס".
  const s = stub((url) => {
    if (url.includes("generativelanguage")) {
      return new Response(JSON.stringify({ embeddings: [{ values: vec() }] }), { status: 200 });
    }
    if (url.endsWith("/ingest_set_embedding")) return new Response("true", { status: 200 });
    if (url.endsWith("/ingest_remaining")) return new Response("", { status: 500 });
    return new Response(JSON.stringify(pending), { status: 200 });
  });
  const r = await handle(post(), FULL);
  s.restore();
  const body = await r.json();
  assertEquals(body.remaining, null);
  assertEquals(body.done, false, "בלי ספירה אסור לדווח שסיימנו");
});

// ⚠️ שלוש תקלות שנראות זהות מבחוץ — מיגרציה חסרה, סוד לא תואם, וכל השאר.
// בלי הפרדה, כל אחת מהן שולחת לחיפוש בשלושה מקומות.
Deno.test("404 מפנה למיגרציה 027, וסוד שגוי מפנה ל-ingest_set_key", async () => {
  const missing = stub(() => new Response("", { status: 404 }));
  const a = await handle(post(), FULL);
  missing.restore();
  assertEquals((await a.json()).detail.includes("027"), true);

  const wrong = stub(() =>
    new Response(JSON.stringify({ message: "סוד שגוי" }), { status: 400 })
  );
  const b = await handle(post(), FULL);
  wrong.restore();
  assertEquals((await b.json()).detail.includes("ingest_set_key"), true);
});

// ⚠️ עדכון שלא פגע בשום שורה מוחזר כ-false. 200 בלבד היה סופר אותו
// כהצלחה, והקטע היה נשאר בלי וקטור בלי שאיש יראה.
Deno.test("כתיבה שלא פגעה בשורה נעצרת ואינה נספרת כהצלחה", async () => {
  const s = stub((url) => {
    if (url.includes("generativelanguage")) {
      return new Response(JSON.stringify({ embeddings: [{ values: vec() }] }), { status: 200 });
    }
    if (url.endsWith("/ingest_set_embedding")) return new Response("false", { status: 200 });
    return new Response(JSON.stringify([chunk("a")]), { status: 200 });
  });
  const r = await handle(post(), FULL);
  s.restore();
  const body = await r.json();
  assertEquals(body.error, "write_missed");
  assertEquals(body.written, 0);
});

// ⚠️ הסוד נשלח בגוף לכל קריאה למסד, ולעולם לא לגוגל.
Deno.test("הסוד נשלח למסד בלבד", async () => {
  const s = stub(db([chunk("a")]));
  await handle(post(), FULL);
  s.restore();
  for (const call of s.calls) {
    const body = String(call.init?.body ?? "");
    if (call.url.includes("generativelanguage")) {
      assertEquals(body.includes(SECRET), false, "הסוד הגיע לגוגל");
    } else {
      assertEquals(body.includes(SECRET), true, "הסוד חסר בקריאה למסד");
    }
  }
});

Deno.test("שגיאת גוגל מוחזרת בלי המפתח", async () => {
  const pending = [chunk("a")];
  const s = stub((url) =>
    url.includes("generativelanguage")
      ? new Response(
        JSON.stringify({ error: { message: "quota exceeded for key AIzaSyDEADBEEF00000000000" } }),
        { status: 429 },
      )
      : new Response(JSON.stringify(pending), { status: 200 })
  );
  const r = await handle(post(), FULL);
  s.restore();
  const body = await r.json();
  assertEquals(body.error, "upstream_error");
  assertEquals(body.upstream_detail.includes("quota exceeded"), true);
  assertEquals(JSON.stringify(body).includes("AIzaSyDEADBEEF"), false);
});
