#!/usr/bin/env bash
# team1-fetch — שליפת raw_content מ-Apify, בלי שסוכן רואה את הטוקן
#
# 🔴 **הקובץ הזה קיים כדי שסוכן-האיסוף לא יחזיק credential.**
#
# גיא (14.09, סעיף 6) הציג שתי אפשרויות למפתח ה-API: בקונפיג של הסוכן,
# או שכבת הרשאה נפרדת בזמן ריצה. שתיהן מניחות שהסוכן יכול להשיג את
# המפתח — ולכן שתיהן נשברות מאותה הזרקה: אם הסוכן יכול לבקש, הטקסט
# שהוא קורא יכול לגרום לו לבקש.
#
# כאן הטוקן נמצא רק בסביבה של השלב הזה. הסוכן מתחיל מהקובץ שנכתב,
# ולא מהרשאה.
set -euo pipefail

OUT_DIR="${TEAM1_INBOX:-data/team1-inbox}"
MAX_ITEMS="${TEAM1_MAX_ITEMS:-200}"
SOURCES="${TEAM1_SOURCES:-data/team1-sources.json}"

# ⚠️ **אין דילוג שקט כשחסר סוד.** משתנה ריק ב-GitHub Actions הוא מחרוזת
# ריקה, לא שגיאה — ובלי הבדיקה הזו ההרצה הייתה מסתיימת ב-✅ עם אפס
# פריטים, ונראית כמו "אין חדש היום".
: "${APIFY_TOKEN:?חסר APIFY_TOKEN — ההרצה נעצרת ולא מדווחת 'אין חדש'}"

if [ ! -f "$SOURCES" ]; then
  echo "🔴 אין רשימת מקורות ב-$SOURCES" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$OUT_DIR/raw-$stamp.json"

echo "▶ שליפה מ-Apify · תקרה $MAX_ITEMS פריטים"

# ⚠️ **התקרה נשלחת לשרת, ולא נאכפת אחרי החזרה.** שליפה של 50,000
# פריטים שנחתכת אצלנו ל-200 כבר עלתה כסף. התקרה היא מה שגיא התנה.
http=$(curl -sS -o "$out" -w '%{http_code}' \
  --max-time 900 \
  -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  --data-binary @<(jq --argjson max "$MAX_ITEMS" \
        '{startUrls: .sources, resultsLimit: $max}' "$SOURCES") \
  'https://api.apify.com/v2/acts/apify~facebook-groups-scraper/run-sync-get-dataset-items')

if [ "$http" != "200" ]; then
  echo "🔴 Apify החזיר $http" >&2
  # ⚠️ הגוף אינו מודפס: תשובת שגיאה עשויה להחזיר את הבקשה, והבקשה
  # נושאת את הכותרת. לוג של Actions נשמר ונצפה.
  rm -f "$out"
  exit 1
fi

count=$(jq 'length' "$out")
echo "✅ $count פריטים → $out"

# ⚠️ **תוצאה ריקה אינה שגיאה, והיא גם אינה שקט.** "אין חדש" נאמר
# במפורש, כי ריק שלא נאמר נקרא כתקלה שנבלעה.
if [ "$count" -eq 0 ]; then
  echo "ⓘ אין חדש בהרצה הזו."
fi
