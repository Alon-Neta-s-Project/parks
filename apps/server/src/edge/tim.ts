/**
 * כניסת Supabase ל-tim — הקובץ היחיד כאן שמכיר את Deno.
 *
 * ⚠️ **הלוגיקה חיה ב-apps/server/src/tim/, והשרת מריץ אותה ישירות.**
 * Supabase מקבל קובץ אחד שנבנה מהכניסה הזו ומהלוגיקה יחד (npm run build:edge →
 * apps/server/dist/edge/tim/index.ts), כך שיש מקור אחד לשניהם — ולא עותק
 * שנשכח לעדכן. ב-Supabase: quick-worker.
 *
 * ⚠️ עד המעבר (שלב 4 במסמך הרפקטור) הייצור עונה מכאן. אחריו הקובץ נמחק.
 */
import { handle, logged } from "../tim/index";

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { toObject(): Record<string, string | undefined> };
};

// ⚠️ אותה שורת יומן כמו ב-Node וב-Netlify (tim/log.ts), ובה נתפסת חריגה — הדפדפן
// מקבל מזהה בקשה, לא את הודעת החריגה.
Deno.serve((req) => logged(req, { platform: "supabase", route: "/tim" }, (r, host) => handle(r, Deno.env.toObject(), host)));
