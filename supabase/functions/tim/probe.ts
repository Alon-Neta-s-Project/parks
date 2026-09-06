import { extractRideName, extractHeight } from "./index.ts";
const qs = [
  "הבת שלי בגובה 112 סנטימטר, היא יכולה לעלות על אקספדישן אוורסט?",
  "מה גובה המינימום באקספדישן אוורסט?",
  "כמה עולה אוורסט",
];
for (const q of qs) console.log(extractHeight(q), "|", JSON.stringify(extractRideName(q)));
