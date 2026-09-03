/**
 * חישוב הווקטורים של מאגר הידע.
 *
 * טעינת התוכן והחישוב הופרדו בכוונה: קובץ ה-SQL נשמר ברפו ואפשר לקרוא
 * אותו, והחישוב דורש את מפתח ג'מיני — שיושב ב-Secrets ואינו עובר דרך
 * הרפו, הצ'אט או המחשב של נטע. זו הסיבה שהפונקציה הזו קיימת בכלל.
 *
 * ⚠️ **נקודת קצה שעולה כסף, ולכן היא סגורה בסוד משלה.** טים מוגן בגדר
 * קצב כי הוא נועד להיות פתוח; זו אינה. כל מי שיודע את הכתובת יכול לגרום
 * לה לחשב מחדש 259 קטעים, ולכן היא דורשת `INGEST_SECRET` ונכשלת סגור
 * כשהוא חסר — בדיוק כמו הגדר של טים, ומאותה סיבה.
 *
 * ⚠️ ומדוע `service_role` דווקא כאן: הפונקציה **כותבת** לטבלה שסגורה
 * ב-RLS. אצל טים בחרנו במפתח anon עם פונקציית `security definer`, כי שם
 * משטח החשיפה היה חייב להישאר מחרוזת אחת שנכנסת וכן/לא שיוצא. כאן
 * הפעולה היא ניהולית מעצם טבעה, ו-`service_role` בסביבת שרת הוא בדיוק
 * מה שהוא נועד לו. הוא לעולם אינו מגיע לדפדפן.
 */

const MODEL = "gemini-embedding-001";
/** ⚠️ 1536 ולא 3072. מעל 2000 אין אינדקס ANN ב-pgvector (מיגרציה 024). */
const DIMS = 1536;
/** כמה קטעים בכל סבב. גדול מדי מסתכן ב-timeout של הפונקציה. */
const BATCH = 25;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

interface PendingChunk {
  id: string;
  content: string;
}

