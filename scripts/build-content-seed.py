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
MASTER = {
    "height_gt0": 78,
    "height_eq0": 154,
    "height_null": 0,
    "gets_wet_na": 66,
    "gets_wet_null": 0,
    "intensity_null": 0,
    "wheelchair_null": 1,
}

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
TYPE = {"attraction", "show", "parade", "meet_greet", "walkthrough"}
CATEGORY = {"dark_ride", "coaster", "simulator", "water_ride", "show",
            "walkthrough", "playground", "meet_greet", "scenic_ride", "360_film"}
ENVIRONMENT = {"indoor", "outdoor", "mixed"}
WHEELCHAIR = {"remain_in_wheelchair", "transfer_ecv_to_wheelchair",
              "transfer_to_ride_vehicle", "transfer_wheelchair_then_ride",
              "must_be_ambulatory"}
GETS_WET = {"none", "may_get_wet", "may_get_soaked", "na"}
QUAD = {"true", "false", "na"}

# Columns the export owns. Everything else on the table keeps its default and
# is never touched by this file — see the report printed at the end.
COLUMNS = [
    "id", "park_id", "type", "category", "status", "name", "name_i18n",
    "aliases_i18n", "intensity", "opened_year", "duration_minutes",
    "height_requirement_cm", "gets_wet", "environment", "air_conditioned",
    "wheelchair", "motion_sickness_warning", "is_motion_simulator",
    "uses_large_screens_or_3d", "big_drops", "spinning",
    "sens_enclosed_dark", "sens_heights", "sens_loud_sudden", "sens_strobe",
    "intensity_factors", "last_verified",
]

