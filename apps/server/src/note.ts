import { corsFor, jsonResponder } from "./tim/http";

/**
 * POST /note — a tester's note on one of Tim's answers (the test page, apps/web/src/tim/test-main.tsx).
 *
 * 🔴 **With the question and the answer (Alon, 01.10).** The old path (`save_tester_note` over
 * PostgREST) had columns for both, and the page never sent them: a note in the database was
 * "too long" against a random id, with no way to tell which answer it meant.
 *
 * ⚠️ **No tester key and no rate limit — kept simple on purpose (Alon, 01.10).** The one guard
 * is the table's cap of 500 notes (db/tester-note.ts): a script posting here could push the real
 * notes out. Known, and accepted for a test site.
 *
 * ⚠️ The log line says a note was saved — never the note, the question or the answer (log.ts).
 */
export interface TesterNote {
  turnRef: string;
  sessionRef: string;
  note: string;
  question: string | null;
  answer: string | null;
}

/** Where notes go — the server's own connection (apps/server/src/db/tester-note.ts). */
export interface NoteStore {
  save(n: TesterNote): Promise<void>;
}

/** The table's limits (tester_note's CHECKs) — cut to them, as the database function did. */
const LIMITS = { note: 2000, question: 2000, answer: 8000, ref: 64 };

const ref = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, LIMITS.ref) : null);
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function handleNote(req: Request, env: Record<string, string | undefined>, store?: NoteStore): Promise<Response> {
  const json = jsonResponder(corsFor(req, env));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req, env) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const note = text(body.note, LIMITS.note);
  if (!note) return json({ error: "empty_note" }, 400);
  const turnRef = ref(body.turnRef);
  const sessionRef = ref(body.sessionRef);
  if (!turnRef || !sessionRef) return json({ error: "missing_ref" }, 400);

  if (!store) return json({ error: "notes_unavailable" }, 503);

  try {
    await store.save({
      turnRef, sessionRef, note,
      question: text(body.question, LIMITS.question),
      answer: text(body.answer, LIMITS.answer),
    });
  } catch {
    return json({ error: "note_failed" }, 502);
  }
  return json({ saved: true });
}
