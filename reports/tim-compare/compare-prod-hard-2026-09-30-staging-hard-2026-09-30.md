# Tim: production vs staging

production run `hard-2026-09-30` · staging run `hard-2026-09-30` · 46 questions

**⬆️ better on staging: 0 · 🔻 worse: 0 · same verdict: 3 · facts differ: 1**

⚠️ Verdicts are the golden-set checks, not a judgement of quality. "Facts differ" compares heights, prices, times and percentages stated in the two answers — read those rows.

| case | prod | staging | change | facts that differ | seconds prod / staging |
|---|---|---|---|---|---|
| `ride.everest.height` | — | — |  |  | — / — |
| `ride.space-mountain.exact` | — | — |  |  | — / — |
| `ride.space-mountain.short-spelling` | — | — |  |  | — / — |
| `ride.everest.descriptive-hebrew` | — | — |  |  | — / — |
| `ride.velocicoaster.spelling` | — | — |  |  | — / — |
| `ride.none.weather` | — | — |  |  | — / — |
| `ride.none.greeting` | — | — |  |  | — / — |
| `persona.brand-names-stay-english` | — | — |  |  | — / — |
| `ride.moana-meet.hebrew-name` | — | — |  |  | — / — |
| `status.not-open-is-not-closed` | — | — |  |  | — / — |
| `child-swap-disney-vs-universal` | — | — |  |  | — / — |
| `single-rider-universal-negative` | — | — |  |  | — / — |
| `ll-tier-attraction-not-included` | — | — |  |  | — / — |
| `severe-weather-closure-refund` | — | — |  |  | — / — |
| `roaming-characters-expectation` | — | — |  |  | — / — |
| `kosher-strictness-clarify` | — | — |  |  | — / — |
| `epic-universe-early-entry-once` | — | — |  |  | — / — |
| `third-party-hotel-booking-warning` | — | — |  |  | — / — |
| `gentle-ride-motion-sickness-flag` | — | — |  |  | — / — |
| `parade-showtime-guided-non-answer` | — | — |  |  | — / — |
| `park-before-hotel-order-advisory` | — | — |  |  | — / — |
| `ride-breakdown-frequency-expectation` | — | — |  |  | — / — |
| `uber-eats-kosher-filter-unreliable` | — | — |  |  | — / — |
| `waterpark-toddler-family-split` | — | — |  |  | — / — |
| `single-rider-family-tradeoff` | — | — |  |  | — / — |
| `ll-booking-window-hotel-guest` | — | — |  |  | — / — |
| `ll-booking-window-both-rules` | — | — |  |  | — / — |
| `length.short-question-short-answer` | — | — |  |  | — / — |
| `regress.buzz-dark-checked-none` | — | — |  |  | — / — |
| `regress.bay-slides-height` | — | — |  |  | — / — |
| `regress.theming-recommendation` | — | — |  |  | — / — |
| `regress.epic-parking-terms` | — | — |  |  | — / — |
| `regress.premier-pass` | — | — |  |  | — / — |
| `regress.partner-hotel-perks` | — | — |  |  | — / — |
| `spell.space-mountain-typo` | — | — |  |  | — / — |
| `prefix.space-mountain-b` | — | — |  |  | — / — |
| `prefix.everest-l` | — | — |  |  | — / — |
| `spell.velocicoaster-prefix` | ✅ | ✅ |  |  | 3.3 / 7.3 |
| `spell.velocicoaster-english-typo` | — | — |  |  | — / — |
| `spell.tron-split` | — | — |  |  | — / — |
| `spell.hagrid-hebrew` | — | — |  |  | — / — |
| `spell.mario-kart` | — | — |  |  | — / — |
| `spell.guardians` | — | — |  |  | — / — |
| `followup.second-ride` | ✅ | ✅ |  |  | 1.7 / 5.4 |
| `followup.child-height` | — | — |  |  | — / — |
| `set.epic-under-100` | ❌ | ❌ |  | cm: [] → [100] | 2.0 / 8.2 |

## Answers side by side

### `ride.everest.height` 
**שאלה:** הבת שלי בגובה 112 סנטימטר, היא יכולה לעלות על אקספדישן אוורסט?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> השאלה שהחזירה "אין לי את המידע" לפני מיגרציה 030. החיפוש התאים ביטוי, והשאלה היא משפט.

