# מפרט נתונים מעודכן — מאסטר פנימי מול Product Export

_31.08.2026 · מיישם את החלטות המחקר. **לא שונה שום דבר באקסל — זהו מפרט לאישור.**_

---

## 1. שני קבצים, שני תפקידים

| | `Orlando_Parks_TO_FILL_v6.xlsx` | `product_export.csv` |
|---|---|---|
| תפקיד | מאסטר פנימי, ניתן לביקורת | הקלט היחיד ל-Claude Code |
| מכיל | הכל: מקורות, נימוקים, כיול, סתירות, רמות ביטחון | ערכים סופיים בלבד |
| נראה למשתמש | לעולם לא | כן, דרך המוצר |
| נוצר | ידנית, במחקר | **אוטומטית מהמאסטר** |

**כלל יסוד:** ה-Export נוצר **רק** על ידי סקריפט שקורא רשימת עמודות מאושרת. אין מחיקה ידנית, אין "לשכוח" עמודה, ואין העברה של המאסטר עצמו — גם לא "רק הפעם, לבדיקה". עמודה שאינה ברשימה **לא קיימת** מבחינת המוצר.

---

## 2. טבלת העמודות

### 2.1 עמודות קיימות — להשאיר כמו שהן

| עמודה | מאסטר | Export | הערה |
|---|---|---|---|
| `Resort` · `Park` · `Park Type` · `Area / Land` | ✅ | ✅ | |
| `Activity Type` · `Activity` · `Subtype` | ✅ | ✅ | `Subtype` הוא מה שמבדיל סוגי בידור |
| `Intensity` | ✅ | ✅ | הערך הסופי בלבד |
| `Required Admission / Ticket` · `Optional Fast Access / Pass` | ✅ | ✅ | |
| `Reservation / Additional Payment` · `Included With Admission?` | ✅ | ✅ | |
| `Status / Seasonality` | ✅ | ✅ | |
| `Lightning Lane Type` · `Premier Pass Included?` · `Included in Multi Pass?` · `Separate Single Pass Purchase Required?` · `Extra Cost Beyond Multi Pass?` | ✅ | ✅ | |
| `Key` | ✅ | ✅ | מפתח היציבות בין ייבואים |
| `Last Verified` | ✅ | ✅ | **אושר 31.8** — התאריך היחיד ב-Export, להצגת מועד עדכון. ראה סעיף 6 |

### 2.2 עמודות קיימות — מאסטר בלבד

| עמודה | למה |
|---|---|
| `Intensity Source Basis` | חושף את שיטת הדירוג ואת המקור |
| `Intensity Source URL` | חושף את המקור |
| `Official Activity Source URL` | מקור |
| `Access Source URL` | מקור |
| `Lightning Lane Purchase Notes` | הערות פנימיות; אם יש בהן ניסוח שמיועד למשתמש — לשכתב לשדה תצוגה נפרד |

### 2.3 עמודות קיימות — מחוץ להיקף שלב 1

`Dining Service Type` · `Advance Reservation` · `Special Event Dates / Season` · `Event Season` · `Event Start Date` · `Event End Date` · `Separate Event Ticket Required?` · `Standard Day Ticket Sufficient?` · `Event Access Notes`

נשארות במאסטר, **לא ב-Export**. רלוונטיות רק לשורות `Dining` ו-`Special Event`, שאינן בהיקף.

### 2.4 עמודות שהוספתי — לשנות שם

| מ- | ל- | למה |
|---|---|---|
| `sens_motion_sickness` | **`official_motion_sickness_warning`** | שינוי מהות: בוליאני של "קיימת אזהרה רשמית", לא רמת חומרה |

### 2.5 עמודות שהוספתי — להסיר משלב 1

`sens_enclosed_dark` · `sens_heights` · `sens_loud_sudden` · `sens_strobe`

**לא לאסוף, לא במאסטר ולא ב-Export.** להשאיר את הכותרות בקובץ ריקות ומסומנות "לא בשלב 1", או להסיר לגמרי — לשיקולך. **בשום מקרה לא למלא אותן חלקית**, כי כיסוי חלקי בדגל רגישות גרוע מהיעדרו.

### 2.6 עמודות שהוספתי — להשאיר

