/**
 * כניסת Supabase ל-aliases — הקובץ היחיד כאן שמכיר את Deno.
 *
 * ⚠️ **הלוגיקה חיה ב-apps/pipeline/src/enrich/aliases.ts, והצנרת מריצה אותה ישירות.**
 * Supabase מקבל קובץ אחד שנבנה מהכניסה הזו ומהלוגיקה יחד (npm run build:edge →
 * apps/pipeline/dist/edge/aliases/index.ts), כך שיש מקור אחד לשניהם — ולא עותק
 * שנשכח לעדכן. ב-Supabase: (ראו edge-functions-slugs.md).
 *
 * ⚠️ עד ש-CI יריץ את הצנרת ישירות (npm -w apps/pipeline run aliases), הוא קורא
 * לפונקציה ב-Supabase. אחרי זה הקובץ נמחק.
 */
import { handle } from "../enrich/aliases";

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { toObject(): Record<string, string | undefined> };
};

Deno.serve(async (req) => {
  try {
    return await handle(req, Deno.env.toObject());
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "unhandled", detail: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }
});