### `ride.space-mountain.exact` 
**שאלה:** כדאי ללכת לספייס מאונטיין?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `ride.space-mountain.short-spelling` 
**שאלה:** כמה זמן התור לספייס מאונטן?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ⚠️ חוזרות חמש שורות מהמשפחה (Space Mountain, Spaceship Earth, Mission SPACE ועוד) כי במסד הכתיב "מאונטיין" והמשפחה כתבה "מאונטן". אות אחת. הנכונה ברשימה, אבל טים מקבל ארבעה מתקנים מיותרים בהקשר. **שם נרדף אחד סוגר את זה.**

### `ride.everest.descriptive-hebrew` 
**שאלה:** מה גובה המינימום במסע אל ההר האסור?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ⚠️ אפס שורות. "Legend of the Forbidden Mountain" מתורגם, וזה ניסוח שמשפחה ישראלית אומרת. אינו באליאסים.

### `ride.velocicoaster.spelling` 
**שאלה:** ולוצירפטור מתאים לילד בן 10?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ⚠️ אפס שורות. במסד "ולוסיקוסטר" (ס), והכתיב הנפוץ הוא בצ׳.

### `ride.none.weather` 
**שאלה:** מה קורה אם יורד גשם?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `ride.none.greeting` 
**שאלה:** שלום, מה שלומך?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `persona.brand-names-stay-english` 
**שאלה:** מה מגבלת הגובה באקספדישן אוורסט?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> בדיקת ה-Deploy של הפרסונה. rides: 1, והתשובה "מגבלת הגובה למתקן Expedition Everest – Legend of the Forbidden Mountain היא 112 ס\"מ" — השם באנגלית, המספר מהמאגר, אפס תרגום.

### `ride.moana-meet.hebrew-name` 
**שאלה:** איפה אפשר לפגוש את מואנה?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> 🔴 לפני טעינת השם העברי השאלה החזירה אפס שורות. במדידה: rides: 4, והשורה נמצאה. ⚠️ תשובה שמזכירה גם את Journey of Water, Inspired by Moana אינה כישלון — יש בשמו "מואנה" והוא פתוח.

### `status.not-open-is-not-closed` 
**שאלה:** אפשר לפגוש את מואנה באנימל קינגדום?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ⚠️ שתי המילים נבחרו כי אין להן צורת היפוך בהקשר הזה. במדידה אחרי התיקון: rides: 6, ואף אחת מהשתיים לא הופיעה. טים כתב "אינה בלוח קבוע... חובה לבדוק באפליקציה הרשמית ביום הביקור עצמו" — הניסוח החדש הגיע כלשונו. ובנוסף "אין למתקן הזה מגבלת גובה", ולא "גובה מינימום 0", שזה הכלל השני שנבדק כאן דרך אגב.

### `child-swap-disney-vs-universal` 
**שאלה:** איך עובד Child Swap בדיסני וביוניברסל? זה אותו דבר?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `single-rider-universal-negative` 
**שאלה:** יש לי אופציית single rider ביוניברסל?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `ll-tier-attraction-not-included` 
**שאלה:** האם Tron כלול במכסת ה-Multi Pass שלי?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ✅ אומת מול הטבלה: TRON Lightcycle / Run נושא Single Pass ו- singlePassRequired: true. הציפייה נכונה מול הנתונים.

### `severe-weather-closure-refund` 
**שאלה:** הפארק נסגר לגמרי בגלל סערה — מובטח לי החזר כספי?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ✅ מנוסח על מה שכן חייב להופיע ולא כשלילה של "מובטח" — בדיוק התיקון שסוכם, כי must_not_contain היה נופל על "לא מובטח" עצמו.

