import { test } from "vitest";
import { formatChunks, formatExperiences } from "./index";
import { assertEquals, chunk } from "./test-helpers";


// ── השליפה ────────────────────────────────────────────────────────────
// ⚠️ הסימון בכל קטע מגיע מ-volatility ולא מהטקסט. פסקת סייג בגוף כל
// מסמך הייתה מקרבת את כולם זה לזה במרחב ה-embedding וכופלת שדה קיים.

test("כל קטע מסומן לפי volatility, ולא לפי הטקסט שלו", () => {
  const out = formatChunks([
    { content: "אלף", volatility: "volatile", last_verified: "2026-09-01" , authority_tier: "T1" },
    { content: "בית", volatility: "seasonal", last_verified: null , authority_tier: "T1" },
    { content: "גימל", volatility: "static", last_verified: "2026-08-01" , authority_tier: "T1" },
  ]);
  assertEquals(out.includes("· משתנה · נבדק 2026-09-01"), true);
  assertEquals(out.includes("· עונתי]"), true);
  assertEquals(out.includes("· יציב · נבדק 2026-08-01"), true);
});

// ⚠️ ברירת המחדל היא לכיוון הבטוח. קטע בלי סימון נאמר בזהירות, לא
// בביטחון — "לא ידוע" אינו "יציב".
test("volatility חסר נקרא כמשתנה ולא כיציב", () => {
  const out = formatChunks([{ content: "x", volatility: null, last_verified: null , authority_tier: "T1" }]);
  assertEquals(out.includes("משתנה"), true);
  assertEquals(out.includes("יציב"), false);
});

test("ערך שאינו באוצר המילים אינו הופך ליציב", () => {
  const out = formatChunks([{ content: "x", volatility: "unknown-value", last_verified: null , authority_tier: "T1" }]);
  assertEquals(out.includes("משתנה"), true);
});

// ⚠️ שלושת מצבי הגובה, במילים שונות. מודל שמקבל 0 עלול לכתוב
// "גובה מינימום 0 ס\"מ", וזה בדיוק מה שהכלל אוסר.
test("שלושת מצבי הגובה נכתבים כשלוש אמירות שונות", () => {
  const base = {
    name: "X", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: 3, gets_wet: null, skip_line: null,
    last_verified: "2026-09-01", fits: null,
  };
  const limit = formatExperiences([{ ...base, height_cm: 112 }]);
  const none = formatExperiences([{ ...base, height_cm: 0 }]);
  const unchecked = formatExperiences([{ ...base, height_cm: null }]);

  assertEquals(limit.includes('גובה מינימום: 112 ס"מ'), true);
  assertEquals(none.includes("אין מגבלת גובה"), true);
  // ⚠️ הבדיקה מכוונת לכלל עצמו ולא לתו "0": בשורה יש גם "עוצמה 3" וגם
  // תאריך אימות, ושניהם מכילים 0 בלי שום קשר לגובה.
  assertEquals(none.includes('0 ס"מ'), false, '0 ס"מ אסור שיגיע למסך');
  assertEquals(none.includes("גובה מינימום"), false, "0 אינו מגבלת גובה");
  assertEquals(unchecked.includes("לא ידוע אם קיימת"), true);
  // 🔴 ולא "לא ידוע" לבדו — הוא נקרא כ"לא ידוע על מגבלה", כלומר היתר.
  assertEquals(/לא ידוע(?! אם קיימת)/.test(unchecked), false);
  // ⚠️ ובצעד הבא. "לא בדקנו" לבדו עוצר את הקוראת בלי לומר מה לעשות.
  assertEquals(unchecked.includes("שילוט בכניסה"), true);
  // ⚠️ ובלי דיווח על עצמנו.
  assertEquals(unchecked.includes("בדקנו"), false, "אל תדווח על העבודה שלנו");
  assertEquals(unchecked.includes("אין מגבלת גובה"), false);
});

// ⚠️ fits === null אינו נאמר כ"מתאים". הוא פשוט לא נאמר.
test("התאמה לא ידועה אינה נאמרת כהתאמה", () => {
  const base = {
    name: "X", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: 3, gets_wet: null, skip_line: null,
    last_verified: null, height_cm: null,
  };
  assertEquals(formatExperiences([{ ...base, fits: null }]).includes("מתאים"), false);
  assertEquals(formatExperiences([{ ...base, fits: true }]).includes("מתאים לגובה"), true);
  assertEquals(formatExperiences([{ ...base, fits: false }]).includes("לא מתאים"), true);
});

