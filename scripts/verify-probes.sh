#!/usr/bin/env bash
# 🔴 **מי בודק את הבודקות?** — שאלת גיא, 14.09
#
# 45 הבדיקות ב-`migration-log.py` נכתבו ביד, ובדיקה שנכתבה שגוי עוברת
# בשקט. אחת כזו כבר נתפסה — `011` חיפשה את `park_kind` ב-`experience`
# במקום ב-`park` — ורק במקרה, כי המסד המקומי חשף אותה.
#
# ⚠️ **הכלל: בדיקה חייבת להיראות נכשלת לפני שהיא עוברת.** הסקריפט הזה
# מריץ את המיגרציות אחת-אחת, ואחרי כל אחת שואל את כל 45 הבדיקות. בדיקה
# תקינה חייבת להתהפך **בדיוק** במיגרציה שלה:
#
#   · הפכה מוקדם מדי  → רפויה. היא נכונה גם בלי המיגרציה, ולכן היא
#                        לא מוכיחה שהמיגרציה רצה.
#   · לא הפכה בכלל    → הדוקה מדי, או שגויה. בדיוק המקרה של 011.
#
# הרצה: bash scripts/verify-probes.sh
set -uo pipefail
cd "$(dirname "$0")/.."
# הנתיבים מ-scripts/paths.json — המקום היחיד שבו כתוב איפה דברים יושבים.
DB_LOCAL=$(python3 scripts/paths.py DB_LOCAL)
DB_SEED=$(python3 scripts/paths.py DB_SEED)
MIGRATIONS=$(python3 scripts/paths.py MIGRATIONS)

PORT="${PGPORT:-55432}"
# ⚠️ שגיאת ניתוח ("הטבלה אינה קיימת") היא תשובה, לא תקלה: ההשפעה
# אינה קיימת עדיין. לכן כישלון נקרא כ-false ולא כריק.
probe() {
  python3 scripts/migration-log.py --probe "$1" > /tmp/one-probe.sql 2>/dev/null || { echo f; return; }
  local out
  out=$(su postgres -c "psql -h /tmp -p $PORT -d probes -At -q -f /tmp/one-probe.sql" 2>/dev/null | tail -1)
  case "$out" in t) echo t;; *) echo f;; esac
}

su postgres -c "psql -h /tmp -p $PORT -d postgres -q -c 'drop database if exists probes' -c 'create database probes'" >/dev/null 2>&1

su postgres -c "psql -h /tmp -p $PORT -d probes -q -f $DB_LOCAL/000_auth_shim.sql" >/dev/null 2>&1

# ⚠️ ארבע מיגרציות בודקות את עצמן מול שורות אמיתיות, ולכן דורשות
# שתי שורות זרע לפני שהן רצות.
#
# 🔴 **ושורת JAMMitors נזרעת בלי השם העברי בכוונה.** אילו נזרעה איתו,
# הבדיקה של 034 הייתה עוברת עוד לפני ש-034 רצה — כלומר הזרע היה הופך
# את הבדיקה לרפויה, וזה בדיוק מה שהכלי הזה נועד לתפוס.
NEEDS_DATA=""
seed_rows() {
  # ⚠️ הפארקים מגיעים מ-db/seed ולא מהמיגרציות. בלעדיהם ה-FK של
  # experience אינו מסופק, והזרע נכשל בשקט — כלומר ארבע הבדיקות
  # היו מדווחות ככישלון שאינו שלהן.
  for sd in "$DB_SEED"/0*.sql; do
    su postgres -c "psql -h /tmp -p $PORT -d probes -q -f $sd" >/dev/null 2>&1
  done
  su postgres -c "psql -h /tmp -p $PORT -d probes -q -c \"
    insert into experience (id,key,park_id,type,status,name,name_i18n,aliases,aliases_i18n,category,type_data,volatility)
    select 'probe-row','probe-row',id,'attraction','open','Probe Row','{}','{}','{}','dark_ride','{}','static' from park limit 1;
    insert into experience (id,key,park_id,type,status,name,name_i18n,aliases,aliases_i18n,category,type_data,volatility)
    select 'probe-jam','EPCOT|Entertainment|JAMMitors',id,'attraction','open','JAMMitors','{}','{}','{}','show','{}','static' from park limit 1;
  \"" >/dev/null 2>&1
}

early=(); never=(); skipped=()
for f in "$MIGRATIONS"/*.sql; do
  name=$(basename "$f")
  # 000 בונה את היומן עצמו ואין לה בדיקה — היא אינה מיגרציית תוכן.
  if [ "$name" = "000_schema_migration.sql" ]; then
    su postgres -c "psql -h /tmp -p $PORT -d probes -q -f $f" >/dev/null 2>&1
    continue
  fi

  # הבדיקה של המיגרציה הזו — לפני שהיא רצה. חייבת להיות false.
  # הזרע נכנס אחרי שהטבלאות קיימות ולפני המיגרציות שבודקות את עצמן.
  if [ "$name" = "034_eight_hebrew_names.sql" ]; then seed_rows; fi

  if [ "$(probe "$name")" = "t" ]; then early+=("$name"); fi

  if su postgres -c "psql -h /tmp -p $PORT -d probes -v ON_ERROR_STOP=1 -q -f $f" >/dev/null 2>&1; then
    if [ "$(probe "$name")" != "t" ]; then
      case " $NEEDS_DATA " in *" $name "*) skipped+=("$name");; *) never+=("$name");; esac
    fi
  else
    case " $NEEDS_DATA " in
      *" $name "*) skipped+=("$name");;
      *) never+=("$name (המיגרציה עצמה נפלה)");;
    esac
  fi
done

echo
echo "── מי בודק את הבודקות ──────────────────────────────────"
printf '%s\n' "  נבדקו: $(ls "$MIGRATIONS"/*.sql | wc -l) מיגרציות"
if [ ${#early[@]} -gt 0 ]; then
  echo "  🔴 רפויות — היו true עוד לפני המיגרציה שלהן:"
  printf '     · %s\n' "${early[@]}"
fi
if [ ${#never[@]} -gt 0 ]; then
  echo "  🔴 לא התהפכו — שגויות או הדוקות מדי:"
  printf '     · %s\n' "${never[@]}"
fi
if [ ${#skipped[@]} -gt 0 ]; then
  echo "  ⚠️ דורשות נתוני תוכן, לא נבדקו כאן:"
  printf '     · %s\n' "${skipped[@]}"
fi
[ ${#early[@]} -eq 0 ] && [ ${#never[@]} -eq 0 ] && echo "  ✅ כל בדיקה התהפכה בדיוק במיגרציה שלה."
echo
[ ${#early[@]} -eq 0 ] && [ ${#never[@]} -eq 0 ]
