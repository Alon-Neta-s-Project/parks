#!/usr/bin/env bash
# שער ה-QA — מה שחייב לעבור לפני שדוחפים ל-release.
#
# 🔴 **קיים כי "הבדיקות עברו" לא הספיק.** ביום אחד עלו לאוויר שלוש
# רגרסיות שכל הבדיקות עברו עליהן, כי הן לא נבדקו — קובץ זרע שהתיישן,
# בלוק הוראות שלא נבנה מחדש, וחבילה שלא אומתה. כל אלה נתפסים עכשיו,
# **אבל רק אם מריצים אותם**, וזה מה שהסקריפט הזה מבטיח.
#
# ⚠️ **סדר לפי מהירות הכישלון.** מה שנופל מהר רץ ראשון, כדי שלא נחכה
# שלוש דקות לבנייה כדי לגלות טעות הקלדה.
set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

step "סודות"
python3 scripts/check-secrets.py

step "הוראות טים מסונכרנות עם he.json"
python3 scripts/build-tim-prompt.py --check

step "יומן המיגרציות — כל מיגרציה חתומה, וקובץ הפריסה זהה לה"
python3 scripts/migration-log.py --check

step "קובצי הזרע מעודכנים מול המקור"
python3 scripts/build-knowledge-seed.py --check

step "טיפוסים"
npx tsc -b --noEmit

step "בדיקות — vitest ו-deno"
npm test

step "חבילת טים — אפס שורות מתקנים בדפדפן"
npm run build:tim

printf '\n\033[32m✅ שער ה-QA עבר. אפשר לדחוף ל-release.\033[0m\n'
printf '   ⚠️ ומה שזה לא בודק: איך התשובות **נשמעות**. זה עדיין נטע.\n'