// 🔴 **הבדיקה הזו טענה סטטוס שאינו קיים.**
//
// היא הריצה את Slush Gusher עם `temporarily_closed` — ערך שהייבוא אינו
// פולט לעולם (אוצר המילים הוא open · closed · check) — וציפתה לניסוח
// "אינו פתוח כרגע" שכבר הוחלף בהכרעת פולה. כלומר היא אימתה מצב מדומיין
// מול ניסוח מת. בפועל Slush Gusher נושא `check`.
//
// ⚠️ וזה נחשף רק כשהבדיקות התחילו לרוץ. הן לא רצו כלל: `Deno.serve`
// נקרא בטעינת המודול ו-`deno test` נפל על הרשאת רשת לפני בדיקה אחת.
test("מתקן שדורש אימות מסומן בניסוח פולה, עם המשפט שלו", () => {
  const out = formatExperiences([{
    name: "Slush Gusher", name_he: null, park: "P", land: null,
    status: "check",
    status_note: "Check current Disney calendar before visit; refurbishment",
    intensity: 4, height_cm: 122, gets_wet: null, skip_line: null,
    last_verified: null, fits: null,
  }]);
  assertEquals(out.includes("יש לוודא לפני ההגעה"), true);
  assertEquals(out.includes("Check current Disney calendar"), true);
});

// ⚠️ שלושת הערכים שהייבוא באמת פולט חייבים תג עברי. ערך שנופל לברירת
// המחדל מגיע למסך כמילה באנגלית — וזה כבר קרה ל-`check`.
test("שלושת הסטטוסים של הסכמה מקבלים תג עברי, בלי ברירת מחדל", () => {
  const base = {
    name: "X", name_he: null, park: "P", land: null, status_note: null,
    intensity: 3, height_cm: null, gets_wet: null, skip_line: null,
    last_verified: null, fits: null,
  };
  for (const state of ["closed", "check"]) {
    const out = formatExperiences([{ ...base, status: state }]);
    assertEquals(out.includes(`סטטוס: ${state}`), false, `${state} נפל לברירת מחדל`);
  }
});

// 🔴 **ארבעת המצבים של דגל רגישות, וכולם נאמרים.**
//
// `"false"` שתק, וטים ענה "אין לי את הנתון לגבי רגישות לחושך במתקן
// Buzz Lightyear" על עמודה שכתוב בה `false`. הבדיקה הזו לא הייתה קיימת.
test("כל אחד מארבעת מצבי הרגישות נאמר במפורש", () => {
  const base = {
    name: "X", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: 3, height_cm: null, gets_wet: null,
    skip_line: null, last_verified: null, fits: null,
    sens_heights: null, sens_loud: null, sens_strobe: null,
  };
  const said = (v: string | null) =>
    formatExperiences([{ ...base, sens_dark: v }]);

  // ⚠️ הליבה: נבדק־ואין אינו שתיקה. הוא הנתון הכי שימושי שיש לנו.
  assertEquals(said("false").includes("חושך או מקומות סגורים: נבדק — אין"), true);
  assertEquals(said("true").includes("חושך או מקומות סגורים: כן"), true);
  assertEquals(said(null).includes("חושך או מקומות סגורים: לא נבדק"), true);
  assertEquals(said("na").includes("חושך או מקומות סגורים: לא רלוונטי"), true);

  // ⚠️ ארבעת הדגלים תמיד, גם כשמצבם שונה זה מזה.
  const mixed = formatExperiences([{
    ...base, sens_dark: "false", sens_heights: "true",
    sens_loud: "na", sens_strobe: null,
  }]);
  for (const flag of ["חושך או מקומות סגורים", "גבהים", "רעש חזק או פתאומי", "הבזקי אור"]) {
    assertEquals(mixed.includes(flag), true, `${flag} לא נאמר`);
  }
});

// ⚠️ `undefined` אינו "לא נבדק". מסד בלי 039 אינו מייצר אמירה כלל.
test("דגל שלא הגיע מהמסד אינו נאמר כלא-נבדק", () => {
  const out = formatExperiences([{
    name: "X", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: 3, height_cm: null, gets_wet: null,
    skip_line: null, last_verified: null, fits: null,
  }]);
  assertEquals(out.includes("רגישויות"), false);
});

// 🔴 **מה שידוע נאמר לפני מה שחסר.**
//
// Bay Slides נושא תקרה מדודה של 152 ורצפה שלא נבדקה. טים פתח ב"לא
// נבדקה", ומשפחה שקוראת משפט שנפתח בחסר לא מגיעה לנתון שכן יש.
test("תקרת הגובה נאמרת לפני הרצפה החסרה", () => {
  const out = formatExperiences([{
    name: "Bay Slides", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: 1, height_cm: null, max_height_cm: 152,
    gets_wet: null, skip_line: null, last_verified: null, fits: null,
  }]);
  assertEquals(out.indexOf("152") < out.indexOf("לא ידוע"), true, "החסר נאמר ראשון");
  assertEquals(out.includes("עד 152"), true);
});

