#!/usr/bin/env python3
"""חותם כל מיגרציה ברישום עצמי, ומייצר את הקבצים שנטע מריצה.

🔴 **קיים כי המסד לא ידע מה רץ עליו.** 45 מיגרציות הורצו בהדבקה ידנית,
והידע אילו מהן רצו חי ברשימת השאילתות השמורות ובהיסטוריית צ'אט. הקובץ
הזה מוסיף לכל מיגרציה שורה אחת בסוף, שרושמת את עצמה ב-`schema_migration`
ברגע שהיא רצה — ולכן הרישום אינו משימה שמישהו צריך לזכור.

⚠️ **ושאילתה שמורה אינה הרצה שהצליחה.** 044 הודבקה, קיבלה שם, ונפלה.
לכן המצב `verified` קיים: לא "מישהו זוכר שהריץ", אלא **המסד מראה את
התוצאה**.

⚠️ **החתימה מחושבת על הגוף בלבד**, כלומר על כל מה שמעל בלוק הרישום.
אחרת כל חישוב היה משנה את מה שהוא מודד.

⚠️ **וקובץ הפריסה נגזר, ולא מודבק פעמיים.** `data/deploy/044-turn-log.txt`
היה עותק ידני של המיגרציה — התבנית שהפילה את קובצי הזרע. כאן הוא נבנה,
ו---check נופל על כל פער.

  python3 scripts/migration-log.py --check     # שער ה-QA
  python3 scripts/migration-log.py --write     # לעדכן חתימות וקובצי פריסה
  python3 scripts/migration-log.py --verify    # לבנות את קובץ האימות
  python3 scripts/migration-log.py --ship 044_turn_log.sql
"""
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIG = ROOT / "db" / "migrations"
DEPLOY = ROOT / "data" / "deploy"

OPEN, CLOSE = "-- <migration-log>", "-- </migration-log>"

