#!/usr/bin/env bash
# מחיל מסמכי ידע שהשתנו, מריץ embed, ומאמת שהתוכן באמת נשלף.
#
# 🔴 **רק מה שהשתנה, ולא הכול.** הזרע המלא מוחק את כל הקטעים וכותב
# אותם מחדש — כלומר 309 קטעים מאבדים וקטור ודורשים embed מלא בכל
# דחיפה. יקר, איטי, וחלון ארוך שבו התוכן אינו נשלף.
#
# ⚠️ **והשלב האחרון אינו קישוט.** תנאי מחייב של גיא: כתיבה שהצליחה
# אינה תוכן שנשלף. בלי הווידוא, embed שנפל משאיר את המסמך בלתי נראה
# ושום דבר לא צועק.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CI_CONTENT_URL:?חסרה מחרוזת החיבור של ci_content}"
: "${INGEST_SECRET:?חסר הסוד של embed}"
: "${SUPABASE_PROJECT_REF:?חסר מזהה הפרויקט}"
# ⚠️ **הפונקציה מאחורי שער ה-JWT של סופהבייס.** מהדשבורד הכותרת
# נוספת אוטומטית, ומבחוץ צריך לשלוח אותה. המפתח הזה ציבורי בכוונה —
# הוא נשלח לכל דפדפן שנכנס לאתר — וההגנה היא ה-RLS ו-x-ingest-secret.
: "${SUPABASE_ANON_KEY:?חסר המפתח הציבורי של סופהבייס}"

# ⚠️ **בהרצה ידנית אין "לפני".** `github.event.before` ריק ב-dispatch,
# ובדחיפה ראשונה לענף הוא אפסים. בשני המקרים `git diff` נכשל או מחזיר
# הכול — ולכן נופלים אחורה להשוואה מול release.
#
# 🔴 **ולא לטעינה מלאה.** "לא ידעתי מה השתנה, אז אטען הכול" הוא בדיוק
# איך 309 קטעים מאבדים וקטור בלי שאיש ביקש.
BEFORE="${1:-}"
if [ -z "$BEFORE" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ]; then
  git fetch origin release --depth=1 >/dev/null 2>&1 || true
  BEFORE=$(git rev-parse origin/release 2>/dev/null || echo "")
  echo "▸ אין נקודת השוואה מהדחיפה — משווה מול release"
fi
if [ -z "$BEFORE" ]; then
  echo "✗ אין מול מה להשוות. עוצר במקום לנחש."
  exit 1
fi

changed=$(git diff --name-only "$BEFORE" HEAD -- knowledge/ | sed 's|knowledge/||; s|\.md$||')

if [ -z "$changed" ]; then
  echo "אין מסמכי ידע שהשתנו."
else
  echo "▸ מסמכים שהשתנו:"; printf '   · %s\n' $changed
  for doc in $changed; do
    [ -f "knowledge/$doc.md" ] || { echo "   ⚠️ $doc נמחק — דילוג"; continue; }
    python3 scripts/build-knowledge-seed.py --doc "$doc" >/dev/null
    psql "$CI_CONTENT_URL" -v ON_ERROR_STOP=1 -q -f "data/deploy/$doc.txt"
    echo "   ✓ $doc"
  done
fi

# ── הפתיח נגזר ממדריכי האופי, ולכן הוא נשלח יחד איתם ────────────────
if echo "$changed" | grep -q "park-character-"; then
  python3 scripts/build-park-intro.py >/dev/null
  psql "$CI_CONTENT_URL" -v ON_ERROR_STOP=1 -q -f data/deploy/park-intro.txt
  echo "   ✓ park-intro"
fi

# ── embed ───────────────────────────────────────────────────────────
# ⚠️ הפונקציה מעבדת עד 25 קטעים בהרצה, ולכן לולאה ולא קריאה אחת.
# 🔴 **וגבול עליון, כי לולאה שאינה נגמרת אינה נופלת — היא תלויה.**
echo "▸ embed"
for i in $(seq 1 20); do
  out=$(curl -sS -X POST \
    "https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/clever-processor" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "x-ingest-secret: ${INGEST_SECRET}")
  echo "   $out"

  # 🔴 **שגיאה חוזרת אינה "עוד סבב".** הגרסה הקודמת הדפיסה את אותה
  # שגיאת הרשאה עשרים פעם לפני שנפלה — כלומר הרעש הסתיר את הסיבה.
  # תשובה בלי "remaining" אינה התקדמות, והיא עוצרת מיד.
  if ! echo "$out" | grep -q '"remaining"'; then
    echo "✗ embed החזיר שגיאה ולא התקדמות. עוצר."
    exit 1
  fi

  echo "$out" | grep -q '"remaining":0' && break
  [ "$i" = "20" ] && { echo "✗ embed לא הסתיים אחרי 20 סבבים"; exit 1; }
done

# ── הווידוא — תנאי גיא ──────────────────────────────────────────────
echo "▸ ווידוא שהתוכן נשלף"
python3 scripts/build-knowledge-seed.py --live-check >/dev/null
result=$(psql "$CI_CONTENT_URL" -At -f data/deploy/content-live-check.txt)
echo "$result"

if echo "$result" | grep -q "🔴"; then
  echo
  echo "✗ תוכן שאינו נשלף. הכתיבה לא הושלמה, ולכן זה נכשל בקול."
  exit 1
fi
echo "✅ כל התוכן במסד ונשלף."