| עמודה | מאסטר | Export |
|---|---|---|
| `opened_year` · `duration_minutes` · `max_speed_kmh` · `inversions` · `big_drops` · `spinning` · `environment` | ✅ | ✅ |
| `air_conditioned` | ✅ | ✅ | |
| `height_requirement_cm` | ✅ | ✅ |
| `gets_wet` | ✅ | ✅ |
| `wheelchair` | ✅ | ✅ |
| `name_he` · `aliases_he` | ✅ | ✅ |
| `official_motion_sickness_warning` | ✅ | ✅ |
| `youtube_id` · `video_creator` | ✅ | ⏸ **מוחזק** — ראה 3.4 |
| `source_url_new` · `source_url_safety` · `retrieved_date` · `fill_confidence` · `fill_notes` | ✅ | ❌ |

### 2.7 עמודות חדשות להוסיף

| עמודה | טיפוס | מאסטר | Export | תיאור |
|---|---|---|---|---|
| `height_requirement_in` | מספר | ✅ | ❌ | **ערך המקור הרשמי.** נשמר לביקורת |
| `is_motion_simulator` | 4-מצבי | ✅ | ✅ | |
| `uses_large_screens_or_3d` | 4-מצבי | ✅ | ✅ | |
| `wheelchair_official_text` | טקסט | ✅ | ❌ | נוסח ההנחיה הרשמית, מילה במילה |
| `intensity_method` | `disneygirl` / `calibrated` / `entertainment_default` | ✅ | ❌ | איך נקבע הציון |
| `intensity_confidence` | `high` / `medium` / `low` | ✅ | ❌ | |
| `intensity_calibration_notes` | טקסט | ✅ | ❌ | הנימוק והמקורות ששימשו לכיול |
| `name_he_origin` | `internal` תמיד | ✅ | ❌ | מסמן שהתעתיק נוצר פנימית ואינו דורש מקור |
| `conflict_flag` | TRUE / ריק | ✅ | ❌ | קיימת סתירה בין מקורות |
| `conflict_notes` | טקסט | ✅ | ❌ | שני הצדדים, בלי הכרעה |

**`intensity_method` הוא השדה החשוב ביותר בקבוצה הזו.** בלעדיו, בעוד חצי שנה לא תדעו אילו ציונים הם של Disney Girl ואילו כויילו — וזה בדיוק המידע שנדרש כדי לבדוק מחדש או לתקן כלל כיול.

---

## 3. הגדרות טיפוס

### 3.1 בוליאנים ארבעת-המצבים
`big_drops` · `spinning` · `air_conditioned` · `is_motion_simulator` · `uses_large_screens_or_3d` · `official_motion_sickness_warning`

| ערך | משמעות |
|---|---|
| `TRUE` | נמצא שהמאפיין קיים |
| `FALSE` | נמצא שהמאפיין אינו קיים |
| ריק | אין מספיק מידע |
| `N/A` | לא רלוונטי לסוג הפעילות |

**הערה טכנית שמשפיעה על המסד:** טיפוס `boolean` ב-Postgres מחזיק שלושה מצבים בלבד (true/false/null) ואינו יכול להבחין בין "לא ידוע" ל"לא רלוונטי". לכן העמודות האלה נשמרות במסד כ-`text` עם `CHECK (value IN ('true','false','na'))` ו-`NULL` ללא-ידוע. אחרת ההבחנה שהגדרת נאבדת בייבוא.

### 3.2 גובה
- `height_requirement_in` — נתון המקור הרשמי, מספר, ללא יחידה בטקסט.
- `height_requirement_cm` — `round(inches × 2.54)` **לשלם הקרוב**, כלל אחיד לכל השורות.
- `none` = נמצא במפורש שאין מגבלה. ריק = לא נמצא. **`none` לעולם לא כברירת מחדל.**
- הסנטימטרים הם ערך מוצג; האינצ'ים הם ערך ביקורת ונשארים במאסטר.

### 3.3 נגישות
`wheelchair` מורחב מ-3 ערכים ל-**5**, כדי לא לאבד את ההבחנות שקיימות במקורות:

