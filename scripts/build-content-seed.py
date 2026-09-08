#!/usr/bin/env python3
"""Generate the SQL that loads the 232 exported experiences into Supabase.

Same shape as build-supabase-bundle.py: this reads the export and writes the
file. Content updates are a re-run, not a rewrite by hand — which matters,
because the sensitivity tagging and the videos are still coming.

Three things this enforces structurally rather than by comment:

1. ONE multi-row INSERT per part. The column list is written once.

2. The ON CONFLICT DO UPDATE SET clause is *derived from the same column
   list* as the INSERT, so a column can never be in one and missing from the
   other. A column missing from DO UPDATE keeps its old value forever: an
   attraction whose intensity rating was withdrawn upstream would silently
   keep the withdrawn rating, and nothing would look wrong — the cell has a
   value, it is just the wrong one. Deriving both from COLUMNS makes that
   impossible rather than unlikely.

3. Closed vocabularies stop the row. A value that is not in the map is not
   coerced and does not fall back to a default; the row is left out and
   named in the report. See CLAUDE.md.

Usage: python3 scripts/build-content-seed.py
"""
import json
import pathlib
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "data" / "experiences.json"
OUTDIR = ROOT / "db" / "content-seed"

# Roughly how many characters of VALUES rows go into one part. The Supabase
# SQL editor handles the 75 KB migration bundle comfortably; this keeps each
# part in the same range.
BUDGET = 110_000

# The numbers as declared for the master, in the round-5 note. They are here
# so the verification block can tell two different failures apart: a value
# crushed on the way into the database, and a value that was already like
# that in the export. Update these when the master changes.
# ⚠️ **היה כאן dict של מספרים מהמאסטר, והוא הוסר.**
#
# הוא נועד לתת "דעה שלישית" — מה נמסר לנו על המאסטר — כדי לתפוס פער
# בין הייצוא למאסטר. הוא הפסיק להיות נחוץ ברגע שהייצוא נבנה מהמאסטר
# עצמו (scripts/build-product-export.py): מאז השניים זהים בהגדרה.
#
# 🔴 ומה שהוא כן עשה היה נזק. המספרים היו קפואים על v7_1, ולכן כל מנת
# תוכן חדשה ייצרה ⚠️ על טעינה תקינה לחלוטין — הפעם השישית שזה קורה
# בפרויקט. וגרוע מזה: אחת ההערות שלו אמרה "הייצוא עצמו כותב תא ריק
# במקום na", וזה **לא היה נכון** — המאסטר כתב N/A והייבוא שלנו זרק
# אותו. ההערה הצביעה על האשם הלא נכון במשך חודשים.
#
# מה שנשאר הוא ההשוואה שבאמת מגלה תקלה: **במסד מול בייצוא.**

PARK_ID = {
    "Magic Kingdom": "mk",
    "EPCOT": "epcot",
    "Disney's Hollywood Studios": "hs",
    "Disney's Animal Kingdom": "ak",
    "Universal Studios Florida": "us",
    "Universal Islands of Adventure": "ioa",
    "Universal Epic Universe": "epic",
    "Disney's Blizzard Beach": "bb",
    "Disney's Typhoon Lagoon": "tl",
    "Universal Volcano Bay": "vb",
}

# Mirrors the CHECK constraints in db/migrations. If a migration changes one of
# these, this list has to change with it — the conformance run catches a drift.
STATUS = {"open": "open", "closed": "closed"}   # 'check' is deliberately absent

# 'check' is not a status, it is an instruction to go and look. Two rows carry
# it, and they do not mean the same thing, so there is no mapping for the value
# itself — each row was checked against the operator's own site and decided.
#
# The guard is the 'check' in the key: the override applies only while the
# export still says 'check' for that row. If a later export says 'open', the
# row goes through the normal path and the stale decision here is ignored; if
# it says something new and unknown, the row stops as any unmapped value does.
STATUS_DECIDED = {
    # Slush Gusher — סגור לשיפוץ. אומת מול אתר דיסני, 2026-09-01.
    ("disney-s-blizzard-beach-slush-gusher", "check"): "temporarily_closed",
    # The Magic of Disney Animation — נפתח 14.9.2026. אומת מול אתר דיסני, 2026-09-01.
    ("disney-s-hollywood-studios-the-magic-of-disney-animation", "check"): "coming_soon",
    # Meet Moana at Character Landing — הכרעת פולה, 06.09: נכנס כ"לא קבוע /
    # תלוי מעבר דמות", כמו "סגור זמנית" ולא כמפגש בלוח קבוע. הסטטוס אומר
    # למשתמש שאי אפשר לסמוך על נוכחות הדמות, וזו בדיוק המשמעות.
    ("disney-s-animal-kingdom-meet-moana-at-character-landing", "check"): "temporarily_closed",
}
TYPE = {"attraction", "show", "parade", "meet_greet", "walkthrough"}
CATEGORY = {"dark_ride", "coaster", "simulator", "water_ride", "show",
            "walkthrough", "playground", "meet_greet", "scenic_ride", "360_film"}
