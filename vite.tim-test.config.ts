import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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
export default defineConfig({
  plugins: [react()],
  base: "./",
  // ⚠️ בלי תיקיית public. היא נושאת את עשר תמונות הפארקים ואת תצלום
  // הכניסה — 3 MB שאין להם צרכן במסך הזה, ושהיו נטענים לחינם.
  publicDir: false,
  build: {
    outDir: "dist-tim-test",
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, "tim-test.html") },
  },
});
