# הרצת המיגרציות מקומית

```sh
apt-get install -y postgresql-16 postgresql-16-pgvector

export PGDATA=/tmp/pgdata PGPORT=55432
rm -rf $PGDATA && mkdir -p $PGDATA && chown postgres:postgres $PGDATA /tmp
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA -A trust --locale=C --encoding=UTF8"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA -o '-p $PGPORT -k /tmp' -l /tmp/pg.log start -w"
su postgres -c "psql -h /tmp -p $PGPORT -d postgres -c 'create database pdc;'"

# ⚠️ קודם השכבה המקומית, ואז השרשרת לפי הסדר
for f in db/local/000_auth_shim db/migrations/00{1,2,3,4,5,6,7,8,9}_* db/migrations/010_* db/seed/010_*; do
  su postgres -c "psql -h /tmp -p $PGPORT -d pdc -v ON_ERROR_STOP=1 -q -f $f"
done
```

## למה צריך `db/local/000_auth_shim.sql`

מיגרציה 004 מפנה ל-`auth.users`, ו-006 קוראת ל-`auth.uid()`. **סכמת `auth` שייכת
ל-Supabase ואינה קיימת ב-PostgreSQL נקי**, ולכן השרשרת נעצרת ב-004 בלעדיה.
בפרודקשן על Supabase הסכמה קיימת ואין להריץ את הקובץ הזה.

**תוצאה מאומתת:** 12 קבצים רצים נקי, ונוצרים 21 טבלאות, 50 אינדקסים
ו-29 מדיניות RLS.
