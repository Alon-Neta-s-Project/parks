import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * הבנייה של "טים — גרסת בדיקה".
 *
 * ⚠️ הנקודה כולה היא **מה שלא נכנס**: מסך אחד שאינו מייבא דבר
 * מ-`src/data`, ולכן 242 השורות אינן נוסעות למחשב של מי שגולשת.
 * `scripts/verify-tim-build.ts` סופר אותן בחבילה שנוצרה, וההרצה
 * נכשלת אם ולו שורה אחת שרדה.
 *
 * ⚠️ ואין כאן רינדור מוקדם. הוא מייצר 253 דפי HTML שכל אחד מהם מכיל
 * את פרטי המתקן שלו בטקסט גלוי — כלומר דלת שנייה לאותם נתונים.
 */
/**
 * 🔴 **Netlify מכבד `command` ו-`publish` לפי הקשר־ענף — אבל לא
 * `redirects` ולא `headers`.** ההקשר `[context."tim-test"]` נבנה,
 * הגיש מ-`dist-tim-test`, וההפניה שחלה בפועל הייתה הגלובלית:
 * `/* → /tim.html`. הקובץ הזה אינו קיים בבנייה הזו, ולכן כל כתובת
 * החזירה 404 — כולל השורש.
 *
 * ⚠️ **התיקון אינו הפניה נוספת אלא קבצים שקיימים.** `index.html`
 * נמצא לפני שההפניה נשקלת בכלל, ו-`tim.html` מספק את היעד של הכלל
 * הגלובלי. שניהם עותקים של אותו דף, ולכן אין כאן מסך שני שיתפצל.
 */
function emitFallbackPages() {
  return {
    name: "tim-test-fallback-pages",
    closeBundle() {
      const src = resolve(__dirname, "dist-tim-test", "tim-test.html");
      for (const name of ["index.html", "tim.html"]) {
        copyFileSync(src, resolve(__dirname, "dist-tim-test", name));
      }
    },
  };
}

export default defineConfig({
  // ⚠️ `root` מפורש — ראו vite.config.ts.
  root: __dirname,
  plugins: [react(), emitFallbackPages()],
  base: "./",
  build: {
    outDir: "dist-tim-test",
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, "tim-test.html") },
  },
});
