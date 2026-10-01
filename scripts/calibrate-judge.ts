/**
 * Before the judge is trusted: answers whose verdict is known, judged several times.
 *
 *   npx tsx --env-file=.env.local scripts/calibrate-judge.ts [--runs 3]
 *
 * 🔴 **It must agree with every known verdict, every run.** A judge that passes a wrong answer
 * once in three is a coin with a bias, not a check. The fixtures pair real answers (from the
 * golden runs of 01.10, agent and classic) with answers that are wrong on purpose — a wrong
 * number, the opposite claim, a vague answer, a trap.
 */
import { addUsage, costLine, DEFAULT_JUDGE_MODEL, DEFAULT_JUDGE_THINKING, judge, type JudgeUsage } from "../apps/server/src/eval/judge";

const KEY = process.env.GEMINI_API_KEY!;
const MODEL = process.env.JUDGE_MODEL?.trim() || DEFAULT_JUDGE_MODEL;
const THINKING = process.env.JUDGE_THINKING?.trim() || DEFAULT_JUDGE_THINKING;
let spent: JudgeUsage = { input: 0, output: 0, thinking: 0 };
const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 3;

type Fixture = { name: string; question: string; answer: string; mustConvey: string[]; mustNotConvey?: string[]; expect: boolean };
const REFUND_Q = "הפארק נסגר לגמרי בגלל סערה — מובטח לי החזר כספי?";
const REFUND = { mustConvey: ["A refund is not guaranteed"], mustNotConvey: ["A refund is guaranteed"] };
const KIDS_Q = "יש לנו שני ילדים, אחד בגובה 100 ואחד בגובה 125. על אילו רכבות הרים ב-Islands of Adventure שניהם יכולים לעלות?";
const KIDS = {
  mustConvey: ["Flight of the Hippogriff is suitable for both children"],
  mustNotConvey: ["Hagrid's Magical Creatures Motorbike Adventure is suitable for both children"],
};
const FIXTURES: Fixture[] = [
  // The refund — the case that started this: other words, same meaning.
  { name: "refund · agent's real words ('אין הבטחה')", question: REFUND_Q, ...REFUND, expect: true,
    answer: "היי! אם הפארק נסגר לגמרי בגלל סערה, **אין הבטחה אוטומטית להחזר כספי מראש**. לפי תנאי הפארקים, הרכישות הן לרוב סופיות ואינן ניתנות להחזר אוטומטי. ההחלטה היא פרטנית של Guest Services ואינה זכות מובטחת." },
  { name: "refund · classic's real words ('לא מובטח')", question: REFUND_Q, ...REFUND, expect: true,
    answer: "היי! ממש לא מובטח החזר אוטומטי. הרכישות הן בדרך כלל סופיות, ובמקרים של מזג אוויר קיצוני ההחלטות על פיצוי מתקבלות באופן פרטני על ידי Guest Services." },
  { name: "refund · wrong: promises a refund", question: REFUND_Q, ...REFUND, expect: false,
    answer: "כן, אם הפארק נסגר לגמרי בגלל סערה תקבלו החזר כספי מלא על הכרטיסים. פשוט פנו ל-Guest Services." },
  { name: "refund · vague: says nothing", question: REFUND_Q, ...REFUND, expect: false,
    answer: "זה תלוי במצב. כדאי לבדוק באתר הרשמי מה המדיניות העדכנית ביום הביקור." },
  // Two children — the trap.
  { name: "two kids · right: only Hippogriff, Hagrid's for the older", question: KIDS_Q, ...KIDS, expect: true,
    answer: "יש רכבת הרים אחת ששניהם יכולים לעלות עליה: **Flight of the Hippogriff** (גובה מינימום 91 ס\"מ). Hagrid's Magical Creatures Motorbike Adventure דורשת 122 ס\"מ, אז היא מתאימה רק לילד בגובה 125." },
  // 🔴 The one the first calibration missed: right, and the trap's ride is not mentioned at all.
  { name: "two kids · right, Hagrid's not mentioned", question: KIDS_Q, ...KIDS, expect: true,
    answer: "ב-Islands of Adventure יש רק רכבת הרים אחת שמתאימה לשני הילדים: **Flight of the Hippogriff** — גובה המינימום הוא 91 ס\"מ, כך ששניהם יכולים לעלות וליהנות ממנה יחד. שאר רכבות ההרים בפארק דורשות גובה גבוה יותר." },
  { name: "two kids · wrong: Hagrid's for both", question: KIDS_Q, ...KIDS, expect: false,
    answer: "שניהם יכולים לעלות על Flight of the Hippogriff ועל Hagrid's Magical Creatures Motorbike Adventure — שתיהן מתאימות לגבהים שלהם." },
  // A number — a wrong one must not pass on the "meaning".
  { name: "height · right (112)", question: "הבת שלי בגובה 112 סנטימטר, היא יכולה לעלות על אקספדישן אוורסט?", expect: true,
    mustConvey: ["Expedition Everest's minimum height is 112 cm", "A child who is 112 cm tall can ride Expedition Everest"],
    answer: "כן! גובה המינימום ב-Expedition Everest – Legend of the Forbidden Mountain הוא 112 ס\"מ, כך שבגובה 112 היא יכולה לעלות." },
  { name: "height · wrong number (110)", question: "הבת שלי בגובה 112 סנטימטר, היא יכולה לעלות על אקספדישן אוורסט?", expect: false,
    mustConvey: ["Expedition Everest's minimum height is 112 cm", "A child who is 112 cm tall can ride Expedition Everest"],
    answer: "כן! גובה המינימום ב-Expedition Everest הוא 110 ס\"מ, כך שהיא יכולה לעלות בלי בעיה." },
  // Early entry — the opposite claim.
  { name: "early entry · right: once", question: "אני יכול/ה להשתמש בכניסה מוקדמת כל יום בשהות שלי ב-Epic Universe?", expect: true,
    mustConvey: ["Early entry to Epic Universe can be used only once during the whole stay, not every day"],
    answer: "לא — הכניסה המוקדמת ל-Epic Universe ניתנת לשימוש פעם אחת בלבד לאורך כל השהות שלכם, ולא בכל יום." },
  { name: "early entry · wrong: every day", question: "אני יכול/ה להשתמש בכניסה מוקדמת כל יום בשהות שלי ב-Epic Universe?", expect: false,
    mustConvey: ["Early entry to Epic Universe can be used only once during the whole stay, not every day"],
    answer: "כן, כאורחי מלון אתם זכאים לכניסה מוקדמת ל-Epic Universe בכל יום של השהות." },
];

