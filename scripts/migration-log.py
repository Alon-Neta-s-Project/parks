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

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json
# ⚠️ ההיסטוריה בלבד: 48 המיגרציות החתומות. מאז המעבר ל-dbmate מיגרציות חדשות
# נרשמות ב-dbmate_migrations ואינן נחתמות כאן — שני יומנים היו שני מקורות אמת.
MIG = P.MIGRATIONS_HISTORY
DEPLOY = P.DEPLOY

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
    # ⚠️ `ilike` לבדו קיים כבר ב-029 — הבדיקה הזו הייתה עוברת בלי 030
    # בכלל. `park_name` הוא מה ש-030 הוסיפה בפועל.
    "030_find_experiences_by_words.sql": "pg_temp.fn_src('find_experiences') like '%park_name%'",
    "031_alias_candidates.sql":        "to_regclass('public.alias_candidate') is not null",
    # ⚠️ `alias_add` נוצרה כבר ב-031 — קיומה אינה ראיה ל-032.
    # לוגיקת הדחייה (`lower(...)`) היא מה ש-032 הוסיפה.
    "032_alias_reject_useless.sql":    "pg_temp.fn_src('alias_add') like '%lower%'",
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
    "046_tester_note.sql":              "pg_temp.has_fn('save_tester_note')\n         and pg_temp.fn_src('save_tester_note') like '%tester_key%'",
    "045_country.sql":                 "pg_temp.has_col('knowledge_doc','country')\n         and pg_temp.con('knowledge_doc','knowledge_doc_country_iso') like '%A-Z%'",
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

VERIFY_HEAD = """-- full-check — בדיקה אחת: המיגרציות, ותנאי גיא על יומן התשובות
-- ────────────────────────────────────────────────────────────────────
-- 📍 להריץ ב: Supabase ← SQL Editor
-- שם השאילתה: full-check (כלי חוזר — לא צריך מספר)
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

SELFTEST = """
-- ── בדיקת יומן התשובות ──────────────────────────────────────────────
-- 🔴 שלוש קריאות: נענתה · לא נענתה · ארוכה מאוד. הן נמחקות מיד אחרי
-- שהתוצאה נלכדת, ולכן אינן משאירות זכר ביומן האמיתי.
select public.log_turn('שאלת בדיקה שנענתה',    true,  null,      'selftest',      10, 20);
select public.log_turn('שאלת בדיקה שלא נענתה', false, 'no_data', 'selftest',      10, 5);
select public.log_turn(repeat('א', 900),        false, 'no_data', 'selftest-long', null, null);

create temp table selftest on commit drop as
  select * from turn_log where model like 'selftest%';
delete from turn_log where model like 'selftest%';
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

-- ── התוצאה ──────────────────────────────────────────────────────────
-- 🔴 **שאילתה אחת, ובכוונה.** ה-SQL Editor של סופהבייס מציג רק את
-- תוצאת השאילתה האחרונה. קובץ עם שלוש טבלאות מראה אחת, והשתיים
-- החשובות נעלמות — וזה בדיוק מה שקרה כאן: רשימת החסרות הייתה ראשונה,
-- ולכן איש לא ראה אותה.
--
-- ⚠️ **וזו אותה תבנית שהקובץ הזה קיים בשבילה:** משהו לא הוצג, ולכן
-- נקרא כאילו אינו קיים.
with missing as (select filename from probe where not found),
     summary as (select evidence, count(*) as n from schema_migration group by evidence)
select
  case when exists (select 1 from missing)
       then '🔴 לא נמצאה במסד — לבדוק ביד'
       else '✅ כל המיגרציות נמצאו' end                as "מה",
  coalesce((select string_agg(filename, ', ' order by filename) from missing), '—') as "פרט"