### `roaming-characters-expectation` 
**שאלה:** אני יכול/ה לפגוש דמויות שמסתובבות חופשי בפארק, לא בתור?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `kosher-strictness-clarify` 
**שאלה:** יש אוכל כשר בפארק?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `epic-universe-early-entry-once` 
**שאלה:** אני יכול/ה להשתמש בכניסה מוקדמת כל יום בשהות שלי ב-Epic Universe?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `third-party-hotel-booking-warning` 
**שאלה:** הזמנתי מלון דיסני דרך Booking.com — יש משהו שכדאי לדעת?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `gentle-ride-motion-sickness-flag` 
**שאלה:** יש מתקן שנראה רגוע אבל עלול לגרום לי לבחילה?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ✅ אומת מול הטבלה: 24 מתקנים בעוצמה 1–2 נושאים אזהרת בחילה, בהם Toy Story Mania! ו-Alien Swirling Saucers. יש למקרה תשובה אמיתית.

### `parade-showtime-guided-non-answer` 
**שאלה:** באיזו שעה התהלוכה היום?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> אין נתוני לוח זמנים במערכת. טים אינו ממציא שעה, וגם אינו מסרב יבש — הוא מכוון לאפליקציה או לאתר.

### `park-before-hotel-order-advisory` 
**שאלה:** כדאי לי לבחור מלון קודם, ואז להחליט לאיזה פארק ללכת?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `ride-breakdown-frequency-expectation` 
**שאלה:** המתקנים שתכננתי יעבדו בלי תקלות?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `uber-eats-kosher-filter-unreliable` 
**שאלה:** אני יכול/ה לסמוך על הסינון 'כשר' באובר איטס בפארק?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `waterpark-toddler-family-split` 
**שאלה:** יש לי פעוט בן 2-3 — כדאי ללכת לפארק מים עם כל המשפחה?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `single-rider-family-tradeoff` 
**שאלה:** כדאי לנו להשתמש ב-single rider כדי לקצר את התור?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `ll-booking-window-hotel-guest` 
**שאלה:** מתי אני יכול/ה להזמין בפועל את חלון-הזמן למתקן עם Lightning Lane, אם אני ישן/ה במלון דיסני?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> נמדד: chunks: 5, והתשובה נשאה "עד 7 ימים לפני יום ההגעה למלון", "7:00 בבוקר לפי שעון מזרח" ו"מכסה את כל ימי השהות שלך, עד 14 ימים" — כלומר שלושת הפרטים החדשים עברו מהתוכן אל התשובה.

### `ll-booking-window-both-rules` 
**שאלה:** מתי נפתחת ההזמנה של Lightning Lane Multi Pass?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `length.short-question-short-answer` 
**שאלה:** מה מגבלת הגובה בספייס מאונטיין?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ⚠️ התקרה היא על שאלה עובדתית ממוקדת בלבד. שאלה פתוחה מצדיקה תשובה ארוכה, ותקרה גורפת הייתה קונה קיצור במחיר הסייגים — וזה בדיוק ההפך ממה שהמוצר הזה עושה. במדידה: 24 טוקנים, משפט אחד. ✅ ואומת ש-112 נכון גם ל-Space Mountain וגם לאוורסט — צירוף מקרים, לא שורה שהתחלפה. ובמקביל מואנה ירדה מ-289 טוקנים ל-117, והסייג נשאר פעם אחת.

### `regress.buzz-dark-checked-none` 
**שאלה:** האם באזז לייטייר יש קטעים חשוכים?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `regress.bay-slides-height` 
**שאלה:** מה מגבלת הגובה של Bay Slides?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ⚠️ צפוי הבדל בין הסביבות: בייצור height_requirement_cm הוא NULL ("לא נבדק") וברפו 0 ("נבדק, אין מינימום") — O15. התקרה, 152, זהה בשתיהן.

### `regress.theming-recommendation` 
**שאלה:** אנחנו מעדיפים פארקים עם תפאורה יפה, איזה פארק מתאים?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> נבדק בעין בדוח: 2–3 מתקנים **בשם** לכל פארק שמוצג (הכרעת פולה, 09.09), ולא פסקת אווירה. אין לזה בדיקה דטרמיניסטית עדיין.

### `regress.epic-parking-terms` 
**שאלה:** כשנוסעים ל-Epic Universe, איפה חונים?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> נבדק בעין — "קמפוס" ו"טרם" מוסברים בחצי משפט בפעם הראשונה.

### `regress.premier-pass` 
**שאלה:** מה זה Premier Pass?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> נבדק בעין — הניסוח שפולה אישרה, לא הישן.