// ⚠️ עוצמה שלא דורגה אינה "עוצמה 0". מתקן בלי דירוג לעולם אינו נכנס
// לתוצאות של פילטר עוצמה, וגם כאן הוא נאמר כלא-מדורג.
// 🔴 **אזור ריק הוא "משתנה", ולא שתיקה.**
//
// נטע שאלה על JAMMitors, וטים ענה "המידע לגבי האזור אינו מופיע אצלי"
// על נתון שנבדק ונכתב במאסטר כ-`N/A` — שמונה אמנים נודדים בלי מקום קבוע.
test("אזור ריק נאמר כמשתנה, ואינו נשמט", () => {
  const base = {
    name: "JAMMitors", name_he: null, park: "EPCOT", status: "open",
    status_note: null, intensity: 1, height_cm: 0, gets_wet: null,
    skip_line: null, last_verified: null, fits: null,
  };
  for (const land of [null, "N/A"]) {
    const out = formatExperiences([{ ...base, land }]);
    assertEquals(out.includes("אינו משויך לאזור מוגדר"), true, `${land}`);
    assertEquals(out.includes("N/A"), false, "N/A אינו מגיע למסך");
  }
  // ⚠️ ואזור אמיתי נשאר כפי שהוא, בלי התג.
  const real = formatExperiences([{ ...base, land: "World Nature" }]);
  assertEquals(real.includes("World Nature"), true);
  assertEquals(real.includes("אינו משויך"), false);
});

test("עוצמה שלא דורגה נאמרת ככזו", () => {
  const out = formatExperiences([{
    name: "X", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: null, height_cm: 0, gets_wet: null,
    skip_line: null, last_verified: null, fits: null,
  }]);
  assertEquals(out.includes("לא דורגה"), true);
});

test("ההקשר מגיע בשכבות, והרשמי ראשון", () => {
  const out = formatChunks([
    chunk("T4", "שמעתי שפותחים מוקדם"),
    chunk("T1", "הפארק נפתח ב-9:00"),
    chunk("T3", "הטיפ שלנו"),
  ]);

  assertEquals(out.includes("[עובדות רשמיות]"), true, "אין שכבה רשמית");
  assertEquals(out.includes("[מניסיון מבקרים — לא מאומת]"), true, "אין שכבה קהילתית");

  const official = out.indexOf("[עובדות רשמיות]");
  const ours = out.indexOf("[מהתוכן שלנו]");
  const community = out.indexOf("[מניסיון מבקרים — לא מאומת]");
  assertEquals(official < ours && ours < community, true, "הסדר אינו לפי סמכות");

  // ⚠️ והתוכן נשאר בשכבה שלו, לא רק הכותרת.
  assertEquals(out.indexOf("הפארק נפתח") < out.indexOf("שמעתי שפותחים"), true);
});

test("שם הדרגה אינו נכנס להקשר גם אחרי השכבות", () => {
  const out = formatChunks([chunk("T1", "רשמי"), chunk("T5", "קהילתי")]);
  for (const code of ["T1", "T2", "T3", "T4", "T5"]) {
    assertEquals(out.includes(code), false, `${code} דלף להקשר`);
  }
});

test("שכבה ריקה אינה מופיעה ככותרת בלי תוכן", () => {
  const out = formatChunks([chunk("T1", "רשמי בלבד")]);
  assertEquals(out.includes("[מניסיון מבקרים — לא מאומת]"), false);
  assertEquals(out.includes("[מהתוכן שלנו]"), false);
});

// 🔴 המספור הוא מה שמאפשר כבילת ציטוט (סעיף 3 שלב 6). אם הוא מתאפס
// בכל שכבה, "קטע 1" מצביע על שלושה דברים שונים.
test("המספור רץ על פני השכבות ואינו מתאפס", () => {
  const out = formatChunks([chunk("T1", "א"), chunk("T4", "ב"), chunk("T3", "ג")]);
  assertEquals(out.includes("[קטע 1 ·"), true);
  assertEquals(out.includes("[קטע 2 ·"), true);
  assertEquals(out.includes("[קטע 3 ·"), true);
});

// ⚠️ הסכמה אומרת not null, אבל ברירת מחדל שקטה היא בדיוק מה שנשבר כאן
// שוב ושוב. קטע בלי דרגה יורד, ולא עולה ולא נעלם.
test("קטע בלי דרגה אינו נעלם ואינו מוצג כמאומת", () => {
  const out = formatChunks([chunk("T1", "רשמי"), chunk(null, "בלי דרגה")]);
  assertEquals(out.includes("בלי דרגה"), true, "הקטע נעלם");
  assertEquals(out.indexOf("רשמי") < out.indexOf("בלי דרגה"), true, "לא מאומת הוצג לפני רשמי");
  assertEquals(out.includes("לא מסווג"), true);
});
