#!/usr/bin/env bash
# db-local-pg — מסד Postgres נקי ב-Docker, מאפס, מה-baseline ועם כל התוכן.
#
#   npm run db:local-pg            # postgres://postgres@127.0.0.1:55433/postgres
#
# 🔴 **זו ההוכחה ש-O6 נסגר.** עד 26.09 המיגרציות לא יכלו לבנות מסד מאפס —
# 038–040 העתיקו שורה קיימת, 046 הניחה תפקיד שאיש לא יצר. כאן: Postgres
# רגיל (לא Supabase), שלושה תפקידים ופונקציה אחת שהוא חסר, dbmate up,
# והתוכן נטען בלי אף עקיפה.
#
# ⚠️ המכולה נמחקת ונבנית מחדש בכל הרצה. היא אינה המסד של dev:local
# (Supabase מקומי, :54322) — זה מסד בדיקה.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d /Applications/Docker.app/Contents/Resources/bin ] && PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"

NAME=park-pg
PORT=55433
# ⚠️ **בלי סיסמה, ובכוונה.** המכולה נמחקת בכל הרצה ומקשיבה ל-127.0.0.1 בלבד,
# ולכן trust מספיק. סיסמה קבועה כאן הייתה מחרוזת חיבור עם סיסמה בקוד — וסורק
# הסודות תפס בדיוק את זה (26.09), בצדק גם כשהיא מקומית.
export DATABASE_URL="postgres://postgres@127.0.0.1:${PORT}/postgres?sslmode=disable"
export DBMATE_MIGRATIONS_DIR=$(python3 scripts/paths.py MIGRATIONS)
export DBMATE_MIGRATIONS_TABLE=dbmate_migrations DBMATE_NO_DUMP_SCHEMA=true
DB=$(python3 scripts/paths.py DB)

command -v dbmate >/dev/null || { echo "🔴 dbmate לא נמצא: brew install dbmate" >&2; exit 1; }

echo "▸ Postgres 17 + pgvector, נקי"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -p "127.0.0.1:$PORT:5432" pgvector/pgvector:pg17 >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 0.5; done

psql_run() {
  local out
  out=$(docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q < "$1" 2>&1) || { echo "  ✗ $1"; echo "$out" | grep -A1 ERROR | head -3; exit 1; }
  echo "  ✓ $1"
}

echo "▸ מה ש-Supabase מביאה מראש"
psql_run "$DB/local/000_supabase_roles.sql"
psql_run "$DB/local/000_auth_shim.sql"

echo "▸ dbmate up"
dbmate --wait up

echo "▸ נתונים"
for f in "$DB"/seed/0*.sql "$DB/content-seed/land.sql" "$DB"/content-seed/content-*-of-*.sql \
         "$DB/knowledge-seed/knowledge.sql" "$(python3 scripts/paths.py DEPLOY)/park-intro.txt"; do
  psql_run "$f"
done

docker exec "$NAME" psql -U postgres -At -c "select '✅ '||(select count(*) from experience)||' מתקנים · '||(select count(*) from knowledge_chunk)||' קטעים · '||(select count(*) from dbmate_migrations)||' מיגרציות ב-dbmate'"
echo "   $DATABASE_URL"
