#!/usr/bin/env bash
# team1-write — כתיבת פלט המסדר למסד, בלי שסוכן מחזיק את פרטי החיבור
#
# 🔴 אותו עיקרון כמו team1-fetch: הסוכן מפיק שורות, השלב הזה כותב אותן.
# סוכן שבשרשרת שלו יש טקסט חיצוני לא מהימן אינו מחזיק credential — גם
# לא אחרי שהשוער סינן, כי סינון מקטין סיכון ואינו מאפס אותו.
#
# קלט: קובץ JSON — מערך של אובייקטים בסכימה של knowledge_doc.
set -euo pipefail

IN="${1:?שימוש: team1-write.sh <קובץ-json>}"
: "${TEAM1_CONTENT_URL:?חסר TEAM1_CONTENT_URL — ההרצה נעצרת}"

[ -f "$IN" ] || { echo "🔴 אין קובץ $IN" >&2; exit 1; }

want=$(jq 'length' "$IN")
echo "▶ $want מסמכים לכתיבה"

if [ "$want" -eq 0 ]; then
  echo "ⓘ אין חדש בהרצה הזו."
  exit 0
fi

# ⚠️ **ON_ERROR_STOP, והלקח שעלה ביוקר.** בלעדיו psql ממשיך אחרי שגיאה,
# הטרנזקציה נקטעת, השאילתה האחרונה לא מחזירה דבר — והבדיקה מכריזה הצלחה.
#
# 🔴 **ו-`returning id` הוא מה שהופך את דרישת גיא לאכיפה.**
# `review_status` נמצא ב-`using` של המדיניות המגבילה, ולכן שורה שכבר
# `approved` אינה נראית לתפקיד. הכתיבה אליה לא "מצליחה בשקט" — היא
# אינה מחזירה `id`. הספירה למטה היא מה שתופס את זה.
got=$(psql "$TEAM1_CONTENT_URL" -At -v ON_ERROR_STOP=1 -v "doc=$(cat "$IN")" <<'SQL'
with incoming as (
  select * from jsonb_to_recordset(:'doc'::jsonb) as x(
    id text, title text, body text, country text,
    source_urls text[], locale text, volatility text,
    scope_park text, scope_experience text,
    last_seen date, corroboration_count int, review_status text
  )
)
insert into knowledge_doc (
  id, title, body, country, source_urls, locale, volatility,
  scope_park, scope_experience, last_seen, corroboration_count,
  review_status, doc_type, authority_tier, source_kind
)
select
  id, title, body, country, source_urls,
  coalesce(locale, 'he'), coalesce(volatility, 'volatile'),
  scope_park, scope_experience, last_seen,
  coalesce(corroboration_count, 1), review_status,
  -- ⚠️ שלושת אלה אינם מגיעים מהקלט, בכוונה. הם מוסכמת הכתיבה של
  -- צוות 1, והמדיניות המגבילה תדחה כל ערך אחר ממילא.
  'community_qa', 'T4', 'community'
from incoming
on conflict (id) do update set
  title = excluded.title,
  body  = excluded.body,
  country = excluded.country,
  source_urls = excluded.source_urls,
  last_seen = excluded.last_seen,
  corroboration_count = excluded.corroboration_count,
  review_status = excluded.review_status,
  updated_at = now()
returning id;
SQL
)

count=$(printf '%s\n' "$got" | grep -c . || true)
echo "✅ $count מסמכים נכתבו"

# 🔴 **הדרישה של גיא (21.09), נאכפת ולא מתועדת.**
# פער בין מה שנשלח למה שחזר פירושו שורה שכבר אושרה על ידי אדם. זו
# הכרעה, לא כתיבה מחדש — ולכן הסקריפט נופל ומדווח מי, במקום להמשיך.
if [ "$count" -ne "$want" ]; then
  echo "🔴 נשלחו $want, נכתבו $count — $(( want - count )) מסמכים לא נכתבו." >&2
  echo "   הסיבה הצפויה: אדם כבר העביר אותם ל-approved, והם אינם נראים לתפקיד." >&2
  echo "   זו הסלמה לפולה, לא ניסיון חוזר." >&2
  printf '%s\n' "$got" | sed 's/^/   נכתב: /' >&2
  exit 1
fi