```
remain_in_wheelchair          — אפשר להישאר בכיסא
transfer_ecv_to_wheelchair    — מעבר מ-ECV לכיסא גלגלים
transfer_to_ride_vehicle      — מעבר מכיסא לרכב המתקן
transfer_wheelchair_then_ride — מעבר לכיסא ואז לרכב
must_be_ambulatory            — האורח חייב להיות מסוגל ללכת
```
בנוסף `wheelchair_official_text` שומר את הנוסח הרשמי במאסטר. **הערך המובנה משמש לסינון; הנוסח המלא הוא הגיבוי שמונע פישוט מטעה.**

### 3.4 וידאו — מוחזק מחוץ ל-Export
`youtube_id` ו-`video_creator` **נאספים למאסטר אך אינם ב-Export**, עד שתוכרע שאלת ההטמעה והשימוש המסחרי. ברגע שתוכרע — הם עוברים ל-Export בשינוי שורה אחת ברשימת העמודות, בלי לגעת בנתונים.

### 3.5 Entertainment
כל שורה עם `Activity Type = Entertainment` מקבלת `Intensity = 1`, ו-`intensity_method = entertainment_default`.
**זה כלל מתועד ולא ברירת מחדל שקטה** — התיעוד הוא מה שיאפשר לזהות ולתקן חריגים בעתיד (מופע עם תנועת מושבים).

---

## 4. תהליך ה-Product Export

### 4.1 קובץ ההרשאות
`export_columns.json` — **רשימת היתר, לא רשימת חסימה.**

```jsonc
{
  "scope": { "activity_type": ["Attraction", "Entertainment"] },
  "columns": [
    "Key", "Resort", "Park", "Park Type", "Area / Land",
    "Activity Type", "Activity", "Subtype",
    "Intensity",
    "Required Admission / Ticket", "Optional Fast Access / Pass",
    "Reservation / Additional Payment", "Included With Admission?",
    "Status / Seasonality",
    "Lightning Lane Type", "Premier Pass Included?", "Included in Multi Pass?",
    "Separate Single Pass Purchase Required?", "Extra Cost Beyond Multi Pass?",
    "opened_year", "duration_minutes", "max_speed_kmh", "inversions",
    "big_drops", "spinning", "environment", "air_conditioned",
    "is_motion_simulator", "uses_large_screens_or_3d",
    "height_requirement_cm", "gets_wet", "wheelchair",
    "official_motion_sickness_warning",
    "name_he", "aliases_he",
    "Last Verified"
  ]
}
```

`Last Verified` הוא **התאריך היחיד** ב-Export. `retrieved_date` וכל פרטי המקורות והמחקר מוחרגים.

**למה רשימת היתר ולא רשימת חסימה:** עמודה חדשה שתתווסף למאסטר בעתיד **לא תדלוף אוטומטית**. ברשימת חסימה, כל שדה מחקר חדש שנשכח להוסיף לרשימה יגיע ישר למוצר. זו ההגנה היחידה שעובדת לאורך זמן.

### 4.2 הסקריפט
`scripts/build-product-export.py`:
1. קורא את המאסטר.
2. מסנן ל-`Attraction` + `Entertainment` בלבד.
3. **בורר את העמודות מהרשימה. מה שלא ברשימה לא מועתק** — לא מסונן, לא מועתק מלכתחילה.
4. **בדיקת דליפה:** סורק את כל ערכי ה-Export וכושל אם נמצא `http`, `www.`, שם מקור מוכר, או טקסט ארוך מ-500 תווים בשדה שאינו טקסט חופשי. **זו רשת הביטחון שתופסת מקור שהודבק בטעות לתוך תא נתונים.**
5. כותב `product_export.csv` + `product_export_manifest.json` (תאריך, מספר שורות, ה-hash של רשימת העמודות).
6. **מסרב לרוץ** אם המאסטר מכיל עמודה שאינה מוכרת לא כמאושרת ולא כמאסטר-בלבד. עמודה חדשה מחייבת הכרעה מפורשת.

### 4.3 כלל עבודה
Claude Code מקבל **רק** את `product_export.csv`. המאסטר לא נכנס ל-repo, לא לתיקיית `docs/`, ולא כקובץ ייחוס. **אם המאסטר נמצא ב-repo, הוא ידלוף — בגיבוי, ב-diff או בטעות אנוש.**

---

## 5. שינויי סכמה נגזרים — מיגרציה 007

