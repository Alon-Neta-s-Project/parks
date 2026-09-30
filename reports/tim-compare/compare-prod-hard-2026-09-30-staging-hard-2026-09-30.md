# Tim: production vs staging

production run `hard-2026-09-30` · staging run `hard-2026-09-30` · 3 questions

**⬆️ better on staging: 0 · 🔻 worse: 0 · same verdict: 3 · facts differ: 0**

⚠️ Verdicts are the golden-set checks, not a judgement of quality. "Facts differ" compares heights, prices, times and percentages stated in the two answers — read those rows.

| case | prod | staging | change | facts that differ | seconds prod / staging |
|---|---|---|---|---|---|
| `spell.velocicoaster-prefix` | ✅ | ✅ |  |  | 3.3 / 7.3 |
| `followup.second-ride` | ✅ | ✅ |  |  | 1.7 / 5.4 |
| `set.epic-under-100` | ❌ | ❌ |  |  | 2.0 / 8.2 |

## Answers side by side

### `spell.velocicoaster-prefix` 
**שאלה:** כמה גובה צריך לולוסיקוסטר?

| | production | staging |
|---|---|---|
| verdict | ✅  | ✅  |
| rides · chunks · retrieval | 1 · 5 · ok | 1 · 5 · ok |
| answer | לפי המידע שבידי, מגבלת הגובה המינימלית לעלייה על מתקן Jurassic World VelociCoaster בפארק Universal Islands of Adventure היא 130 ס"מ. | בשביל לעלות על Jurassic World VelociCoaster צריך גובה מינימלי של 130 ס"מ.  כדאי תמיד לוודא את דרישות הבטיחות העדכניות באפליקציה הרשמית לפני שאתם מגיעים לפארק. |

### `followup.second-ride` 
**שאלה:** ובביג ת'אנדר?

| | production | staging |
|---|---|---|
| verdict | ✅  | ✅  |
| rides · chunks · retrieval | 2 · 5 · ok | 2 · 5 · ok |
| answer | גובה המינימום ב-Big Thunder Mountain Railroad הוא 97 ס"מ. | ב-Big Thunder Mountain Railroad גובה המינימום הוא 97 ס"מ. |

### `set.epic-under-100` 
**שאלה:** אילו מתקנים ב-Epic Universe מתאימים לילד בגובה 100?

| | production | staging |
|---|---|---|
| verdict | ❌ missing any of ["Astronomica","Constellation Carousel","Yoshi","Viking Training Camp","Fyre Drill"] | ❌ missing any of ["Astronomica","Constellation Carousel","Yoshi","Viking Training Camp","Fyre Drill"] |
| rides · chunks · retrieval | 3 · 5 · ok | 3 · 5 · ok |
| answer | כדי שנוכל לבדוק בדיוק אילו מתקנים מתאימים לכם, תרצו לשתף איך לקרוא לך? | היי! ממה שבדקתי, המתקן היחיד ב-Universal Epic Universe שיש לי מידע לגביו הוא **Dark Universe Character Meet & Greet**, ואין לו מגבלת גובה מינימלית כך שהוא מתאים לגובה 100 ס"מ.  לגבי שאר המתקנים בפארק אין לי כרגע נתונים, ולכן כדאי להתעדכן לגביהם באפליקציה הרשמית. |

> מתקנים ב-Epic Universe שמתאימים ל-100 ס"מ לפי הדאטה: Astronomica, Constellation Carousel, Viking Training Camp, Fyre Drill (אין מגבלה), Yoshi's Adventure (86). **צפוי להיכשל היום** — אין כלי שעונה על שאלת קבוצה.
