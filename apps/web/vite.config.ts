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
    exclude: ["node_modules/**", "dist/**"],
  },
});
