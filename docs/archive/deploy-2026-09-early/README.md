# ⛔ ארכיון — קובצי הרצה מתחילת ספטמבר. לא להריץ.

הקבצים כאן ישבו בשורש הרפו עד 25.09.2026, ועברו לכאן בסידור הרפו
(`docs/refactor-server-split.md`, שלב 1ב-4). הם תיעוד של מה שהורץ אז
ביד ב-SQL Editor, ולא של מה שנכון היום.

## 🔴 `6-tim-function.txt` הוא עותק ישן של טים

362 שורות, מ-02.09. הפונקציה היום היא כ-1,500 שורות, ויש בה מה שאין
בעותק: הגבלת קצב, שליפה מהמסד, תיקון ה-CORS, וחותם הפריסה.
**הדבקה שלו ל-Supabase מחזירה את טים שבועות אחורה, בלי שום אזהרה.**
הפונקציה החיה נפרסת מ-`apps/server/src/tim/index.ts` דרך
`.github/workflows/deploy-tim.yml`.

## ⚠️ ושאר הקבצים — כבר רצו, או הוחלפו

| קובץ | מה היה |
|---|---|
| `1-skip-line.txt` | מיגרציה 016 |
| `2-drop-extra-cost.txt` | מיגרציה 017 |
| `4-rate-limit.txt` | מיגרציה 018 |
| `5-check.txt` | "איפה אנחנו?" — גרסה ישנה של `apps/server/db/where-are-we.sql` |
| `5b-rate-limit-rpc.txt` | מיגרציה 020 |
| `6b-migration-019.txt` | מיגרציה 019 |
| `7-lands.txt` · `8-content-part1.txt` · `9-content-part2.txt` | זרעי תוכן מאז, שהוחלפו ב-`apps/server/db/content-seed/` |

המקור לכל מיגרציה הוא `apps/server/db/migrations/`. מה שרץ על המסד
רשום בטבלה `schema_migration`.