ENVIRONMENT = {"indoor", "outdoor", "mixed"}
WHEELCHAIR = {"remain_in_wheelchair", "transfer_ecv_to_wheelchair",
              "transfer_to_ride_vehicle", "transfer_wheelchair_then_ride",
              "must_be_ambulatory"}
GETS_WET = {"none", "may_get_wet", "may_get_soaked", "na"}
QUAD = {"true", "false", "na"}


# ── מוצר הדילוג בתור ──────────────────────────────────────────────────────
# ממופה מ-fastAccess.summary ולא מ-'Lightning Lane Type'. שתי סיבות:
#
# 1. 'Lightning Lane Type' הוא שם המוצר של דיסני. ל-101 שורות יוניברסל יש
#    בו N/A, וזה נכון — אין להן Lightning Lane. המידע שלהן במקום אחר.
# 2. הייצוא נקרא בלי keep_default_na=False, ולכן 'None' ו-'N/A' כאחד
#    נמחקו מהעמודה ההיא. 75 שורות דיסני יצאו ריקות, ואי אפשר להפריד
#    ביניהן. השדה הזה הוא טקסט חופשי, והבאג לא נגע בו.
#
# התאמה מדויקת למחרוזת המלאה, לא התאמה מטושטשת. מחרוזת שאינה כאן עוצרת
# את השורה — היא לא הופכת ל-'none' בשקט. זו הטעות שהמיגרציה מתקנת, ואין
# טעם לחזור עליה בדרך פנימה.
#
# ⚠️ זהו גשר, לא יעד. התאמה לפרוזה נשברת כשמישהו מנסח מחדש — וזה כבר קרה:
# במאסטר הנוכחי כתוב "Not confirmed on the current official source used for
# this row; check the Universal app/official attraction page before buying
# Express.", בעוד כאן רשום הניסוח שבייצוא שבידי. **בייצוא הבא 52 שורות
# ייעצרו, וזה נכון** — זה הגלאי עובד, לא נשבר.
#
# ברגע שהייצוא יירוץ עם keep_default_na=False, 'Lightning Lane Type' תחזור
# להיות שמישה (היום 75 שורות דיסני יצאו ריקות כי 'None' ו-'N/A' נמחקו
# יחד). אז יש לעבור למיפוי משתי העמודות המובנות — 'Lightning Lane Type'
# לדיסני, 'Optional Fast Access / Pass' ליוניברסל — ולשמור על העצירה
# הרועשת. ערכים מובנים לא משתנים בניסוח מחדש; פרוזה כן.
SKIP_LINE = {
    "Lightning Lane Multi Pass. Included within Multi Pass; no separate per-attraction "
    "Single Pass purchase required. Also included with Premier Pass.": "multi_pass",

    "Lightning Lane Single Pass. NOT included in Multi Pass. Requires a separate paid "
    "Single Pass purchase; price varies by attraction and date. Also included with "
    "Premier Pass.": "single_pass",

    "Optional paid: Universal Express Pass at this attraction (separate valid park "
    "admission required).": "express",

    "Optional paid: Universal Express Pass at this attraction. Separate valid Epic "
    "Universe admission is still required.": "express",

    # נבדק, ואין מוצר דילוג — שתי דרכים לומר אותו דבר
    "No current Lightning Lane Multi Pass or Single Pass access.": "none",
    "N/A \u2013 Disney Lightning Lane products do not apply to the water parks.": "none",

    # "אולי", "לא אומת" — כלומר לא נבדק. NULL, לא 'none'.
    "Express availability not confirmed - check the official Universal app before "
    "buying.": None,
    "Volcano Bay Express/Express Plus may be available at participating attractions; "
    "verify this specific attraction in the current Universal app/map before "
    "purchase.": None,
    "Universal Express may be available at this attraction, but it does NOT replace "
    "the mandatory Park-to-Park admission. Verify current participation in the "
    "Universal app.": None,

    # ── ניסוחים שהופיעו ב-v7_10 ──────────────────────────────────────────
    # ⚠️ "לא אומת מול המקור הרשמי" הוא **לא נבדק**, ולכן NULL ולא 'none'.
    # 'none' פירושו "נבדק ואין מוצר", וזו אמירה אחרת לגמרי.
    "Not confirmed on the current official source used for this row; check the "
    "Universal app/official attraction page before buying Express.": None,

    # מפגש דמויות או מופע רחוב — אין מוצר דילוג, וזו תשובה ולא חוסר.
    "N/A": "none",
}

