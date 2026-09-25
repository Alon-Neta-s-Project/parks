#!/usr/bin/env bash
# dev-local — כל הסביבה המקומית בפקודה אחת: מסד, שרת וממשק.
#
#   npm run dev:local
#
#   מסד    Supabase מקומי (Postgres + REST)  http://127.0.0.1:54321
#   שרת    apps/server, מתעדכן בכל שמירה      http://localhost:8787
#   ממשק   apps/web, מתעדכן בכל שמירה          http://localhost:5173   (טים בלבד: /tim.html)
#
# Ctrl+C עוצר את השרת ואת הממשק. המסד נשאר עם הנתונים שלו — להפסקה מלאה:
#   supabase --workdir apps/server/db/supabase-local stop
#
# 🔴 **שום דבר כאן לא נוגע בייצור.** השרת קורא את .env.server, שמצביע על
# המסד המקומי. PROD_DB_URL_READONLY שבאותו קובץ אינו נקרא בידי השרת.
#
# ⚠️ **מסד ריק אינו "הכול תקין".** אם אין בו מתקנים — הסקריפט אומר את זה
# ועוצר, ולא מעלה ממשק שנראה עובד ומחזיר תשובות ריקות. הקמת המסד מאפס עדיין
# ידנית (O6 ב-docs/refactor-server-split.md: המיגרציות אינן בונות מסד מאפס).
set -euo pipefail
cd "$(dirname "$0")/.."

# Docker Desktop מתקין את ה-CLI מחוץ ל-PATH הרגיל.
[ -d /Applications/Docker.app/Contents/Resources/bin ] && PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"

WORKDIR=apps/server/db/supabase-local
EXCLUDE=gotrue,realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

fail() { echo "🔴 $1" >&2; exit 1; }

# ── בדיקות לפני הכול ─────────────────────────────────────────────────
command -v docker   >/dev/null || fail "Docker לא נמצא. להתקין Docker Desktop."
docker info         >/dev/null 2>&1 || fail "Docker לא רץ. לפתוח את Docker Desktop ולנסות שוב."
command -v supabase >/dev/null || fail "Supabase CLI לא נמצא: brew install supabase/tap/supabase"
[ -f .env.server ]            || fail ".env.server חסר — הערכים בסעיף 3e ב-docs/refactor-server-split.md."
grep -q '^GEMINI_API_KEY=.\+' .env.server || fail "GEMINI_API_KEY ריק ב-.env.server — בלעדיו טים לא עונה."
[ -f apps/web/.env.local ]    || fail "apps/web/.env.local חסר — בלעדיו הממשק פונה לייצור ולא למקומי."

# ── מסד ──────────────────────────────────────────────────────────────
echo "▸ מסד — Supabase מקומי"
# "Stopped services" הוא רשימת השירותים שהוחרגו בכוונה, ולא שגיאה.
supabase --workdir "$WORKDIR" start -x "$EXCLUDE" 2>&1 >/dev/null | grep -v "^Stopped services" >&2 || true
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
[ -n "$DB" ] || fail "מכולת המסד לא עלתה."
rows=$(docker exec "$DB" psql -U postgres -d postgres -At -c "select count(*) from experience" 2>/dev/null || echo 0)
chunks=$(docker exec "$DB" psql -U postgres -d postgres -At -c "select count(embedding) from knowledge_chunk" 2>/dev/null || echo 0)
[ "$rows" -gt 0 ] || fail "המסד המקומי ריק (0 מתקנים). ההקמה מאפס עדיין ידנית — O6 במסמך הרפקטור."
echo "  ✓ $rows מתקנים · $chunks קטעים עם הטמעה"
[ "$chunks" -gt 0 ] || echo "  ⚠️ אין הטמעות — טים לא ישלוף ידע. להריץ embed (סעיף 3e)."

# ── שרת וממשק ────────────────────────────────────────────────────────
pids=()
# ⚠️ **לפי שם, ולא לפי $!.** ב-pipeline, $! הוא המזהה של הפקודה האחרונה —
# ה-sed שמוסיף תווית — ולא של השרת. הריגה שלו השאירה את השרת ואת הממשק
# רצים ברקע, תופסים את הפורטים, כשהסקריפט נעצר בכל דרך שאינה Ctrl+C.
SERVER_CMD="tsx watch --env-file=.env.server apps/server/src/index.ts"
WEB_CMD="vite --config apps/web/vite.config.ts --port 5173"
stop() {
  trap - EXIT INT TERM
  echo; echo "▸ עוצר שרת וממשק (המסד נשאר)"
  pkill -f "$SERVER_CMD" 2>/dev/null || true
  pkill -f "$WEB_CMD" 2>/dev/null || true
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
}
trap stop EXIT INT TERM

echo "▸ שרת — apps/server"
npx $SERVER_CMD 2>&1 | sed -u 's/^/  [server] /' &
pids+=($!)

for _ in $(seq 1 40); do curl -s -o /dev/null localhost:8787/health && break; sleep 0.5; done
curl -s -o /dev/null localhost:8787/health || fail "השרת לא עלה על :8787."

echo "▸ ממשק — apps/web"
npx $WEB_CMD --strictPort 2>&1 | sed -u 's/^/  [web] /' &
pids+=($!)

for _ in $(seq 1 40); do curl -s -o /dev/null localhost:5173/ && break; sleep 0.5; done

cat <<EOF

✅ הכול רץ מקומית
   האתר המלא   http://localhost:5173
   טים בלבד    http://localhost:5173/tim.html
   השרת        http://localhost:8787/health
   Ctrl+C לעצירה

EOF
wait