export async function handle(
  req: Request,
  env: Record<string, string | undefined>,
): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ── השער ────────────────────────────────────────────────────────────
  // ⚠️ נכשל סגור. סוד שלא הוגדר אינו "אין צורך בסוד" — הוא נקודת קצה
  // פתוחה שאיש לא יודע עליה, וזה בדיוק הכשל שכבר תפסנו בהגבלת הקצב.
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
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  const geminiKey = env.GEMINI_API_KEY;
  if (!url || !serviceKey || !geminiKey) {
    return json({
      error: "not_configured",
      // ⚠️ נוכחות בלבד, לעולם לא ערך.
      detail: {
        SUPABASE_URL: Boolean(url),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceKey),
        GEMINI_API_KEY: Boolean(geminiKey),
      },
    }, 500);
  }

  const db = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // ── מה עוד לא חושב ──────────────────────────────────────────────────
  let pending: PendingChunk[];
  try {
    const res = await fetch(
      `${url}/rest/v1/knowledge_chunk?embedding=is.null&select=id,content&limit=${BATCH}`,
      { headers: db },
    );
    if (!res.ok) {
      return json({
        error: "db_unreachable",
        status: res.status,
        detail: res.status === 401 || res.status === 403
          ? "המפתח אינו נפתר ל-service_role. הפונקציה כותבת לטבלה שסגורה ב-RLS."
          : undefined,
      }, 500);
    }
    pending = await res.json();
  } catch (e) {
    return json({ error: "db_unreachable", detail: String((e as Error)?.message ?? e) }, 500);
  }

  if (pending.length === 0) {
    return json({ done: true, embedded: 0, remaining: 0, model: MODEL });
  }

  // ── החישוב ──────────────────────────────────────────────────────────
  //
  // ⚠️ task_type הוא RETRIEVAL_DOCUMENT ולא SEMANTIC_SIMILARITY. המסמכים
  // והשאלה מקודדים **בתפקידים שונים**: מסמך הוא מה שנמצא, שאלה היא מה
  // שמחפש. קידוד שניהם באותו תפקיד עובד — ומחזיר תוצאות גרועות יותר בלי
  // שום שגיאה, וזה הסוג הגרוע ביותר של תקלה כאן.
  let vectors: number[][];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          requests: pending.map((c) => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text: c.content }] },
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: DIMS,
          })),
        }),
      },
    );
    if (!res.ok) {
      // ⚠️ קוד וסיבה בלבד. גוף התשובה של גוגל עלול לשקף בחזרה את הבקשה.
      const body = await res.text().catch(() => "");
      let reason: string | null = null;
      try {
        reason = JSON.parse(body)?.error?.message ?? null;
      } catch { /* גוף שאינו JSON */ }
      return json({
        error: "upstream_error",
        status: res.status,
        model: MODEL,
        upstream_detail: reason?.replace(/AIza[\w-]{10,}/g, "‹מפתח›").slice(0, 300) ?? null,
      }, 502);
    }
    const data = await res.json();
    vectors = (data?.embeddings ?? []).map((e: { values?: number[] }) => e?.values ?? []);
  } catch (e) {
    return json({ error: "upstream_unreachable", detail: String((e as Error)?.message ?? e) }, 502);
  }

  // ⚠️ תשובה חלקית נעצרת ואינה נכתבת. אם גוגל החזירה פחות וקטורים
  // מקטעים, כתיבה לפי מיקום הייתה מצמידה את הווקטור של קטע אחד לקטע
  // אחר — שליפה שמחזירה את התשובה הלא נכונה, בלי שום סימן שמשהו נשבר.
  if (vectors.length !== pending.length) {
    return json({
      error: "count_mismatch",
      sent: pending.length,
      received: vectors.length,
      detail: "לא נכתב דבר. התאמה לפי מיקום על מספרים שונים מצמידה וקטור לקטע הלא נכון.",
    }, 502);
  }
  const wrongSize = vectors.findIndex((v) => v.length !== DIMS);
  if (wrongSize !== -1) {
    return json({
      error: "wrong_dimension",
      expected: DIMS,
      received: vectors[wrongSize]?.length ?? 0,
      detail: "לא נכתב דבר. הממד חייב להתאים לעמודה, אחרת ההכנסה נדחית ממילא.",
    }, 502);
  }

  // ── הכתיבה ──────────────────────────────────────────────────────────
  let written = 0;
  for (let i = 0; i < pending.length; i++) {
    const chunk = pending[i]!;
    const res = await fetch(`${url}/rest/v1/knowledge_chunk?id=eq.${chunk.id}`, {
      method: "PATCH",
      headers: { ...db, Prefer: "return=minimal" },
      // ⚠️ שם המודל נכתב **יחד** עם הווקטור, ולא לפניו ולא אחריו.
      // ה-check במסד אוכף שהם ריקים או מלאים יחד, ושליחה נפרדת הייתה
      // נדחית — וזו בדיוק ההגנה שרצינו.
      body: JSON.stringify({
        embedding: JSON.stringify(vectors[i]),
        embedding_model: MODEL,
      }),
    });
    if (!res.ok) {
      return json({
        error: "write_failed",
        written,
        chunk: chunk.id,
        status: res.status,
        detail: await res.text().catch(() => ""),
      }, 500);
    }
    written++;
  }

  // כמה נשארו, כדי שהקוראת תדע אם לקרוא שוב.
  let remaining: number | null = null;
  try {
    const res = await fetch(
      `${url}/rest/v1/knowledge_chunk?embedding=is.null&select=id`,
      { headers: { ...db, Prefer: "count=exact", Range: "0-0" } },
    );
    const range = res.headers.get("content-range");
    // ⚠️ בלי `?? 0`. "לא הצלחתי לספור" ו"אפס נשארו" הם שני דברים, ואחד
    // מהם אומר "סיימנו" בטעות. זה בדיוק הבאג שכבר תפסנו בהגבלת הקצב.
    remaining = range ? Number(range.split("/")[1]) : null;
  } catch { /* הספירה היא נוחות, לא תנאי */ }

  return json({
    done: remaining === 0,
    embedded: written,
    remaining,
    model: MODEL,
    dimensions: DIMS,
  });
}

Deno.serve(async (req) => {
  try {
    return await handle(req, Deno.env.toObject());
  } catch (e) {
    return json({ error: "unhandled", detail: String((e as Error)?.message ?? e) }, 500);
  }
});