# ── טביעת האצבע של כל מיגרציה במסד ──────────────────────────────────
# 🔴 **לכל אחת מהן יש אחת.** ההנחה הראשונה שלי הייתה שאי אפשר לשחזר
# מה רץ, והיא הייתה שגויה: עמודה שנוספה, אילוץ שהוחלף, הערה על עמודה,
# פוליסי שהוסר, או מחרוזת בגוף פונקציה — כולם נשארים במסד.
#
# ⚠️ **הבדיקה היא על התוצאה, לא על ההרצה.** מיגרציה שנדרסה על ידי
# מאוחרת יותר עדיין עוברת, וזה נכון: מה שחשוב הוא שהמצב קיים.
PROBES: dict[str, str] = {
    "001_extensions_and_taxonomy.sql": "exists (select 1 from pg_extension where extname = 'vector')",
    "002_content.sql":                 "to_regclass('public.experience') is not null",
    "003_knowledge.sql":               "to_regclass('public.knowledge_doc') is not null",
    "004_users_trips.sql":             "to_regclass('public.profile_fact') is not null",
    "005_conversations.sql":           "to_regclass('public.conversation') is not null",
    "006_rls.sql":                     "pg_temp.has_fn('is_admin')",
    "007_content_fields.sql":          "pg_temp.has_col('experience','motion_sickness_warning')",
    "008_profile_axes.sql":            "to_regclass('public.profile_effective') is not null",
    "009_plan_item_interest.sql":      "pg_temp.has_col('plan_item','interest')",
    "010_trip_members.sql":            "to_regclass('public.trip_member') is not null",
    # ⚠️ `park_kind` יושבת על `park` ולא על `experience` — הבדיקה הראשונה
    # שכתבתי חיפשה אותה בטבלה הלא נכונה, והמסד המקומי תפס את זה.
    "011_conformance_fixes.sql":       "pg_temp.has_col('park','park_kind')\n         and not pg_temp.col_required('experience','intensity')",
    "012_height_none.sql":             "pg_temp.con('experience','experience_height_requirement_cm_check') like '%= 0%'",
    "013_scenic_ride.sql":             "pg_temp.con('experience','experience_category_check') like '%scenic_ride%'",
    "014_gets_wet_na.sql":             "pg_temp.con('experience','experience_gets_wet_check') like '%na%'",
    "015_trip_park_days.sql":          "pg_temp.has_col('trip','park_days')",
    "016_skip_line_neutral.sql":       "pg_temp.con('experience','experience_skip_line_system_check') like '%express%'\n         and not pg_temp.col_required('experience','skip_line_system')",
    "017_drop_skip_line_extra_cost.sql": "not pg_temp.has_col('experience','skip_line_extra_cost')",
    "018_rate_limit.sql":              "to_regclass('public.api_call') is not null",
    "019_content_fields_from_export.sql": "pg_temp.has_col('experience','subtype')",
    "020_rate_limit_rpc.sql":          "pg_temp.has_fn('check_rate_limit')",
    "021_global_daily_cap.sql":        "pg_temp.has_fn('rate_limit_daily_cap')",
    "022_measured_cost.sql":           "pg_temp.has_fn('estimated_cost_per_message')",
    "023_speed_and_inversions.sql":    "pg_temp.has_col('experience','max_speed_kmh')",
    "024_embedding_1536.sql":          "pg_temp.col_type('knowledge_chunk','embedding') like '%1536%'",
    "025_knowledge_taxonomy.sql":      "pg_temp.has_col('knowledge_doc','product_family')",
    "026_rate_limit_caps_not_arguments.sql": "pg_temp.has_fn('rate_limit_max_per_window')",
    "027_ingest_rpc.sql":              "pg_temp.has_fn('ingest_set_key')",
    "028_match_knowledge.sql":         "pg_temp.has_fn('match_knowledge')",
    "029_find_experiences.sql":        "pg_temp.has_fn('find_experiences')",
    "030_find_experiences_by_words.sql": "pg_temp.fn_src('find_experiences') like '%ilike%'",
    "031_alias_candidates.sql":        "to_regclass('public.alias_candidate') is not null",
    "032_alias_reject_useless.sql":    "pg_temp.has_fn('alias_add')",
    "033_embedding_follows_content.sql": "exists (select 1 from pg_trigger where tgname = 'knowledge_chunk_content_changed')",
    # ⚠️ שתי 034 — ולכל אחת טביעה אחרת לגמרי. זו הסיבה שהמפתח הוא שם.
    "034_eight_hebrew_names.sql":      "exists (select 1 from experience\n                   where key = 'EPCOT|Entertainment|JAMMitors'\n                     and name_i18n->>'he' is not null)",
    "034_sensitivities_vocabulary.sql": "pg_temp.con('trip_member','trip_member_sensitivities_vocab') like '%motionSickness%'",
    # 🔴 היעדר פוליסי לבדו אינו ראיה — הוא נכון גם אם היא מעולם לא נוצרה.
    # ההערה על הטבלה מזכירה את מספר המיגרציה, וזו הטביעה האמיתית.
    "035_sources_are_not_public.sql":  "pg_temp.tbl_note('experience_source') like '%035%'\n         and not pg_temp.has_policy('experience_source','experience_source_read')",
    "036_knowledge_is_not_public.sql": "pg_temp.tbl_note('knowledge_doc') like '%036%'\n         and not pg_temp.has_policy('knowledge_chunk','knowledge_chunk_read')",
    "037_bucket_daily_cap.sql":        "pg_temp.has_fn('rate_limit_bucket_daily_cap')",
    "038_max_height.sql":              "pg_temp.has_col('experience','max_height_requirement_cm')",
    "039_sensitivity_flags_to_tim.sql": "pg_temp.fn_src('find_experiences') like '%sens_heights%'",
    "040_sensitivity_four_states.sql": "pg_temp.col_note('experience','sens_heights') like '%ארבעה%'",
    "041_park_intro.sql":              "pg_temp.has_col('park','intro_he')",
    "042_description_and_meet_location.sql": "pg_temp.has_col('experience','description_he')",
    "043_park_candidates.sql":         "pg_temp.has_fn('park_candidates')",
    "044_turn_log.sql":                "to_regclass('public.turn_log') is not null",
}

