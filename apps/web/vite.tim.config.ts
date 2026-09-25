import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * הבנייה של "טים בלבד".
 *
 * ⚠️ הנקודה כולה היא **מה שלא נכנס**: מסך אחד שאינו מייבא דבר
 * מ-`src/data`, ולכן 242 השורות אינן נוסעות למחשב של מי שגולשת.
 * `scripts/verify-tim-build.ts` סופר אותן בחבילה שנוצרה, וההרצה
 * נכשלת אם ולו שורה אחת שרדה.
 *
 * ⚠️ ואין כאן רינדור מוקדם. הוא מייצר 253 דפי HTML שכל אחד מהם מכיל
 * את פרטי המתקן שלו בטקסט גלוי — כלומר דלת שנייה לאותם נתונים.
 */
export default defineConfig({
  // ⚠️ `root` מפורש — ראו vite.config.ts.
  root: __dirname,
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-tim",
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, "tim.html") },
  },
});
