import { test } from "vitest";
import { formatChunks, formatExperiences } from "./index";
import { assertEquals, chunk } from "./test-helpers";


// ── Retrieval ─────────────────────────────────────────────────────────
// ⚠️ The mark on each chunk comes from volatility, not from the text. A caveat
// paragraph in the body of every document would pull them all closer together in
// embedding space and duplicate an existing field.

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

// ⚠️ The default leans to the safe side. An unmarked chunk is said with caution, not
// confidence — "unknown" is not "stable".
test("volatility חסר נקרא כמשתנה ולא כיציב", () => {
  const out = formatChunks([{ content: "x", volatility: null, last_verified: null , authority_tier: "T1" }]);
  assertEquals(out.includes("משתנה"), true);
  assertEquals(out.includes("יציב"), false);
});

test("ערך שאינו באוצר המילים אינו הופך ליציב", () => {
  const out = formatChunks([{ content: "x", volatility: "unknown-value", last_verified: null , authority_tier: "T1" }]);
  assertEquals(out.includes("משתנה"), true);
});

// ⚠️ The three height states, in different words. A model that receives 0 may write
// "גובה מינימום 0 ס\"מ" ("minimum height 0 cm"), which is exactly what the rule forbids.
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
  // ⚠️ The check targets the rule itself, not the character "0": the line also has
  // "עוצמה 3" ("intensity 3") and a verification date, and both contain 0 with no
  // connection to height.
  assertEquals(none.includes('0 ס"מ'), false, '0 ס"מ אסור שיגיע למסך');
  assertEquals(none.includes("גובה מינימום"), false, "0 אינו מגבלת גובה");
  assertEquals(unchecked.includes("לא ידוע אם קיימת"), true);
  // 🔴 And not "לא ידוע" ("unknown") alone — it reads as "no known limit", i.e. permission.
  assertEquals(/לא ידוע(?! אם קיימת)/.test(unchecked), false);
  // ⚠️ And with a next step. "לא בדקנו" ("we didn't check") alone stops the reader
  // without saying what to do.
  assertEquals(unchecked.includes("שילוט בכניסה"), true);
  // ⚠️ And no report about ourselves.
  assertEquals(unchecked.includes("בדקנו"), false, "אל תדווח על העבודה שלנו");
  assertEquals(unchecked.includes("אין מגבלת גובה"), false);
});

// ⚠️ fits === null is not said as "מתאים" ("fits"). It is simply not said.
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

// 🔴 **This test asserted a status that doesn't exist.**
//
// It ran Slush Gusher with `temporarily_closed` — a value the import never emits (the
// vocabulary is open · closed · check) — and expected the wording "אינו פתוח כרגע"
// ("not open right now"), which Paula's call had already replaced. So it verified an
// imaginary state against dead wording. In reality Slush Gusher carries `check`.
//
// ⚠️ And this surfaced only when the tests started running. They hadn't run at all:
// `Deno.serve` was called at module load and `deno test` failed on network permission
// before a single test.
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

// ⚠️ The three values the import actually emits must have a Hebrew tag. A value that
// falls to the default reaches the screen as an English word — and that already
// happened to `check`.
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

// 🔴 **The four states of a sensitivity flag, and all of them are said.**
//
// `"false"` was silent, and Tim answered "I don't have data on darkness sensitivity
// for Buzz Lightyear" about a column that says `false`. This test didn't exist.
test("כל אחד מארבעת מצבי הרגישות נאמר במפורש", () => {
  const base = {
    name: "X", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: 3, height_cm: null, gets_wet: null,
    skip_line: null, last_verified: null, fits: null,
    sens_heights: null, sens_loud: null, sens_strobe: null,
  };
  const said = (v: string | null) =>
    formatExperiences([{ ...base, sens_dark: v }]);

  // ⚠️ The core: checked-and-none is not silence. It is the most useful data we have.
  assertEquals(said("false").includes("חושך או מקומות סגורים: נבדק — אין"), true);
  assertEquals(said("true").includes("חושך או מקומות סגורים: כן"), true);
  assertEquals(said(null).includes("חושך או מקומות סגורים: לא נבדק"), true);
  assertEquals(said("na").includes("חושך או מקומות סגורים: לא רלוונטי"), true);

  // ⚠️ All four flags, always, even when their states differ from each other.
  const mixed = formatExperiences([{
    ...base, sens_dark: "false", sens_heights: "true",
    sens_loud: "na", sens_strobe: null,
  }]);
  for (const flag of ["חושך או מקומות סגורים", "גבהים", "רעש חזק או פתאומי", "הבזקי אור"]) {
    assertEquals(mixed.includes(flag), true, `${flag} לא נאמר`);
  }
});

// ⚠️ `undefined` is not "not checked". A database without 039 produces no statement at all.
test("דגל שלא הגיע מהמסד אינו נאמר כלא-נבדק", () => {
  const out = formatExperiences([{
    name: "X", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: 3, height_cm: null, gets_wet: null,
    skip_line: null, last_verified: null, fits: null,
  }]);
  assertEquals(out.includes("רגישויות"), false);
});

// 🔴 **What is known is said before what is missing.**
//
// Bay Slides carries a measured ceiling of 152 and a floor that wasn't checked. Tim
// opened with "לא נבדקה" ("not checked"), and a family reading a sentence that opens
// with what's missing never reaches the data we do have.
test("תקרת הגובה נאמרת לפני הרצפה החסרה", () => {
  const out = formatExperiences([{
    name: "Bay Slides", name_he: null, park: "P", land: null, status: "open",
    status_note: null, intensity: 1, height_cm: null, max_height_cm: 152,
    gets_wet: null, skip_line: null, last_verified: null, fits: null,
  }]);
  assertEquals(out.indexOf("152") < out.indexOf("לא ידוע"), true, "החסר נאמר ראשון");
  assertEquals(out.includes("עד 152"), true);
});

// ⚠️ An unrated intensity is not "intensity 0". A ride without a rating never enters
// the results of an intensity filter, and here too it is said as unrated.
// 🔴 **An empty land is "varies", not silence.**
//
// Neta asked about JAMMitors, and Tim answered "the information about the land doesn't
// appear in what I have" about data that was checked and written in the master as
// `N/A` — eight roaming performers with no fixed spot.
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
  // ⚠️ And a real land stays as it is, without the tag.
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

  // ⚠️ And the content stays in its layer, not just the heading.
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

// 🔴 The numbering is what makes citation binding possible (section 3, step 6). If it
// resets per layer, "קטע 1" ("chunk 1") points at three different things.
test("המספור רץ על פני השכבות ואינו מתאפס", () => {
  const out = formatChunks([chunk("T1", "א"), chunk("T4", "ב"), chunk("T3", "ג")]);
  assertEquals(out.includes("[קטע 1 ·"), true);
  assertEquals(out.includes("[קטע 2 ·"), true);
  assertEquals(out.includes("[קטע 3 ·"), true);
});

// ⚠️ The schema says not null, but a silent default is exactly what has broken here
// again and again. A chunk with no tier goes down — it neither rises nor vanishes.
test("קטע בלי דרגה אינו נעלם ואינו מוצג כמאומת", () => {
  const out = formatChunks([chunk("T1", "רשמי"), chunk(null, "בלי דרגה")]);
  assertEquals(out.includes("בלי דרגה"), true, "הקטע נעלם");
  assertEquals(out.indexOf("רשמי") < out.indexOf("בלי דרגה"), true, "לא מאומת הוצג לפני רשמי");
  assertEquals(out.includes("לא מסווג"), true);
});