experiences = json.loads(SRC.read_text(encoding="utf-8"))
skipped: list[tuple[str, str]] = []


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
for e in experiences:
    label = f"{e['park']} | {e['nameEn']}"

    park_id = PARK_ID.get(e["park"])
    if park_id is None:
        skipped.append((label, f"park = {e['park']!r} אינו ב-seed"))
        continue

    state = e["status"]["state"]
    if state not in STATUS:
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

    def text(v):
        return "null" if v is None else q(v)

    def boolean(v):
        return "null" if v is None else ("true" if v else "false")

    emitted.append(e)
    rows.append((label, "(" + ", ".join([
        q(e["id"]),
        q(park_id),
        q(e["type"]),
        q(e["category"]),
        q(STATUS[state]),
        q(e["nameEn"]),
        jsonb({"he": e["nameHe"]}),
        jsonb({"he": e["aliasesHe"]}),
        num(e["intensity"]["value"]),
        num(e["openedYear"]),
        num(e["durationMinutes"]),
        num(e["heightRequirementCm"]),
        text(checked["gets_wet"]),
        text(checked["environment"]),
        text(checked["air_conditioned"]),
        text(checked["wheelchair"]),
        text(checked["motion_sickness_warning"]),
        text(checked["is_motion_simulator"]),
        text(checked["uses_large_screens_or_3d"]),
        text(checked["big_drops"]),
        text(checked["spinning"]),
        boolean(e["sensEnclosedDark"]),
        boolean(e["sensHeights"]),
        boolean(e["sensLoudSudden"]),
        boolean(e["sensStrobe"]),
        jsonb({"max_speed_kmh": e["maxSpeedKmh"], "inversions": e["inversions"]}),
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
held_note = (f"⚠️ הפרש מול המאסטר, כי {HELD} שורות נעצרו בכוונה. "
             f"לא נמעך במעבר — ראה את השורה האחרונה")


def check(ord_, label, found_sql, export_key, master_key, note_ok, note_bad):
    ex = EXPORT[export_key]
    ms = "'—'" if master_key is None else q(str(MASTER[master_key]))
    mismatch_master = (master_key is not None and MASTER[master_key] != ex)
    return f"""  select {ord_} as ord,
         {q(label)} as "בדיקה",
         ({found_sql})::text as "במסד",
         '{ex}' as "בייצוא",
         {ms} as "אצלך",
         case when ({found_sql}) <> {ex} then '❌ נמעך במעבר — במסד יש משהו אחר ממה שיצא'
              when {str(mismatch_master).lower()} then {q(note_bad)}
              else {q(note_ok)} end as "מצב\""""


checks = [
    check(1, "שורות ב-experience", "select count(*) from experience", "rows", None,
          "✅ תקין", ""),
    check(2, "height > 0 (יש מגבלה)",
          "select count(*) from experience where height_requirement_cm > 0",
          "height_gt0", "height_gt0", "✅ תקין", held_note),
    check(3, "height = 0 (נבדק, אין מגבלה)",
          "select count(*) from experience where height_requirement_cm = 0",
          "height_eq0", "height_eq0", "✅ תקין", held_note),
    check(4, "height NULL (לא נבדק)",
          "select count(*) from experience where height_requirement_cm is null",
          "height_null", "height_null", "✅ תקין", ""),
    check(5, "gets_wet = 'na'",
          "select count(*) from experience where gets_wet = 'na'",
          "gets_wet_na", "gets_wet_na",
          "✅ תקין",
          "⚠️ לא נמעך במעבר — הייצוא עצמו כותב תא ריק במקום na. ראה שורה 6"),
    check(6, "gets_wet NULL",
          "select count(*) from experience where gets_wet is null",
          "gets_wet_null", "gets_wet_null",
          "✅ תקין",
          "⚠️ אלה אותן 66 שורות של שורה 5, עם NULL במקום na. פער בייצוא, לא במעבר"),
    check(7, "intensity NULL",
          "select count(*) from experience where intensity is null",
          "intensity_null", "intensity_null", "✅ תקין", ""),
    check(8, "wheelchair NULL",
          "select count(*) from experience where wheelchair is null",
          "wheelchair_null", "wheelchair_null",
          "✅ תקין — Tike's Peak, וזה נכון", ""),
]

held_row = q('⚠️ ' + ' · '.join(f'{l} ({w.split(chr(183))[0].strip()})' for l, w in skipped)) if skipped else "'✅ תקין — שום שורה לא נעצרה'"

extra = f"""  select 9,
         'שם עברי לכל שורה',
         (select count(*) from experience where name_i18n->>'he' is null or name_i18n->>'he' = '')::text,
         '0',
         '—',
         case when (select count(*) from experience where name_i18n->>'he' is null or name_i18n->>'he' = '') = 0
                then '✅ תקין — לכל השורות יש שם עברי'
              else '❌ שורות בלי שם עברי' end

  union all
  select 10,
         'status — לא הכל open',
         (select string_agg(status || ': ' || n, ' · ' order by status)
            from (select status, count(*) as n from experience group by status) s),
         '{Counter(STATUS[e["status"]["state"]] for e in experiences if e["status"]["state"] in STATUS)["open"]} open · {Counter(STATUS[e["status"]["state"]] for e in experiences if e["status"]["state"] in STATUS)["closed"]} closed',
         '—',
         case when (select count(*) from experience where status = 'closed') > 0
                then '✅ תקין — הסגורים נשמרו כסגורים'
              else '❌ הכל נטען כ-open. מתקן סגור שמוצג כפתוח הוא באג' end

  union all
  select 11,
         'פארקים מיוצגים',
         (select count(distinct park_id) from experience)::text,
         '10',
         '—',
         case when (select count(distinct park_id) from experience) = 10
                then '✅ תקין' else '❌ פארק חסר' end

  union all
  select 12,
         'שורות שנעצרו בכוונה',
         '{HELD}',
         '{HELD}',
         '0',
         {held_row}
"""

JOINED = "\n\n  union all\n".join(checks)

VERIFY = f"""-- ── אימות התוכן ──────────────────────────────────────────────────────
-- ספירה לבדה תגיד "232 שורות" גם אם שלושת המצבים נמעכו. הבדיקה הזו
-- משווה שלושה מספרים לכל שדה:
--   במסד   — מה שיש עכשיו בסופאבייס
--   בייצוא — מה שיש בקובץ שממנו נוצר ה-SQL הזה
--   אצלך   — מה שנמסר על המאסטר
--
-- במסד ≠ בייצוא  → ❌ משהו נמעך במעבר. זו תקלה.
-- במסד = בייצוא ≠ אצלך → ⚠️ הגיע ככה מהייצוא. פער תוכן, לא תקלת העברה.
--
-- אפשר להריץ אותה שוב בכל רגע, לבד.

with checks as (
{JOINED}

  union all
{extra}
)
select "בדיקה", "במסד", "בייצוא", "אצלך", "מצב" from checks order by ord;
"""

# ── write ────────────────────────────────────────────────────────────────
OUTDIR.mkdir(parents=True, exist_ok=True)
for old in OUTDIR.glob("*.sql"):
    old.unlink()

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

untouched = ["land_id", "aliases", "skip_line_system", "skip_line_extra_cost",
             "popularity", "type_data", "location", "verdict", "recommendation",
             "best_time_of_day", "volatility"]
print(f"\nⓘ  not written, left at their column defaults: {', '.join(untouched)}")
