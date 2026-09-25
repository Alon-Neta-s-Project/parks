# הרצת המיגרציות מקומית

```sh
apt-get install -y postgresql-16 postgresql-16-pgvector

export PGDATA=/tmp/pgdata PGPORT=55432
rm -rf $PGDATA && mkdir -p $PGDATA && chown postgres:postgres $PGDATA /tmp
# ⚠️ **en_US.UTF-8 ולא C.** ה-locale של סופהבייס הוא en_US.UTF-8, וההבדל
# אינו קוסמטי: pg_trgm קובע "מהו תו אלפאנומרי" לפי LC_CTYPE, ובלוקאל C
# אות עברית אינה נחשבת אות — כל דמיון הטריגרם מחזיר 0.00, גם על התאמה
# מדויקת. כלומר שכבת ה-fuzzy עובדת בייצור ומתה בשקט מקומית.
localedef -i en_US -f UTF-8 en_US.UTF-8
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA -A trust --locale=en_US.UTF-8 --encoding=UTF8"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA -o '-p $PGPORT -k /tmp' -l /tmp/pg.log start -w"
su postgres -c "psql -h /tmp -p $PGPORT -d postgres -c 'create database pdc;'"

# ⚠️ קודם השכבה המקומית, ואז השרשרת לפי הסדר
for f in apps/server/db/local/000_auth_shim apps/server/db/migrations/0*_* apps/server/db/seed/0*_*; do
  su postgres -c "psql -h /tmp -p $PGPORT -d pdc -v ON_ERROR_STOP=1 -q -f $f"
done
```

## למה צריך `apps/server/db/local/000_auth_shim.sql`

מיגרציה 004 מפנה ל-`auth.users`, ו-006 קוראת ל-`auth.uid()`. **סכמת `auth` שייכת
ל-Supabase ואינה קיימת ב-PostgreSQL נקי**, ולכן השרשרת נעצרת ב-004 בלעדיה.
בפרודקשן על Supabase הסכמה קיימת ואין להריץ את הקובץ הזה.

**תוצאה מאומתת:** 22 הקבצים רצים נקי, ונוצרים **19 טבלאות**, 4 views
ו-29 מדיניות RLS.

> ה-README הזה אמר קודם "21 טבלאות". 21 הוא טבלאות **ועוד** views
> (18 + 3). הספירה הנכונה היא 18. `apps/server/db/verify.sql` בודק את שניהם בנפרד.

## אימות

```sh
psql -h /tmp -p $PGPORT -d pdc -f apps/server/db/verify.sql      # מה נוצר בפועל
psql -h /tmp -p $PGPORT -d pdc -f apps/server/db/local/rls-audit.sql
```

## הקובץ ל-Supabase

`apps/server/db/supabase-bundle.sql` — הכול בקובץ אחד, בלי הפיגום המקומי, עם בלוק אימות
בסוף. נוצר על ידי `python3 scripts/build-supabase-bundle.py` ואין לערוך אותו ביד.