HELPERS = """-- ── עוזרים זמניים (נעלמים בסוף הסשן) ────────────────────────────────
create or replace function pg_temp.has_col(t text, c text) returns boolean
  language sql stable as $fn$
  select exists (select 1 from pg_attribute
                  where attrelid = to_regclass('public.' || t)
                    and attname = c and attnum > 0 and not attisdropped);
$fn$;

create or replace function pg_temp.col_required(t text, c text) returns boolean
  language sql stable as $fn$
  select coalesce((select attnotnull from pg_attribute
                    where attrelid = to_regclass('public.' || t) and attname = c), false);
$fn$;

create or replace function pg_temp.col_type(t text, c text) returns text
  language sql stable as $fn$
  select format_type(atttypid, atttypmod) from pg_attribute
   where attrelid = to_regclass('public.' || t) and attname = c;
$fn$;

create or replace function pg_temp.col_note(t text, c text) returns text
  language sql stable as $fn$
  select col_description(to_regclass('public.' || t), attnum) from pg_attribute
   where attrelid = to_regclass('public.' || t) and attname = c;
$fn$;

create or replace function pg_temp.tbl_note(t text) returns text
  language sql stable as $fn$
  select obj_description(to_regclass('public.' || t), 'pg_class');
$fn$;

create or replace function pg_temp.con(t text, c text) returns text
  language sql stable as $fn$
  select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = to_regclass('public.' || t) and conname = c;
$fn$;

create or replace function pg_temp.has_fn(n text) returns boolean
  language sql stable as $fn$
  select exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'public' and p.proname = n);
$fn$;

create or replace function pg_temp.fn_src(n text) returns text
  language sql stable as $fn$
  select string_agg(pg_get_functiondef(p.oid), ' ')
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = n;
$fn$;

create or replace function pg_temp.has_policy(t text, p text) returns boolean
  language sql stable as $fn$
  select exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = t and policyname = p);
$fn$;
"""

VERIFY_HEAD = """-- verify-migration-log — לבדוק במסד מה באמת רץ (14.09.2026)
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase ← SQL Editor
-- שם השאילתה: verify-migration-log (כלי חוזר — לא צריך מספר)
-- ⚠️ להריץ **אחרי** 000.
--
-- 🔴 **הוא אינו סומך על אף רשימה — הוא שואל את המסד.** לכל מיגרציה
-- יש טביעת אצבע שנשארת אחריה: עמודה שנוספה, אילוץ שהוחלף, הערה על
-- עמודה, פוליסי שהוסר, או מחרוזת בגוף פונקציה. הקובץ בודק את כולן.
--
-- ⚠️ **ולכן שאילתה שמורה אינה מספיקה.** 044 יושבת ברשימת השאילתות,
-- קיבלה שם, הודבקה — ונפלה. רשימה מראה מה נכתב; המסד מראה מה קרה.
--
-- ✅ **מה שעובר נרשם כ-`verified`.** לא `observed`: לא ראינו אותה רצה,
-- ראינו שהתוצאה שלה כאן. מה שנכשל **אינו נרשם בכלל**, ומופיע בטבלה
-- שבסוף — ואלה המיגרציות שצריך לבדוק ביד.
--
-- ⚠️ **רישום אמיתי גובר.** מיגרציה שנרשמה בזמן ההרצה (`observed`)
-- אינה מוחלפת כאן. ראיה ישירה גוברת על בדיקה עקיפה.
-- אפשר להריץ שוב מתי שרוצים.

BEGIN;

set local search_path = public, extensions;

"""

VERIFY_TAIL = """
-- ── הרישום ──────────────────────────────────────────────────────────
insert into schema_migration (filename, checksum, applied_by, evidence)
select filename, checksum, 'verify', 'verified' from probe where found
on conflict (filename) do update
  set checksum   = excluded.checksum,
      applied_at = now(),
      applied_by = excluded.applied_by,
      evidence   = excluded.evidence
  where schema_migration.evidence = 'assumed';

-- ── 1. מה לא נמצא במסד — וזו השורה שחשוב לקרוא ──────────────────────
select filename as "לא נמצאה במסד — לבדוק ביד"
  from probe where not found order by filename;

-- ── 2. סיכום ────────────────────────────────────────────────────────
select evidence as "ראיה", count(*) as "מיגרציות"
  from schema_migration group by evidence order by 1;

COMMIT;
"""


