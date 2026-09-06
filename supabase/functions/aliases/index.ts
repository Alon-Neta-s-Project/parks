/**
 * ייצור מועמדים לשמות נרדפים בעברית.
 *
 * ⚠️ **הפונקציה הזו אינה כותבת ל-experience.** היא כותבת ל-alias_candidate,
 * שהוא תור אישור. נרדף שנכנס בלי סקירה מצמיד שאלה למתקן הלא נכון —
 * והמשתמשת מקבלת עובדות מדויקות, מנוסחות היטב ועם תאריך בדיקה, על מתקן
 * אחר. **התאריך גורם לזה להיראות אמין יותר, לא פחות.**
 *
 * למה בכלל: 197 מתוך 232 המתקנים היו בלי אף נרדף עברי, ולכן הכתיב היחיד
 * שעבד היה זה שהוקלד למסד. "ולוצירפטור" מול "ולוסיקוסטר" — אות אחת,
 * ואפס תוצאות על מתקן שקיים.
 *
 * ⚠️ **ולמה אופליין ולא בזמן ריצה:** פענוח בזמן ריצה בלתי נראה. אם המודל
 * יטעה, איש לא יראה זאת — לא המשתמשת ולא אנחנו. מועמד שמור הוא שורה
 * שאפשר לקרוא, לדחות, ולתקן פעם אחת לתמיד.
 *
 * הסוד: אותו INGEST_SECRET של embed, ומאותה סיבה — נקודת קצה שעולה כסף
 * נכשלת סגור כשאין לה שער.
 */

const MODEL = "gemini-3.6-flash";
/** כמה מתקנים בכל סבב. גדול מדי מסתכן ב-timeout. */
const BATCH = 25;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

export interface PendingRide {
  id: string;
  name: string;
  name_he: string | null;
  aliases: string;
}

/**
 * ההוראה למודל.
 *
 * ⚠️ **"איך משפחה ישראלית תקליד" ולא "תרגם".** תרגום יוצר שם שאיש אינו
 * אומר; מה שנדרש הוא הכתיבים שכן מוקלדים — תעתיק חלופי, קיצור מקובל,
 * וכינוי תיאורי אם הוא באמת בשימוש.
 */
export const SYSTEM =
  `אתה עוזר לבנות חיפוש בעברית למתקנים בפארקים באורלנדו.

לכל מתקן, החזר את הכתיבים שמשפחה ישראלית עשויה **להקליד** כשהיא מחפשת אותו.

כללים:
· תעתיקים חלופיים — "מאונטן" מול "מאונטיין", "ולוסי" מול "ולוצי".
· קיצורים שבשימוש — "אוורסט" ל-Expedition Everest.
· כינוי תיאורי **רק אם הוא באמת נאמר** — "מגדל האימה" ל-Tower of Terror.
· בין 2 ל-5 מועמדים למתקן. אם אין מה להוסיף, החזר רשימה ריקה.

⚠️ אל תמציא שמות של מתקנים אחרים, ואל תחזור על שם שכבר מופיע ברשימת
הנרדפים הקיימים. אל תוסיף הסברים — רק הכתיבים.`;

/** ⚠️ שומר מפני מזהה שהמודל המציא. ראה ההערה באתר הקריאה. */
export function keepKnown(
  returned: { id: string; candidates: string[] }[],
  sent: PendingRide[],
): { id: string; candidates: string[] }[] {
  const known = new Set(sent.map((r) => r.id));
  return returned
    .filter((r) => known.has(r.id))
    .map((r) => ({
      id: r.id,
      candidates: (r.candidates ?? [])
        .map((c) => String(c).trim())
        .filter((c) => c.length >= 2 && c.length <= 60),
    }));
}

