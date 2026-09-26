/**
 * כניסת Supabase ל-embed — הקובץ היחיד כאן שמכיר את Deno.
 *
 * ⚠️ **הלוגיקה חיה ב-apps/server/src/embed/, והשרת מריץ אותה ישירות.**
 * Supabase מקבל קובץ אחד שנבנה מהכניסה הזו ומהלוגיקה יחד (npm run build:edge →
 * apps/server/dist/edge/embed/index.ts), כך שיש מקור אחד לשניהם — ולא עותק
 * שנשכח לעדכן. ב-Supabase: clever-processor.
 *
 * ⚠️ עד המעבר (שלב 4 במסמך הרפקטור) הייצור עונה מכאן. אחריו הקובץ נמחק.
 */
import { handle } from "../embed/index";

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