def body(text: str) -> str:
    """הקובץ בלי בלוק הרישום — זה מה שנחתם."""
    if OPEN in text:
        text = text[: text.index(OPEN)]
    return text.rstrip() + "\n"


def digest_of(path: pathlib.Path) -> str:
    b = body(path.read_text(encoding="utf-8"))
    return "sha256:" + hashlib.sha256(b.encode("utf-8")).hexdigest()[:32]


def trailer(name: str, digest: str) -> str:
    return (
        f"{OPEN}\n"
        "-- ⚠️ נוצר על ידי scripts/migration-log.py. אין לערוך ביד.\n"
        "-- השורה רושמת את המיגרציה ב-schema_migration ברגע שהיא רצה.\n"
        f"select public.record_migration('{name}', '{digest}',\n"
        "  coalesce(current_setting('app.migration_source', true), 'sql-editor'));\n"
        f"{CLOSE}\n"
    )


def stamped(path: pathlib.Path) -> str:
    return body(path.read_text(encoding="utf-8")) + "\n" + trailer(path.name, digest_of(path))


def deploy_name(name: str) -> str:
    return name.replace("_", "-").removesuffix(".sql") + ".txt"


def build_verify() -> str:
    rows = []
    for f in sorted(MIG.glob("*.sql")):
        if f.name not in PROBES:
            continue
        rows.append(
            f"  select '{f.name}'::text, '{digest_of(f)}'::text,\n"
            f"         ({PROBES[f.name]})"
        )
    probe = (
        "-- ⚠️ שורה לכל מיגרציה. עמודה שלישית = האם התוצאה שלה נמצאת במסד.\n"
        "create temp table probe (filename text, checksum text, found boolean) on commit drop;\n"
        "insert into probe (filename, checksum, found)\n"
        + "\n  union all\n".join(rows)
        + ";\n"
    )
    return VERIFY_HEAD + HELPERS + "\n" + probe + VERIFY_TAIL


def main() -> int:
    args = sys.argv[1:]

    if "--ship" in args:
        name = args[args.index("--ship") + 1]
        src = MIG / name
        if not src.exists():
            print(f"✗ אין מיגרציה בשם {name}")
            return 1
        (DEPLOY / deploy_name(name)).write_text(stamped(src), encoding="utf-8")
        print(f"✅ {deploy_name(name)}")
        return 0

    check = "--check" in args
    bad = []

    # 🔴 מיגרציה בלי בדיקה היא מיגרציה שלא נדע אם רצה. נופל, לא מזהיר.
    missing = [f.name for f in sorted(MIG.glob("*.sql"))
               if f.name not in PROBES and f.name != "000_schema_migration.sql"]
    if missing:
        bad += [f"{m} — אין לה בדיקה ב-PROBES" for m in missing]

    for src in sorted(MIG.glob("*.sql")):
        want = stamped(src)
        if src.read_text(encoding="utf-8") != want:
            bad.append(f"{src.name} — בלוק הרישום חסר או לא מעודכן")
            if not check:
                src.write_text(want, encoding="utf-8")
        out = DEPLOY / deploy_name(src.name)
        if out.exists() and out.read_text(encoding="utf-8") != want:
            bad.append(f"{out.name} — קובץ הפריסה אינו זהה למיגרציה")
            if not check:
                out.write_text(want, encoding="utf-8")

    verify = DEPLOY / "verify-migration-log.txt"
    want_verify = build_verify()
    if not verify.exists() or verify.read_text(encoding="utf-8") != want_verify:
        bad.append("verify-migration-log.txt — אינו מעודכן")
        if not check:
            verify.write_text(want_verify, encoding="utf-8")

    if bad and check:
        print("✗ יומן המיגרציות אינו מסונכרן:")
        for b in bad:
            print(f"   · {b}")
        print("   python3 scripts/migration-log.py --write")
        return 1
    n = len(list(MIG.glob("*.sql")))
    print(f"✅ {n} מיגרציות חתומות · {len(PROBES)} בדיקות" + ("" if check else f" · {len(bad)} עודכנו"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
