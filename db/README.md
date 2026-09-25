# מסד הנתונים של Park Day Companion

מיגרציות מוכנות להרצה. **נבדקו בפועל מול PostgreSQL 16 עם pgvector** — לא רק נכתבו.

## סדר הרצה

```bash
psql -v ON_ERROR_STOP=1 -f migrations/001_extensions_and_taxonomy.sql
psql -v ON_ERROR_STOP=1 -f migrations/002_content.sql
psql -v ON_ERROR_STOP=1 -f migrations/003_knowledge.sql
psql -v ON_ERROR_STOP=1 -f migrations/004_users_trips.sql
psql -v ON_ERROR_STOP=1 -f migrations/005_conversations.sql
psql -v ON_ERROR_STOP=1 -f migrations/006_rls.sql
psql -v ON_ERROR_STOP=1 -f seed/010_reference.sql      # אידמפוטנטי
```

ב-Supabase: להעתיק לתיקיית `supabase/migrations/` ולהריץ `supabase db push`. `auth.users` ו-`auth.uid()` קיימים שם מראש.

## מה יש כאן

| קובץ | תוכן |
|---|---|
| 001 | הרחבות (pgvector, pg_trgm, pgcrypto) + דומיינים משותפים |
| 002 | שכבת התוכן: destination → resort → park → land → experience + editorial/media/sources |
| 003 | מאגר הידע הלא-מובנה + `verification_queue` |
| 004 | profile, profile_fact, trip, trip_day, plan_item |
| 005 | conversation, message + `unanswered_questions` |
| 006 | Row Level Security לכל הטבלאות |
| seed/010 | יעד, 2 ריזורטים, 7 פארקים |

## חמש החלטות עיצוב שכדאי להכיר לפני שנוגעים

**1. עמודות למה שמסננים, JSONB למה שרק מציגים.**
כל שדה ש-`search_experiences` מסננת לפיו הוא עמודה אמיתית עם אינדקס. פילטור על JSONB עובד אבל לא מקבל אינדקס טוב — ובדיוק השדות האלה (אינטנסיביות, גובה, רגישויות) הם מה שמייצר את הערך של המוצר.

**2. `sens_*` נפרדות מ-`intensity`.**
מתקן יכול להיות `intensity = 1` ובכל זאת בלתי נסבל — סימולטור מבחיל גם בלי מהירות. שאילתת הבדיקה מוכיחה את זה: מסננים למי שרגיש לבחילה, והמתקן בעצימות 1 נפסל בעוד רכבת ההרים בעצימות 4 עוברת. שדות בטיחות ⇒ T1 בלבד.

**3. `profile_fact` היא שורה לעובדה, לא עמודה לשדה.**
כל עובדה נושאת `source` (`stated` לעולם לא נדרס על ידי `inferred`), `confidence`, ו-`updated_at`. ה-scope מתבטא **מבנית**: `trip_id` ריק = עובדה על האדם, `trip_id` מלא = עובדה על הנסיעה הזו. בלי ההפרדה הזו הטיול הבא יורש את התאריכים של הקודם. הטבלה קטנה וחסומה, ולכן נטענת במלואה בכל תור — **אין כאן שליפה סמנטית של עובדות על המשתמש.**

**4. `plan_item.trip_day_id` הוא nullable, ו-`trip_day.park_ids` הוא מערך.**
הראשון יוצר את מאגר המשאלות ומפריד בין "מה מעניין אותי" ל"מתי אעשה את זה". השני מאפשר park-hopper. `plan_item` לעולם לא מעתיק עובדה מ-`experience` — הכל נקרא דרך המפתח, למעט `overrides` מפורש.

**5. אין אינדקס ANN על `knowledge_chunk`, בכוונה.**
מתחת ל-10,000 שורות סריקה מדויקת מהירה יותר מ-HNSW וגם לא מאבדת recall. להוסיף רק לפי התנאים בנספח 6א של מסמך השליפה. `embedding_model` הוא עמודה חובה — **אסור לערבב מודלים באותו אינדקס**, שאילתה שקודדה במודל אחד מול מסמכים באחר מחזירה רעש בלי שום שגיאה שתתריע.

## מה **אין** כאן, ולמה

**אזורים (lands) ומתקנים לא נשתלו.** זה תוכן, וכלל העבודה בפרויקט הוא שתוכן מגיע מנטע ומאומת מול המקורות הרשמיים. שתילת רשימת מתקנים מהידע הכללי של מודל שפה הייתה מכניסה למסד בדיוק את סוג המידע הלא-מאומת שהמוצר קיים כדי לפתור — ובלי `source_url` ובלי `last_verified`, אף אחד לא היה יודע לאתר אותו אחר כך.

הפארקים כן נשתלו כי מבנה הריזורטים הוא עובדה יציבה, לא תוכן משתנה.

## איך מכניסים תוכן

התבנית עברה זמנה. **אין צורך באקסל** — הזרימה היא:

1. **טופס האדמין** (מסך 14 במלאי המסכים) כותב ישירות ל-`experience` ולטבלאות הנלוות. זו הדרך הראשית.
2. **`apps/server/content/knowledge/*.md`** עם frontmatter → `scripts/ingest.ts` → `knowledge_doc` + `knowledge_chunk`. אידמפוטנטי לפי `id`.
3. כל רשומה חדשה נכנסת עם `last_verified = null`, ולכן מופיעה מיד ב-`verification_queue` עד שמישהו מאשר אותה.

`park-day-companion-tim-content-intake-1.md` הוא הקלט הראשון לשני המסלולים האלה. כל שורה שמסומנת שם `[לבדוק]` נכנסת כ-`review_status = 'pending_review'` ואינה מגיעה לאינדקס עד לאישור.