# ── העמודה המובנית, כפי שההערה למעלה ביקשה ──────────────────────────────
# ⚠️ **החסם שתואר שם נפתח.** הייצוא נבנה עכשיו ב-openpyxl ולא ב-pandas,
# ולכן 'None' ו-'N/A' נשמרים כשתי מחרוזות שונות במקום להימחק יחד. 52
# שורות דיסני שיצאו ריקות חזרו להיות ניתנות להפרדה.
#
# ולכן דיסני ממופה עכשיו מ**ערך מובנה** ולא מפרוזה. ערך מובנה אינו משתנה
# כשמישהו מנסח מחדש; פרוזה כן, וזה בדיוק מה שקרה כאן ועצר 54 שורות.
LIGHTNING_LANE = {
    "Multi Pass": "multi_pass",
    "Single Pass": "single_pass",
    "None": "none",
    # 'N/A' אינו כאן בכוונה: אצל יוניברסל ובפארקי המים אין Lightning Lane
    # כלל, והמוצר שלהם יושב בעמודה השנייה. נופלים לפרוזה רק שם.
}

# Columns the export owns. Everything else on the table keeps its default and
# is never touched by this file — see the report printed at the end.
COLUMNS = [
    "id", "key", "park_id", "land_id", "kind", "type", "category", "status",
    "status_note", "admission", "reservation", "included_with_admission",
    "subtype", "name", "name_i18n",
    "aliases_i18n", "intensity", "opened_year", "duration_minutes",
    "height_requirement_cm", "max_height_requirement_cm",
    "gets_wet", "environment", "air_conditioned",
    "wheelchair", "motion_sickness_warning", "is_motion_simulator",
    "uses_large_screens_or_3d", "big_drops", "spinning",
    "skip_line_system",
    "sens_enclosed_dark", "sens_heights", "sens_loud_sudden", "sens_strobe",
    "max_speed_kmh", "inversions", "last_verified",
]

experiences = json.loads(SRC.read_text(encoding="utf-8"))
skipped: list[tuple[str, str]] = []



import re as _re

# ⚠️ **"N/A" אינו שם של אזור.** שמונה מפגשי דמויות במאסטר אינם משויכים
# לאזור, ובעמודה כתוב N/A — כלומר "לא רלוונטי". הגזירה הנאיבית הפכה את
# זה ל-`ak-n-a`, מזהה של אזור שאינו קיים, והטעינה נעצרה על מפתח זר.
#
# היא נעצרה **בקול**, וזה בסדר. אבל אילו הייתה נוצרת שורת אזור בשם
# "N/A" — וזה מה שקובץ האזורים היה עושה — היה מופיע בממשק פארק עם אזור
# ששמו "N/A". זו אותה תבנית בפעם הרביעית היום: ערך שאומר "אין" נקרא
# כערך.
NO_LAND = {"", "n/a", "na", "none"}

def land_id(park_id: str, name: str | None) -> str | None:
    """מזהה יציב לאזור, או None כשאין אזור.

    נגזר מהפארק ומהשם, ולכן זהה בקובץ האזורים ובשורות המתקנים — בלי
    טבלת תרגום ובלי סיכון שהשניים ייפרדו."""
    if name is None or str(name).strip().lower() in NO_LAND:
        return None
    slug = _re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return f"{park_id}-{slug}" if slug else None

def text(v):
    """NULL נשאר NULL. מחרוזת ריקה אינה NULL, וגם לא להפך."""
    return "null" if v is None else q(v)