1. `sens_motion_sickness` (enum) → `official_motion_sickness_warning` (טקסט 4-מצבי).
2. הוספה: `is_motion_simulator` · `uses_large_screens_or_3d`.
3. `wheelchair` — הרחבת ה-CHECK מ-3 ערכים ל-5.
4. שינוי הבוליאנים הרלוונטיים ל-`text` עם CHECK, לפי 3.1.
5. `height_requirement_in` **לא נוספת למסד** — היא ערך ביקורת שנשאר במאסטר.
6. `sens_enclosed_dark` · `sens_heights` · `sens_loud_sudden` · `sens_strobe` — **נשארות במסד, ריקות, ולא נחשפות** בטקסונומיה, בכלים או בממשק. עדיף על הסרה והוספה מחדש; הכיסוי ממילא ריק, ואי-חשיפה מונעת שימוש בטעות.

**נגזרת ל-Claude Code:** `search_experiences` מאבד את ארבעת פילטרי הרגישות ואת `motion_sickness_max`, ומקבל במקומם `has_motion_sickness_warning`. יש לעדכן את הכלי, את סט הזהב ואת מסמך הסכמה.

---

## 6. הכרעת התאריך — **אושר 31.8.2026**

**ההחלטה:** ב-Export נשארת `Last Verified` בלבד, להצגת מועד העדכון למשתמש. `retrieved_date` וכל פרטי המקורות והמחקר הפנימיים מוחרגים.

הרקע:

כלל הברזל השני של טים הוא ש**כל תשובה עובדתית נושאת מקור ותאריך אימות**, ופוטר האמון בדף המתקן מחייב "מתי עודכן". בלי שום תאריך ב-Export, שניהם בלתי אפשריים — והם מנגנון האמון המרכזי שהמחקר זיהה.

**ההפרדה שפותרת את זה:** יש הבדל בין **ייחוס** (איזה אתר או בלוג) לבין **טריות** (מתי נבדק). ההחלטה שלך מכוונת לייחוס — שלא ייחשף מאיפה הגיע דירוג. תאריך לבדו אינו מסגיר מקור.

המוצר יציג "המידע נבדק ב-25.8.2026" בלי לומר מול מה. מנגנון האמון נשמר, ולא נחשף דבר.

**נגזרת ל-Claude Code:** `Last Verified` ממופה ל-`experience.last_verified`, ומוצג בפוטר האמון של דף המתקן ובתשובות העובדתיות של טים. **טים לעולם אינו מציין שם מקור** — רק תאריך, ולכל היותר סוג המקור ("מידע רשמי"), אם כלל יידרש.

---

## 7. מה משתנה בפרומפט לסוכן

לעדכן ב-`content-collection-agent-prompt.md`:
- **להסיר** את ארבעת שדות הרגישות ואת כל ההנחיות עליהם.
- **להחליף** רמת בחילה בבוליאני `official_motion_sickness_warning`, עם הכלל: אין למלא `FALSE` רק משום שלא נמצאה אזהרה.
- **להוסיף** `height_requirement_in` לצד הסנטימטרים, וכלל העיגול.
- **להוסיף** `is_motion_simulator` · `uses_large_screens_or_3d`.
- **להחליף** את הנחיית האינטנסיביות: לא "אל תיגע ב-Intensity", אלא **מתודולוגיית הכיול** — Disney Girl הוא ה-benchmark, ציונים קיימים לא נמחקים, וציון חדש נוסף רק אחרי כיול מתועד ב-`intensity_method` / `intensity_confidence` / `intensity_calibration_notes`.
- **להוסיף** את כלל ה-Entertainment = 1.
- **להרחיב** את ערכי הנגישות ל-5 + שמירת הנוסח הרשמי.
- **להוסיף** איסור מפורש: YouTube אינו מקור לגובה, בטיחות, נגישות, בחילה, נתונים טכניים או Intensity — רק לבחירת סרטון.
- **להוסיף** את `conflict_flag` / `conflict_notes` לדיווח הסתירות.
- **להרחיב** את דוח סוף-הקבוצה לפי סעיף 10 בהחלטות.

**לאחר אישור המפרט** אעדכן את הפרומפט ואבנה את גיליון v6 המתוקן.