console.log(`judge: ${MODEL}, thinking ${THINKING} · ${FIXTURES.length} fixtures × ${RUNS} runs\n`);
let agree = 0, total = 0;
const unstable: string[] = [];
for (const f of FIXTURES) {
  const got: boolean[] = [];
  for (let i = 0; i < RUNS; i++) {
    const j = await judge({ key: KEY, model: MODEL, thinkingLevel: THINKING, question: f.question, answer: f.answer, mustConvey: f.mustConvey, mustNotConvey: f.mustNotConvey });
    spent = addUsage(spent, j.usage);
    got.push(j.pass);
    total++;
    if (j.pass === f.expect) agree++;
    if (j.error) console.log(`   ⚠️ ${j.error}`);
  }
  const ok = got.every((g) => g === f.expect);
  if (new Set(got).size > 1) unstable.push(f.name);
  console.log(`${ok ? "✅" : "❌"} ${f.name.padEnd(58)} expected ${f.expect ? "pass" : "fail"} · got ${got.map((g) => (g ? "pass" : "fail")).join(" ")}`);
}
console.log(`\nagreement ${agree}/${total} · unstable: ${unstable.length ? unstable.join("; ") : "none"}`);
console.log(`cost: ${costLine(spent, total, process.env)}`);
process.exit(agree === total ? 0 : 1);