def q(s):
    """A SQL string literal. standard_conforming_strings is on, so only the
    quote needs doubling."""
    return "'" + str(s).replace("'", "''") + "'"


def jsonb(obj):
    return q(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def num(v):
    return "null" if v is None else str(v)


def member(value, allowed, field, label):
    """NULL passes through as NULL. A present value must be in the vocabulary;
    anything else stops the row rather than being coerced."""
    if value is None:
        return None, True
    if value not in allowed:
        skipped.append((label, f"{field} = {value!r} אינו באוצר המילים"))
        return None, False
    return value, True


rows = []
emitted = []          # the experiences that actually produced a row
resolved_status: list[tuple[str, str]] = []
for e in experiences:
    label = f"{e['park']} | {e['nameEn']}"

    park_id = PARK_ID.get(e["park"])
    if park_id is None:
        skipped.append((label, f"park = {e['park']!r} אינו ב-seed"))
        continue

    state = e["status"]["state"]
    decided = STATUS_DECIDED.get((e["id"], state))
    status = STATUS.get(state) or decided
    if status is None:
        note = e["status"].get("note") or ""
        skipped.append((label, f"status = {state!r} אינו באוצר המילים · {note}"))
        continue

    ok = True
    checked = {}
    for field, value, allowed in (
        ("type", e["type"], TYPE),
        ("category", e["category"], CATEGORY),
        ("environment", e["environment"], ENVIRONMENT),
        ("wheelchair", e["wheelchair"], WHEELCHAIR),
        ("gets_wet", e["getsWet"], GETS_WET),
        ("air_conditioned", e["airConditioned"], QUAD),
        ("motion_sickness_warning", e["motionSicknessWarning"], QUAD),
        ("is_motion_simulator", e["isMotionSimulator"], QUAD),
        ("uses_large_screens_or_3d", e["usesLargeScreensOr3d"], QUAD),
        ("big_drops", e["bigDrops"], QUAD),
        ("spinning", e["spinning"], QUAD),
    ):
        checked[field], good = member(value, allowed, field, label)
        ok = ok and good
    if not ok:
        continue

    # ⚠️ העמודה המובנית קודמת. ראה ההערה ליד LIGHTNING_LANE.
    lane = (e.get("fastAccess") or {}).get("lightningLaneType")
    summary = (e.get("fastAccess") or {}).get("summary")
    if lane in LIGHTNING_LANE:
        summary = None  # לא נדרש; הערך המובנה הכריע
    elif summary not in SKIP_LINE:
        skipped.append((label, f"fastAccess.summary אינו באוצר המילים: {(summary or '')[:60]!r}"))
        continue

    def boolean(v):
        return "null" if v is None else ("true" if v else "false")

    emitted.append(e)
    resolved_status.append((e["id"], status))
    rows.append((label, "(" + ", ".join([
        q(e["id"]),
        q(e["key"]),
        q(park_id),
        text(land_id(park_id, e["land"])),
        q(e["kind"]),
        q(e["type"]),
        q(e["category"]),
        q(status),
        text(e["status"].get("note")),
        text(e["admission"]),
        text(e["reservation"]),
        text(e["includedWithAdmission"]),
        text(e["subtype"]),
        q(e["nameEn"]),
        jsonb({"he": e["nameHe"]}),
        jsonb({"he": e["aliasesHe"]}),
        num(e["intensity"]["value"]),
        num(e["openedYear"]),
        num(e["durationMinutes"]),
        num(e["heightRequirementCm"]),
        # ⚠️ הכיוון ההפוך: עד כמה מותר להיות גבוה. חמש שורות בלבד,
        # וכולן אזורי מים לפעוטות שבהם המספר במאסטר היה תקרה.
        num(e["maxHeightRequirementCm"]),
        text(checked["gets_wet"]),
        text(checked["environment"]),
        text(checked["air_conditioned"]),
        text(checked["wheelchair"]),
        text(checked["motion_sickness_warning"]),
        text(checked["is_motion_simulator"]),
        text(checked["uses_large_screens_or_3d"]),
        text(checked["big_drops"]),
        text(checked["spinning"]),
        text(LIGHTNING_LANE[lane] if lane in LIGHTNING_LANE else SKIP_LINE[summary]),
        boolean(e["sensEnclosedDark"]),
        boolean(e["sensHeights"]),
        boolean(e["sensLoudSudden"]),
        boolean(e["sensStrobe"]),
        # ⚠️ עמודות, לא שק. intensity_factors ירדה ב-023: היא הייתה
        # not null default '{}', כלומר "נבדק, אין מה לדווח" על 210 שורות
        # שאיש לא בדק. NULL כאן אומר לא נבדק, ו-0 היפוכים אומר נבדק ואין.
        num(e["maxSpeedKmh"]),
        num(e["inversions"]),
        q(e["lastVerified"]),
    ]) + ")"))

assert all(len(v.split("), (")) for _, v in rows)

# ── the upsert ───────────────────────────────────────────────────────────
# Derived from COLUMNS, not written out again. Every column the INSERT sets is
# also refreshed here, NULL included; id is the conflict key.
SET = ",\n  ".join(f"{c} = excluded.{c}" for c in COLUMNS if c != "id")
assert SET.count("excluded.") == len(COLUMNS) - 1

INSERT_HEAD = (
    "insert into experience\n  (" + ", ".join(COLUMNS) + ")\nvalues\n"
)
CONFLICT = (
    "\non conflict (id) do update set\n  " + SET + ",\n  updated_at = now();\n"
)

# ── split into parts ─────────────────────────────────────────────────────
parts: list[list[str]] = [[]]
size = 0
for _, values in rows:
    if size and size + len(values) > BUDGET:
        parts.append([])
        size = 0
    parts[-1].append(values)
    size += len(values)

# ── numbers measured from the export, for the verification block ─────────
heights = [e["heightRequirementCm"] for e in emitted]
wet = Counter(e["getsWet"] for e in emitted)
EXPORT = {
    "rows": len(rows),
    "height_gt0": sum(1 for v in heights if v is not None and v > 0),
    "height_eq0": sum(1 for v in heights if v == 0),
    "height_null": sum(1 for v in heights if v is None),
    "gets_wet_na": wet.get("na", 0),
    "gets_wet_null": wet.get(None, 0),
    "intensity_null": sum(1 for e in emitted if e["intensity"]["value"] is None),
    "wheelchair_null": sum(1 for e in emitted if e["wheelchair"] is None),
}
HELD = len(skipped)


def check(ord_, label, found_sql, export_key, note_ok):
    """שורה אחת בטבלת האימות.

    ⚠️ **שתי עמודות ולא שלוש.** ההשוואה היחידה שמגלה תקלה היא במסד מול
    בייצוא — כלומר "האם משהו נמעך במעבר". השוואה למספר שנמסר בעבר על
    המאסטר אינה בדיקה; היא ⚠️ שמופיע בכל מנת תוכן חדשה ושולח לחפש
    תקלה שאינה קיימת."""
    ex = EXPORT[export_key]
    return f"""  select {ord_} as ord,
         {q(label)} as "בדיקה",
         ({found_sql})::text as "במסד",
         '{ex}' as "בייצוא",
         case when ({found_sql}) <> {ex} then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              else {q(note_ok)} end as "מצב\""""


checks = [
    check(1, "שורות ב-experience", "select count(*) from experience", "rows",
          "✅ תקין"),
    check(2, "height > 0 (יש מגבלה)",
          "select count(*) from experience where height_requirement_cm > 0",
          "height_gt0", "✅ תקין"),
    check(3, "height = 0 (נבדק, אין מגבלה)",
          "select count(*) from experience where height_requirement_cm = 0",
          "height_eq0", "✅ תקין"),
    # ⚠️ הכלל, ולא הפילוח: NULL אינו "מתאים לכל המשפחה".
    check(4, "height NULL (לא נבדק)",
          "select count(*) from experience where height_requirement_cm is null",
          "height_null", "✅ תקין"),
    check(5, "gets_wet = 'na'",
          "select count(*) from experience where gets_wet = 'na'",
          "gets_wet_na", "✅ תקין — 'na' הוא מופע, וזו תשובה"),
    # ⚠️ NULL הוא "לא נבדק". שהוא אפס — זה הכלל.
    check(6, "gets_wet NULL (לא נבדק)",
          "select count(*) from experience where gets_wet is null",
          "gets_wet_null", "✅ תקין"),
    check(7, "intensity NULL",
          "select count(*) from experience where intensity is null",
          "intensity_null", "✅ תקין"),
    check(8, "wheelchair NULL",
          "select count(*) from experience where wheelchair is null",
          "wheelchair_null", "✅ תקין — Tike's Peak, וזה נכון"),
]

SKIP = Counter(SKIP_LINE[(e.get("fastAccess") or {}).get("summary")] for e in emitted)
SKIP_NULL = SKIP.get(None, 0)
SKIP_NONE = SKIP.get("none", 0)
SKIP_TALLY = " · ".join(f"{k or '(לא נבדק)'}: {v}" for k, v in SKIP.most_common())

STATUS_TALLY = " · ".join(f"{n} {st}" for st, n in sorted(
    Counter(r[1] for r in resolved_status).items(), key=lambda kv: -kv[1]))

held_row = q('⚠️ ' + ' · '.join(f'{l} ({w.split(chr(183))[0].strip()})' for l, w in skipped)) if skipped else "'✅ תקין — שום שורה לא נעצרה'"

extra = f"""  select 9,
         'שם עברי לכל שורה',
         (select count(*) from experience where name_i18n->>'he' is null or name_i18n->>'he' = '')::text,
         '0',
         case when (select count(*) from experience where name_i18n->>'he' is null or name_i18n->>'he' = '') = 0
                then '✅ תקין — לכל השורות יש שם עברי'
              else '❌ שורות בלי שם עברי' end

  union all
  select 10,
         'status — לא הכל open',
         (select string_agg(status || ': ' || n, ' · ' order by status)
            from (select status, count(*) as n from experience group by status) s),
         '{STATUS_TALLY}',
         case when (select count(*) from experience where status = 'closed') > 0
                then '✅ תקין — הסגורים נשמרו כסגורים'
              else '❌ הכל נטען כ-open. מתקן סגור שמוצג כפתוח הוא באג' end

  union all
  select 11,
         'פארקים מיוצגים',
         (select count(distinct park_id) from experience)::text,
         '10',
         case when (select count(distinct park_id) from experience) = 10
                then '✅ תקין' else '❌ פארק חסר' end

  union all
  select 11.5,
         'מוצר דילוג בתור',
         (select string_agg(coalesce(skip_line_system,'(לא נבדק)') || ': ' || n, ' · ' order by n desc)
            from (select skip_line_system, count(*) as n from experience group by 1) s),
         '{SKIP_TALLY}',
         case when (select count(*) from experience where skip_line_system is null) = {SKIP_NULL}
               and (select count(*) from experience where skip_line_system = 'none') = {SKIP_NONE}
                then '✅ תקין — NULL הוא "לא נבדק", לא "אין"'
              else '❌ לא תואם לייצוא' end

  union all
  select 12,
         'שורות שנעצרו בכוונה',
         '{HELD}',
         '{HELD}',
         {held_row}
"""

JOINED = "\n\n  union all\n".join(checks)

VERIFY = f"""-- ── אימות התוכן ──────────────────────────────────────────────────────
-- ספירה לבדה תגיד "232 שורות" גם אם שלושת המצבים נמעכו. הבדיקה הזו
-- משווה שני מספרים לכל שדה:
--   במסד   — מה שיש עכשיו בסופאבייס
--   בייצוא — מה שיש בקובץ שממנו נוצר ה-SQL הזה
--
-- ⚠️ **שתי עמודות ולא שלוש.** הייתה כאן עמודה שלישית, "אצלך", שהשוותה
-- למספרים שנמסרו על המאסטר. היא הפסיקה להיות נחוצה כשהייצוא נבנה
-- מהמאסטר עצמו, והמספרים שבה נשארו קפואים — כלומר היא הדליקה ⚠️ על
-- טעינה תקינה בכל מנת תוכן חדשה.
--
-- במסד ≠ בייצוא → ❌ משהו נמעך במעבר. זו ההשוואה שמגלה תקלה.
--
-- אפשר להריץ אותה שוב בכל רגע, לבד.

with checks as (
{JOINED}

  union all
{extra}
)
select "בדיקה", "במסד", "בייצוא", "מצב" from checks order by ord;
"""


OUTDIR.mkdir(parents=True, exist_ok=True)
for _old in OUTDIR.glob("*.sql"):
    _old.unlink()
RULE = "-- " + "=" * 74

# ── האזורים ──────────────────────────────────────────────────────────
# experience.land_id הוא מפתח זר ל-land, ולכן השורות האלה חייבות להיטען
# לפני התוכן — אחרת כל 232 השורות נדחות.
#
# ⚠️ 79 שורות ולא 77. "Park-wide" מופיע בשלושה פארקים, ונספר פעם אחת
# ברשימת השמות הייחודיים. והוא גם אינו אזור אלא היעדרו — מצעד או נגן
# מסתובב אינם נמצאים באזור מסוים. הוא נשמר כשורה משלו ולא כ-NULL, כי
# NULL כאן פירושו "לא נבדק", וזה נבדק.
# ⚠️ אזור שאין לו מזהה אינו נכנס לקובץ האזורים. ראה ההערה ליד land_id.
lands = sorted({
    (PARK_ID[e["park"]], e["land"]) for e in emitted
    if e["park"] in PARK_ID and land_id(PARK_ID[e["park"]], e["land"]) is not None
})
land_rows = ",\n".join(
    "(" + ", ".join([q(land_id(pid, name)), q(pid), q(name), jsonb({})]) + ")"
    for pid, name in lands
)
LAND_SQL = f"""{RULE}
-- Park Day Companion — אזורים בפארקים ({len(lands)} שורות)
{RULE}
--
-- ⚠️ להריץ **לפני** קובצי התוכן. experience.land_id הוא מפתח זר לטבלה
--    הזו, ובלעדיה כל שורות המתקנים נדחות.
--
-- נוצר על ידי scripts/build-content-seed.py. אין לערוך ביד.
--
-- המזהה נגזר מהפארק ומשם האזור, ולכן הוא זהה כאן ובשורות המתקנים בלי
-- טבלת תרגום ובלי סיכון שהשניים ייפרדו.
--
-- zone ו-sort_order אינם נכתבים: הייצוא אינו נושא אותם. sort_order נשאר
-- בברירת המחדל 0, כלומר "בלי סדר", ולא כהצהרה על סדר.
{RULE}

BEGIN;

set local search_path = public, extensions;

insert into land (id, park_id, name, name_i18n)
values
{land_rows}
on conflict (id) do update set
  park_id = excluded.park_id,
  name = excluded.name;

COMMIT;
"""
(OUTDIR / "land.sql").write_text(LAND_SQL, encoding="utf-8")

# ── write ────────────────────────────────────────────────────────────────
n = len(parts)
RULE = "-- " + "=" * 74
for i, chunk in enumerate(parts, 1):
    last = i == n
    head = f"""{RULE}
-- Park Day Companion — תוכן: חלק {i} מתוך {n}
{RULE}
--
-- {len(chunk)} מתקנים. להדביק ל-Supabase SQL Editor ולהריץ.
-- ⚠️ להריץ את החלקים לפי הסדר: 1, ואז 2{"..." if n > 2 else ""}{f", ואז {n}" if n > 2 else ""}.
--
-- נוצר על ידי scripts/build-content-seed.py מתוך src/data/experiences.json.
-- אין לערוך ביד — לעדכן את הייצוא ולהריץ את הסקריפט מחדש.
--
-- INSERT אחד מרובה-שורות. רשימת העמודות נכתבת פעם אחת.
--
-- on conflict do update מרענן את **כל** {len(COLUMNS) - 1} העמודות מ-excluded,
-- גם כשהערך החדש NULL. עמודה שחסרה שם הייתה משאירה ערך ישן לנצח: מתקן
-- שדירוג העוצמה שלו הוסר בייצוא חדש היה נשאר עם הדירוג הישן, ושום דבר לא
-- היה נראה שבור — בתא יש ערך, הוא פשוט שגוי. לכן ה-SET נגזר מאותה רשימת
-- עמודות ולא נכתב שוב.
--
-- אפשר להריץ שוב בבטחה, כמה פעמים שרוצים.
--
{RULE}

BEGIN;

set local search_path = public, extensions;

{INSERT_HEAD}"""
    body = ",\n".join(chunk)
    text = head + body + CONFLICT + "\nCOMMIT;\n"
    if last:
        text += "\n" + VERIFY
    (OUTDIR / f"content-{i}-of-{n}.sql").write_text(text, encoding="utf-8")

(OUTDIR / "verify-content.sql").write_text(VERIFY, encoding="utf-8")

# ── report ───────────────────────────────────────────────────────────────
print(f"{len(rows)} rows of {len(experiences)} → {n} parts in db/content-seed/")
for i, chunk in enumerate(parts, 1):
    p = OUTDIR / f"content-{i}-of-{n}.sql"
    print(f"  content-{i}-of-{n}.sql   {len(chunk):3} rows   {p.stat().st_size / 1024:.0f} KB")
print(f"  verify-content.sql (also appended to part {n})")
print(f"\n  {len(COLUMNS)} columns written, {len(COLUMNS) - 1} refreshed on conflict")

if skipped:
    print(f"\n⚠️  {len(skipped)} rows left out — a value outside a closed vocabulary")
    print("    stops the row rather than falling back to a default:")
    for label, why in skipped:
        print(f"      {label}\n        {why}")

# Derived, not restated: a hand-kept list goes stale the moment a column moves
# into COLUMNS, and then the report quietly says the opposite of the truth.
TABLE_COLUMNS = [
    "id", "key", "park_id", "land_id", "kind", "type", "status", "status_note",
    "admission", "reservation", "included_with_admission", "subtype",
    "name", "name_i18n", "aliases",
    "aliases_i18n", "category", "opened_year", "duration_minutes", "intensity",
    "height_requirement_cm", "max_height_requirement_cm",
    "gets_wet", "environment", "air_conditioned",
    "wheelchair", "skip_line_system", "popularity",
    "sens_enclosed_dark", "sens_heights", "sens_loud_sudden", "sens_strobe",
    "max_speed_kmh", "inversions", "type_data", "location", "verdict", "recommendation",
    "best_time_of_day", "volatility", "last_verified", "created_at", "updated_at",
    "motion_sickness_warning", "is_motion_simulator", "uses_large_screens_or_3d",
    "big_drops", "spinning",
]
assert not set(COLUMNS) - set(TABLE_COLUMNS), set(COLUMNS) - set(TABLE_COLUMNS)
untouched = [c for c in TABLE_COLUMNS
             if c not in COLUMNS and c not in ("created_at", "updated_at")]
print(f"\nⓘ  not written, left at their column defaults: {', '.join(untouched)}")


# ── מה שכבר אינו בייצוא ──────────────────────────────────────────────────
# ⚠️ **הטעינה היא upsert, והיא לעולם אינה מוחקת.** שורה שהוסרה מהמאסטר
# נשארת במסד לנצח, וטים ממשיך לענות עליה. בטעינת v7_10 התגלו שלוש כאלה:
# Hammerhead Beach (הודר בהכרעת תוכן), Taniwha Tubes (הוחלף בשתי שורות
# מפוצלות), ו-The Mystic Fountain (נעלם מהמאסטר בלי שאיש ציין זאת).
#
# מתקן שהוסר וממשיך להופיע הוא בדיוק הכשל שהמוצר בנוי נגדו — תוכן ישן
# שמוצג כאילו הוא עדכני. ולכן הקובץ הזה נוצר בכל בנייה.
#
# ⚠️ **והוא אינו מוחק בשקט.** הוא מדפיס תחילה מה עומד להימחק, כדי שמי
# שמריצה תראה זאת לפני שזה קורה ולא אחרי.
keys_sql = ",\n  ".join("(" + q(e["key"]) + ")" for e in emitted)
(OUTDIR / "prune-content.sql").write_text(f"""-- Park Day Companion — מה שכבר אינו בייצוא
--
-- ⚠️ **מוחק שורות.** להריץ **אחרי** קובצי התוכן, ורק אחריהם.
--
-- הטעינה היא upsert ואינה מוחקת דבר. שורה שהוסרה מהמאסטר — כי הוחלפה,
-- כי הוחלט להדיר אותה, או כי נשמטה בטעות — נשארת במסד וטים ממשיך לענות
-- עליה. זה בדיוק "תוכן ישן שמוצג כאילו הוא עדכני".
--
-- הרשימה נגזרת מהייצוא הנוכחי ({len(emitted)} שורות), ולכן היא תמיד
-- מעודכנת. אין כאן מפתחות כתובים ביד.

BEGIN;

create temporary table _current (key text primary key) on commit drop;
insert into _current (key) values
  {keys_sql};

-- ⚠️ קודם רואים, ואז מוחקים.
select e.key as "יימחק — אינו בייצוא", e.name as "שם"
from experience e
where e.key not in (select key from _current)
order by e.key;

delete from experience e where e.key not in (select key from _current);

select count(*) as "נשארו במסד" from experience;

COMMIT;
""", "utf-8")
print(f"  prune-content.sql        (מוחק מה שאינו בייצוא)")