-- ── שורת הכרעה, לקריאת מכונה ────────────────────────────────────────
-- 🔴 **קיים כי הבדיקה ב-CI חיפשה את הסימן 🔴 בטקסט — והוא מופיע
-- בתוך הכותרת עצמה, גם כשאין ממצא.** אזעקה שנדלקת מהשם שלה.
--
-- ⚠️ הכותרות נועדו לאדם, והשורה הזו למכונה. `verdict|OK` ותו לא.
union all
select 'verdict',
       case when exists (select 1 from missing)
              or exists (select 1 from probe p join schema_migration m using (filename)
                          where m.evidence = 'observed' and m.checksum <> p.checksum)
            then 'PROBLEM' else 'OK' end
union all
select 'ראיה: ' || evidence, n::text from summary

-- ── סטייה: קובץ ברפו שהשתנה אחרי שכבר רץ ────────────────────────────
-- 🔴 **שאלת גיא, ותשובה שלא הייתה לי קודם.** חתימת הקובץ נשמרת במסד
-- בזמן ההרצה. אם הקובץ ברפו נערך מאז, השתיים נפרדות — וזו בדיוק
-- עריכה בדיעבד של מיגרציה שכבר רצה.
--
-- ⚠️ **רק על שורות `observed`.** שורת `verified` קיבלה את החתימה שלה
-- מהרפו ולא מההרצה, ולכן השוואה עליה אינה אומרת דבר. להשוות אותה היה
-- לייצר ודאות מלאכותית.
union all
select '🔴 סטייה: הקובץ ברפו שונה ממה שרץ',
       coalesce((select string_agg(p.filename, ', ' order by p.filename)
                   from probe p join schema_migration m using (filename)
                  where m.evidence = 'observed' and m.checksum <> p.checksum), '—')

-- ── ושורות verified — שאלת גיא, 14.09 ───────────────────────────────
-- 🔴 **הן לא היו מוגנות בכלל, וזה היה פער ולא הכרעה.**
--
-- ⚠️ **התאמה על שורת `verified` אינה אומרת דבר** — החתימה שלה הגיעה
-- מהרפו ולא מההרצה, ולכן היא מתאימה לעצמה. זו הסיבה שהיא אינה נספרת
-- בשורה למעלה.
--
-- ✅ **אבל אי-התאמה כן אומרת משהו אמיתי:** הקובץ ברפו נערך **אחרי**
-- שאימתנו שההשפעה שלו נמצאת במסד. כלומר האימות התיישן, ויש לחזור
-- עליו. זו טענה חלשה יותר מ"שונה ממה שרץ", ולכן היא בשורה נפרדת
-- ובמילים אחרות — ולא מוזגת פנימה כדי להיראות חזקה יותר.
--
-- 🔴 **ומה שגם זה אינו עושה:** להוכיח שהמסד תואם לקובץ. רק הבדיקה
-- עצמה (`PROBES`) עושה את זה, והיא נכתבת ביד לכל מיגרציה.
union all
select '⚠️ הקובץ נערך אחרי האימות — לאמת שוב',
       coalesce((select string_agg(p.filename, ', ' order by p.filename)
                   from probe p join schema_migration m using (filename)
                  where m.evidence = 'verified' and m.checksum <> p.checksum), '—')

-- ── ותנאי גיא על יומן התשובות, באותה טבלה ───────────────────────────
-- ⚠️ שלוש קריאות בדיקה נכתבו למעלה ונמחקו לפני ההצגה.
union all select 'turn_log — דליפה: תשובה שנענתה ששמרה טקסט (צפוי 0)',
  (select count(*)::text from selftest where answered and question is not null)
union all select 'turn_log — שאלות שנשמרו מתוך 3 קריאות (צפוי 2)',
  (select count(*)::text from selftest where question is not null)
union all select 'turn_log — אורך אחרי חיתוך של 900 תווים (צפוי 500)',
  (select coalesce(max(length(question)),0)::text from selftest where model = 'selftest-long')