### `regress.partner-hotel-perks` 
**שאלה:** מה מקבלים במלון שותף של יוניברסל?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> נבדק בעין — הפרדה בין מלון שותף למלון בבעלות יוניברסל, ובלי ביטחון על מסמך T3.

### `spell.space-mountain-typo` 
**שאלה:** מה גובה המינימום בספייס מאונטן?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `prefix.space-mountain-b` 
**שאלה:** בספייס מאונטיין יש מגבלת גובה?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `prefix.everest-l` 
**שאלה:** גובה מינימום לאוורסט?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `spell.velocicoaster-prefix` 
**שאלה:** כמה גובה צריך לולוסיקוסטר?

| | production | staging |
|---|---|---|
| verdict | ✅  | ✅  |
| rides · chunks · retrieval | 1 · 5 · ok | 1 · 5 · ok |
| answer | לפי המידע שבידי, מגבלת הגובה המינימלית לעלייה על מתקן Jurassic World VelociCoaster בפארק Universal Islands of Adventure היא 130 ס"מ. | בשביל לעלות על Jurassic World VelociCoaster צריך גובה מינימלי של 130 ס"מ.  כדאי תמיד לוודא את דרישות הבטיחות העדכניות באפליקציה הרשמית לפני שאתם מגיעים לפארק. |

### `spell.velocicoaster-english-typo` 
**שאלה:** מה הגובה ב-velocicoster?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `spell.tron-split` 
**שאלה:** מה הגובה בטרון לייט סייקל?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `spell.hagrid-hebrew` 
**שאלה:** מה הגובה בהגריד?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> הכינוי בדאטה הוא "האגריד"; "הגריד" הוא הכתיב הנפוץ.

### `spell.mario-kart` 
**שאלה:** מריו קרט מתאים לילד בגובה 100?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `spell.guardians` 
**שאלה:** מגבלת גובה בגרדיאנס אוף דה גלקסי?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

### `followup.second-ride` 
**שאלה:** ובביג ת'אנדר?

| | production | staging |
|---|---|---|
| verdict | ✅  | ✅  |
| rides · chunks · retrieval | 2 · 5 · ok | 2 · 5 · ok |
| answer | גובה המינימום ב-Big Thunder Mountain Railroad הוא 97 ס"מ. | ב-Big Thunder Mountain Railroad גובה המינימום הוא 97 ס"מ. |

### `followup.child-height` 
**שאלה:** והבן שלי בגובה 105, הוא יכול לעלות?

| | production | staging |
|---|---|---|
| verdict | —  | —  |
| rides · chunks · retrieval | — | — |
| answer | — | — |

> ⚠️ השם אינו בשאלה, רק בהיסטוריה. היום השליפה לא תמצא אותו, וטים יענה מההיסטוריה בלבד — rides_gt: 0 הוא מה שאמור להיכשל, ולהשתפר.

### `set.epic-under-100` 
**שאלה:** אילו מתקנים ב-Epic Universe מתאימים לילד בגובה 100?

| | production | staging |
|---|---|---|
| verdict | ❌ missing any of ["Astronomica","Constellation Carousel","Yoshi","Viking Training Camp","Fyre Drill"] | ❌ missing any of ["Astronomica","Constellation Carousel","Yoshi","Viking Training Camp","Fyre Drill"] |
| rides · chunks · retrieval | 3 · 5 · ok | 3 · 5 · ok |
| answer | כדי שנוכל לבדוק בדיוק אילו מתקנים מתאימים לכם, תרצו לשתף איך לקרוא לך? | היי! ממה שבדקתי, המתקן היחיד ב-Universal Epic Universe שיש לי מידע לגביו הוא **Dark Universe Character Meet & Greet**, ואין לו מגבלת גובה מינימלית כך שהוא מתאים לגובה 100 ס"מ.  לגבי שאר המתקנים בפארק אין לי כרגע נתונים, ולכן כדאי להתעדכן לגביהם באפליקציה הרשמית. |

> מתקנים ב-Epic Universe שמתאימים ל-100 ס"מ לפי הדאטה: Astronomica, Constellation Carousel, Viking Training Camp, Fyre Drill (אין מגבלה), Yoshi's Adventure (86). **צפוי להיכשל היום** — אין כלי שעונה על שאלת קבוצה.
