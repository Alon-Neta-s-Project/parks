function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ?? "לא זהה"}\n  התקבל : ${a}\n  ציפינו: ${b}`);
}

import { test } from "vitest";
import { handle, keepKnown, SYSTEM, type PendingRide } from "./aliases.ts";

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
function stub(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const ride = (id: string): PendingRide =>
  ({ id, name: `Ride ${id}`, name_he: `מתקן ${id}`, aliases: "" });

/** מסד שמחזיר `pending` מתקנים, ומודל שמחזיר `out`. */
const db = (pending: PendingRide[], out: unknown, remaining: unknown = 0) => (url: string) => {
  if (url.includes("generativelanguage")) {
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }),
      { status: 200 },
    );
  }
  if (url.endsWith("/alias_add")) return new Response("true", { status: 200 });
  if (url.endsWith("/alias_remaining")) return new Response(JSON.stringify(remaining), { status: 200 });
  return new Response(JSON.stringify(pending), { status: 200 });
};

// ── השער ──────────────────────────────────────────────────────────────
test("בלי INGEST_SECRET — נעצר, ולא פונה לשום מקום", async () => {
  const s = stub(() => new Response("[]"));
  const r = await handle(post(), { ...FULL, INGEST_SECRET: undefined });
  s.restore();
  assertEquals(r.status, 500);
  assertEquals(s.calls.length, 0, "אסור שתהיה ולו קריאה אחת החוצה");
});

test("סוד שגוי נדחה, ולא נפנה למודל", async () => {
  const s = stub(() => new Response("[]"));
  const r = await handle(post({ "x-ingest-secret": "wrong" }), FULL);
  s.restore();
  assertEquals(r.status, 403);
  assertEquals(s.calls.length, 0);
});

test("GET נדחה", async () => {
  assertEquals((await handle(new Request("http://x"), FULL)).status, 405);
});

// ── 🔴 הכלל המרכזי ────────────────────────────────────────────────────
// ⚠️ **שום מועמד אינו נכנס ל-experience.** הפונקציה כותבת רק לתור
// האישור. נרדף לא מאושר שמצמיד שאלה למתקן הלא נכון גרוע מ"לא מצאתי",
// כי הוא נראה כמו תשובה — עם תאריך בדיקה שגורם לו להיראות אמין יותר.
test("שום כתיבה אינה נוגעת ב-experience או מסמנת approved", async () => {
  const s = stub(db([ride("a")], [{ id: "a", candidates: ["אלף", "בית"] }]));
  await handle(post(), FULL);
  s.restore();
  for (const c of s.calls) {
    assertEquals(c.url.includes("/experience"), false, "נגיעה בטבלת המתקנים");
    assertEquals(c.url.includes("aliases_i18n"), false);
    const body = String(c.init?.body ?? "");
    assertEquals(body.includes("approved"), false, "אסור שהפונקציה תסמן אישור");
  }
});

test("מסלול תקין — כל מועמד נכתב בנפרד כ-model", async () => {
  const s = stub(db([ride("a")], [{ id: "a", candidates: ["אלף", "בית"] }]));
  const r = await handle(post(), FULL);
  s.restore();
  const body = await r.json();
  assertEquals(body.candidates, 2);
  assertEquals(body.rides, 1);
  const writes = s.calls.filter((c) => c.url.endsWith("/alias_add"));
  assertEquals(writes.length, 2);
  assertEquals(JSON.parse(writes[0]!.init!.body as string).p_source, "model");
});

// ⚠️ המפתח הזר במסד דוחה מזהה שאינו קיים — אבל **לא** מזהה קיים שלא
// היה במנה. הסינון בקוד הוא זה שתופס את המקרה השני.
test("מזהה שלא נשלח במנה אינו נכתב, גם אם הוא מתקן אמיתי", () => {
  const sent = [ride("a"), ride("b")];
  const out = keepKnown([
    { id: "a", candidates: ["אלף"] },
    { id: "space-mountain", candidates: ["ספייס"] },
  ], sent);
  assertEquals(out.length, 1);
  assertEquals(out[0]!.id, "a");
});

test("מועמד ריק או ארוך מדי נזרק", () => {
  const out = keepKnown([{ id: "a", candidates: ["", " ", "ב", "בית", "x".repeat(61)] }], [ride("a")]);
  assertEquals(out[0]!.candidates, ["בית"]);
});

test("candidates חסר אינו מפיל", () => {
  const out = keepKnown([{ id: "a" } as unknown as { id: string; candidates: string[] }], [ride("a")]);
  assertEquals(out[0]!.candidates, []);
});

// ── מה שאסור לדלוף ────────────────────────────────────────────────────
test("המפתח של ג'מיני אינו נשלח למסד, ולהיפך", async () => {
  const s = stub(db([ride("a")], [{ id: "a", candidates: ["אלף"] }]));
  await handle(post(), FULL);
  s.restore();
  for (const c of s.calls) {
    const headers = JSON.stringify(c.init?.headers ?? {});
    if (c.url.includes("generativelanguage")) {
      assertEquals(headers.includes("anon-key"), false, "מפתח המסד הגיע לגוגל");
      assertEquals(String(c.init?.body ?? "").includes(SECRET), false, "הסוד הגיע לגוגל");
    } else {
      assertEquals(headers.includes("AIza"), false, "מפתח ג'מיני הגיע למסד");
    }
  }
});

test("שגיאת גוגל מוחזרת בלי המפתח", async () => {
  const s = stub((url) =>
    url.includes("generativelanguage")
      ? new Response(JSON.stringify({ error: { message: "quota for key AIzaSyDEADBEEF" } }), { status: 429 })
      : new Response(JSON.stringify([ride("a")]), { status: 200 })
  );
  const r = await handle(post(), FULL);
  s.restore();
  const body = await r.json();
  assertEquals(body.error, "upstream_error");
  assertEquals(JSON.stringify(body).includes("AIzaSyDEADBEEF"), false);
});

// ── ספירה ─────────────────────────────────────────────────────────────
test("אין מה לעבד — done ולא פונים למודל", async () => {
  const s = stub(() => new Response("[]", { status: 200 }));
  const r = await handle(post(), FULL);
  s.restore();
  assertEquals((await r.json()).done, true);
  assertEquals(s.calls.some((c) => c.url.includes("generativelanguage")), false);
});

// ⚠️ "לא הצלחתי לספור" אינו "אפס". אותו באג בדיוק כמו ב-embed.
test("ספירה שנכשלה מוחזרת כ-null ולא כאפס", async () => {
  const s = stub((url) => {
    if (url.includes("generativelanguage")) {
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"id":"a","candidates":["אלף"]}]' }] } }] }),
        { status: 200 },
      );
    }
    if (url.endsWith("/alias_add")) return new Response("true", { status: 200 });
    if (url.endsWith("/alias_remaining")) return new Response("", { status: 500 });
    return new Response(JSON.stringify([ride("a")]), { status: 200 });
  });
  const r = await handle(post(), FULL);
  s.restore();
  const body = await r.json();
  assertEquals(body.remaining, null);
  assertEquals(body.done, false, "בלי ספירה אסור לדווח שסיימנו");
});

test("404 מפנה למיגרציה 031", async () => {
  const s = stub(() => new Response("", { status: 404 }));
  const r = await handle(post(), FULL);
  s.restore();
  assertEquals((await r.json()).detail.includes("031"), true);
});

test("פלט שאינו JSON נעצר ואינו נכתב", async () => {
  const s = stub((url) =>
    url.includes("generativelanguage")
      ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "לא JSON" }] } }] }), { status: 200 })
      : new Response(JSON.stringify([ride("a")]), { status: 200 })
  );
  const r = await handle(post(), FULL);
  s.restore();
  assertEquals((await r.json()).error, "bad_model_output");
  assertEquals(s.calls.some((c) => c.url.endsWith("/alias_add")), false);
});

// ⚠️ ההוראה אומרת "להקליד" ולא "לתרגם". תרגום יוצר שם שאיש אינו אומר.
//
// 🔴 ושלושת האיסורים נמדדו על 60 המועמדים הראשונים ולא נוסחו מראש:
// "אקרובטיקו אפקוט" (שם + פארק), "אדוונסד טריינינג לאב" (כפילות),
// ו-"מתקן אווטאר" (תיאור גנרי) — שהאחרון הוכח כמחזיר מתקן אקראי על
// השאלה "איזה מתקן הכי מפחיד".
test("ההוראה מבקשת כתיבים, ואוסרת את שלושת הדפוסים שנמדדו", () => {
  assertEquals(SYSTEM.includes("להקליד"), true);
  assertEquals(SYSTEM.includes("שם פארק"), true, "האיסור על שם פארק חסר");
  assertEquals(SYSTEM.includes("חזרה על השם"), true, "האיסור על כפילות חסר");
  assertEquals(SYSTEM.includes("תיאור גנרי"), true, "האיסור על תיאור גנרי חסר");
});
