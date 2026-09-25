import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ⚠️ `root` מפורש: בלעדיו Vite מתייחס לתיקייה שממנה הורץ כשורש, ו-`/src/main.tsx`
// ב-index.html היה נפתר מול שורש הרפו.
const root = __dirname;

export default defineConfig({
  root,
  plugins: [react()],
  base: "./",
  test: {
    // supabase/functions רצות על Deno ונבדקות ב-`deno test`. vitest אספה
    // אותן וניסתה להריץ אותן על Node, ונפלה על `Deno is not defined` —
    // כלומר סוויטה אדומה שאינה מעידה על שום דבר שבור.
    exclude: ["node_modules/**", "dist/**", "supabase/functions/**"],
  },
});
