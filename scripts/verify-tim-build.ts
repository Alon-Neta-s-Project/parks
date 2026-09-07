import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * הבדיקה שהופכת את "טים בלבד" לטענה מדידה.
 *
 * ⚠️ הכוונה לא מספיקה. ייבוא אחד — `recommend`, `profile`, `intent`,
 * או אפילו טיפוס שנגרר איתו — מחזיר את 242 השורות לחבילה, בלי שגיאה
 * ובלי שאיש ישים לב. הבדיקה הזו קוראת את מה שנבנה בפועל וסופרת.
 */
const OUT = "dist-tim";
const rows: { nameEn: string; nameHe: string | null }[] = JSON.parse(
  readFileSync("src/data/experiences.json", "utf8"),
);

const files: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(OUT);

const bundle = files
  .filter((f) => /\.(js|html|css|json)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

/**
 * ⚠️ הכלל אינו "אפס אזכורים" — הוא "המאגר אינו בפנים".
 *
 * שאלת הדוגמה במסך שואלת על אקספדישן אוורסט, וזה בדיוק מה שמדגים שטים
 * עובד. שם מתקן בטקסט ממשק אינו דליפה.
 *
 * ולכן ההבחנה נמדדת ולא נקבעת ברשימת היתרים: שם שנמצא **גם** בקובץ
 * התרגום הוא טקסט שמישהו כתב; שם שנמצא בחבילה ואינו שם — הגיע מהדאטא.
 * רשימת היתרים הייתה מתיישנת; זו מתעדכנת מעצמה עם הניסוח.
 */
const copy = readFileSync("src/i18n/he.json", "utf8");
const fromData = (name: string) => bundle.includes(name) && !copy.includes(name);

const leakedEn = rows.filter((r) => fromData(r.nameEn));
const leakedHe = rows.filter((r) => r.nameHe && fromData(r.nameHe));
const inCopy = rows.filter(
  (r) => (bundle.includes(r.nameEn) || (r.nameHe && bundle.includes(r.nameHe))) &&
         (copy.includes(r.nameEn) || (r.nameHe !== null && copy.includes(r.nameHe))),
);

// ⚠️ ושמות הפארקים נבדקים בנפרד. הם בודדים ועלולים להופיע בטקסט ממשק
// לגמרי לגיטימי, ולכן הם מדווחים ואינם מפילים — אבל הם כן סימן שמשהו
// מהדאטא נגרר.
const parks: { name: string }[] = JSON.parse(readFileSync("src/data/parks.json", "utf8"));
const leakedParks = parks.filter((p) => fromData(p.name));

const total = files.reduce((n, f) => n + statSync(f).size, 0);
console.log(`  ${files.length} קבצים · ${Math.round(total / 1024)} KB`);
console.log(`  שמות מתקנים באנגלית בחבילה: ${leakedEn.length} מתוך ${rows.length}`);
console.log(`  שמות מתקנים בעברית בחבילה:  ${leakedHe.length} מתוך ${rows.length}`);
console.log(`  שמות פארקים בחבילה:         ${leakedParks.length} מתוך ${parks.length}`);
if (inCopy.length) {
  console.log(`  ⓘ ${inCopy.length} שמות מופיעים בטקסט הממשק (שאלות הדוגמה) — לא מהדאטא:`);
  for (const r of inCopy) console.log(`      ${r.nameHe ?? r.nameEn}`);
}

if (leakedEn.length || leakedHe.length || leakedParks.length) {
  console.error(`\n✗ ABORT — נתוני מתקנים דלפו לבנייה של "טים בלבד".`);
  for (const r of [...leakedEn, ...leakedHe].slice(0, 5)) console.error(`    ${r.nameEn}`);
  console.error(`  ⚠️ מישהו הוסיף ייבוא שגורר את src/data. זו כל הנקודה של הבנייה הזו.`);
  process.exit(1);
}
console.log(`\n✅ אפס שורות מתקנים בחבילה.`);