export async function handle(
  req: Request,
  env: Record<string, string | undefined>,
): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ⚠️ נכשל סגור. סוד שלא הוגדר אינו "אין צורך בסוד".
  const secret = env.INGEST_SECRET;
  if (!secret) {
    return json({
      error: "not_configured",
      detail: "INGEST_SECRET חסר. בלעדיו נקודת הקצה פתוחה, ולכן היא סגורה.",
    }, 500);
  }
  if (req.headers.get("x-ingest-secret") !== secret) {
    return json({ error: "forbidden" }, 403);
  }

  const url = env.SUPABASE_URL;
  const dbKey = env.SUPABASE_ANON_KEY;
  const apiKey = env.GEMINI_API_KEY;
  if (!url || !dbKey || !apiKey) {
    return json({ error: "not_configured", detail: "חסר URL, מפתח מסד או מפתח ג'מיני." }, 500);
  }

  const rpc = (name: string, body: unknown) =>
    fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: dbKey,
        Authorization: `Bearer ${dbKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  // ── מי צריך מועמדים ─────────────────────────────────────────────────
  const pendingRes = await rpc("alias_pending", { p_secret: secret, p_limit: BATCH });
  if (!pendingRes.ok) {
    const detail = pendingRes.status === 404
      ? "alias_pending לא נמצאה — לא הורצה מיגרציה 031."
      : "הקריאה למסד נכשלה. אם הסוד הוחלף, יש להריץ ingest_set_key מחדש.";
    return json({ error: "db_error", status: pendingRes.status, detail }, 502);
  }
  const rides = (await pendingRes.json()) as PendingRide[];
  if (!Array.isArray(rides) || rides.length === 0) {
    return json({ done: true, rides: 0, candidates: 0, remaining: 0, model: MODEL });
  }

  // ── המודל ───────────────────────────────────────────────────────────
  const listing = rides
    .map((r) =>
      `${r.id}\n  אנגלית: ${r.name}\n  עברית: ${r.name_he ?? "—"}\n  נרדפים קיימים: ${r.aliases || "—"}`
    )
    .join("\n\n");

  const gRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: listing }] }],
        generationConfig: {
          thinkingConfig: { thinkingLevel: "minimal" },
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING" },
                candidates: { type: "ARRAY", items: { type: "STRING" } },
              },
              required: ["id", "candidates"],
            },
          },
        },
      }),
    },
  );

  if (!gRes.ok) {
    // ⚠️ **המפתח מוסר מההודעה, ולא רק "לא מוסיפים אותו".** גוגל מחזירה
    // את המפתח בתוך הודעות מכסה מסוימות, והעברה שקופה של ההודעה שלה
    // מדליפה אותו ללוח הבדיקה. אותו טיפול בדיוק כמו ב-embed.
    let detail = "";
    try {
      detail = String((await gRes.json())?.error?.message ?? "")
        .replace(/AIza[\w-]{10,}/g, "‹מפתח›")
        .slice(0, 300);
    } catch { /* גוף שאינו JSON */ }
    return json({ error: "upstream_error", status: gRes.status, upstream_detail: detail }, 502);
  }

  let parsed: { id: string; candidates: string[] }[] = [];
  try {
    const text = (await gRes.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "bad_model_output", detail: "התשובה אינה JSON תקין." }, 502);
  }

  // ⚠️ **מזהה שלא שלחנו אינו נכתב.** המודל יכול להחזיר מזהה שהמציא, או
  // כזה שראה באימון שלו — וכתיבה כזו הייתה תולה נרדף על מתקן אקראי.
  // המפתח הזר במסד היה דוחה מזהה שאינו קיים, אבל **לא** מזהה קיים
  // שפשוט לא היה במנה הזו. הסינון כאן הוא זה שתופס את המקרה השני.
  const clean = keepKnown(parsed, rides);

  // ── כתיבה לתור האישור ───────────────────────────────────────────────
  let written = 0;
  for (const row of clean) {
    for (const candidate of row.candidates) {
      const res = await rpc("alias_add", {
        p_secret: secret,
        p_experience_id: row.id,
        p_candidate: candidate,
        p_source: "model",
      });
      if (res.ok && (await res.json()) === true) written++;
    }
  }

  // ⚠️ "לא הצלחתי לספור" ו"אפס נשארו" הם שני דברים, ואחד מהם אומר
  // "סיימנו" בטעות. הלקח מהגבלת הקצב ומ-embed.
  let remaining: number | null = null;
  const remRes = await rpc("alias_remaining", { p_secret: secret });
  if (remRes.ok) remaining = Number(await remRes.json());

  return json({
    done: remaining === 0,
    rides: rides.length,
    candidates: written,
    remaining,
    model: MODEL,
  });
}

Deno.serve(async (req) => {
  try {
    return await handle(req, Deno.env.toObject());
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "unhandled",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
});