union all select 'turn_log — RLS פעיל · נאכף · policies (צפוי t/t/0)',
  (select relrowsecurity::text || ' / ' || relforcerowsecurity::text || ' / ' ||
          (select count(*) from pg_policies
            where schemaname='public' and tablename='turn_log')::text
     from pg_class where relname = 'turn_log')
union all select 'turn_log — עמודות שיכולות להחזיק מזהה (צפוי 0)',
  (select count(*)::text from pg_attribute
    where attrelid = 'turn_log'::regclass and attnum > 0 and not attisdropped
      and attname in ('user_id','conversation_id','ip','session_id'))
order by 1;

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


def build_verify(with_turn_log: bool = True) -> str:
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
    tail = VERIFY_TAIL
    if not with_turn_log:
        # חותכים את בלוק turn_log מהתוצאה, ומשאירים מיגרציות וסטייה.
        tail = tail[:tail.index("-- \u2500\u2500 \u05d5\u05ea\u05e0\u05d0\u05d9 \u05d2\u05d9\u05d0")] + "order by 1;\n\nCOMMIT;\n"
        return VERIFY_HEAD + HELPERS + "\n" + probe + tail
    return VERIFY_HEAD + HELPERS + "\n" + probe + SELFTEST + tail


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

    # ── מטריצת הבדיקות ───────────────────────────────────────────────
    # 🔴 **שאלת גיא: מי בודק את הבודקות?** בדיקה שנכתבה שגוי עוברת
    # בשקט. תפסתי אחת כזו בעצמי — `011` חיפשה את `park_kind` בטבלה
    # הלא נכונה — ורק במקרה, כי המסד המקומי חשף אותה.
    #
    # ⚠️ **הכלל כאן הוא אותו כלל של כל בדיקה: היא חייבת להיראות
    # נכשלת לפני שהיא עוברת.** הפלט הזה מחזיר שורה לכל בדיקה, ומי
    # שמריץ אותו אחרי כל מיגרציה בנפרד רואה בדיוק מתי כל אחת התהפכה.
    # ⚠️ **בדיקה אחת בכל פעם, ולא 45 באיחוד.** על מסד שבו המיגרציה עוד
    # לא רצה, בדיקה שמזכירה טבלה שאינה קיימת נופלת בניתוח — **ומפילה
    # איתה את כל האיחוד.** כלומר הכלי שנועד לבדוק "האם ההשפעה קיימת"
    # היה מחזיר ריק על בדיוק המצב שהוא נועד לזהות.
    if "--probe" in sys.argv:
        want = sys.argv[sys.argv.index("--probe") + 1]
        if want not in PROBES:
            print(f"✗ אין בדיקה ל-{want}")
            return 1
        print(HELPERS + f"\nselect ({PROBES[want]}) as found;")
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

    verify = DEPLOY / "full-check.txt"
    want_verify = build_verify()

    # 🔴 **גרסה שרצה בהרשאות של ci_verify.** `full-check` קורא את
    # `turn_log` ישירות — והטבלה סגורה לחלוטין, בכוונה ובאישור גיא.
    # כלומר הקובץ המלא אינו יכול לרוץ מ-CI, וזה נכון שהוא לא יכול.
    #
    # ⚠️ ולכן שתי גרסאות: המלאה ל-SQL Editor, והזו — מיגרציות וסטייה
    # בלבד — ל-CI. **הבדיקה ההתנהגותית של turn_log נשארת ידנית**,
    # ואני מציין את זה במפורש כדי שלא ייראה שהיא רצה ולא רצה.
    mig = DEPLOY / "migrations-check.txt"
    want_mig = build_verify(with_turn_log=False)
    if not mig.exists() or mig.read_text(encoding="utf-8") != want_mig:
        bad.append("migrations-check.txt — אינו מעודכן")
        if not check:
            mig.write_text(want_mig, encoding="utf-8")
    if not verify.exists() or verify.read_text(encoding="utf-8") != want_verify:
        bad.append("full-check.txt — אינו מעודכן")
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
