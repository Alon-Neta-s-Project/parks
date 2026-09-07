#!/usr/bin/env python3
"""53 מסמכי הידע → SQL, מוכן להדבקה ב-Supabase.

⚠️ **בלי embeddings.** הקובץ הזה טוען את המסמכים ואת הקטעים; הווקטורים
מחושבים בשלב נפרד על ידי פונקציית שרת, כי הם דורשים את מפתח ג'מיני —
והמפתח יושב ב-Secrets ואינו עובר דרך הקוד הזה, דרך הצ'אט או דרך המחשב
של נטע. הפרדה זו היא הסיבה שהקובץ הזה בטוח לשמירה ברפו.

⚠️ **אידמפוטנטי לפי id** (פולה): הרצה חוזרת מרעננת מסמך קיים ואינה
משכפלת אותו. `on conflict do update` מרענן את **כל** העמודות, גם כשהערך
החדש NULL — עמודה שחסרה שם הייתה משאירה ערך ישן לנצח, ומסמך שאיבד שדה
בעדכון היה נשאר עם הישן בלי ששום דבר ייראה שבור.

⚠️ **חיתוך לפי כותרות `##`.** כל מסמך בנוי כרצף של שאלות — "מה Multi Pass
נותן?", "מתי אפשר לרכוש?" — ולכן הכותרת היא גבול הקטע הטבעי. חיתוך לפי
מספר תווים היה חוצה שאלה באמצע ומחזיר חצי תשובה כתשובה שלמה.

הרצה:  python3 scripts/build-knowledge-seed.py
"""
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "knowledge"
OUT = ROOT / "db" / "knowledge-seed" / "knowledge.sql"

REQUIRED = ["id", "title", "doc_type", "authority_tier", "scope_resort",
            "volatility", "source_url", "last_verified",
            "product_family", "audience", "v1_priority", "purchase_type"]

# ⚠️ המסמכים אינם תוכן קהילתי. הם נאספו ואומתו מול מקורות רשמיים, ולכן
# הם נכנסים כ-approved. תוכן שנשלח על ידי משתמשים לעולם אינו נכנס
# לאינדקס לפני אישור אדם — הכלל הזה נשמר, הוא פשוט אינו חל כאן.
REVIEW_STATUS = "approved"

# ⚠️ מזהה הריזורט ב-frontmatter הוא wdw/uor, ובטבלת resort הוא זהה.
# scope_park נשאר NULL: המסמכים הם ברמת ריזורט ולא ברמת פארק, ושיוך
# לפארק שרירותי היה גורם לשליפה לסנן החוצה מסמך רלוונטי.


def q(value):
    """מחרוזת SQL, או NULL. ⚠️ ריק אינו מחרוזת ריקה — הוא NULL."""
    if value is None or value == "":
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def arr(values):
    """מערך טקסט. ⚠️ מערך גם כשיש בו איבר אחד."""
    if not values:
        return "null"
    return "array[" + ", ".join(q(v) for v in values) + "]"


def parse(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        sys.exit(f"❌ {path.name}: אין frontmatter")
    fm = {}
    for line in m.group(1).split("\n"):
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    return fm, m.group(2).strip()


def chunks(body):
    """הגוף → קטעים, לפי כותרות `##`.

    ⚠️ הכותרת נשארת בתוך הקטע. היא **השאלה** — "האם כל המתקנים כלולים?" —
    וקטע שנשלף בלעדיה מאבד את מה שהוא עונה עליו, כלומר טים מקבל תשובה
    ולא יודע לאיזו שאלה.
    """
    parts = re.split(r"\n(?=## )", body)
    out = []
    for part in parts:
        part = part.strip()
        # ⚠️ פסקה קצרה מדי אינה קטע. היא תתחרה על אותה שליפה עם קטע שיש
        # בו תשובה, ותנצח כשהשאלה קצרה.
        if len(part) >= 80:
            out.append(part)
    return out


def main() -> int:
    files = sorted(DIR.glob("*.md"))
    if not files:
        sys.exit(f"❌ אין מסמכים ב-{DIR}")

    doc_rows, chunk_rows = [], []
    total_chars = 0

    for path in files:
        fm, body = parse(path)
        missing = [f for f in REQUIRED if not fm.get(f)]
        if missing:
            sys.exit(f"❌ {path.name}: חסר {', '.join(missing)}. "
                     "להריץ scripts/check-knowledge.py לפני.")
        if fm["id"] != path.stem:
            sys.exit(f"❌ {path.name}: id={fm['id']!r} אינו שם הקובץ — "
                     "ingest אידמפוטנטי לפי id מחייב שהם יהיו זהים")

        urls = [u.strip() for u in fm["source_url"].split(",") if u.strip()]
        doc_rows.append("(" + ", ".join([
            q(fm["id"]), q(fm["title"]), q(fm["doc_type"]), q(fm["authority_tier"]),
            q("he"), q(fm["scope_resort"]), q(fm["volatility"]), q(fm["last_verified"]),
            q(REVIEW_STATUS), arr(urls),
            q(fm["product_family"]), q(fm["audience"]),
            q(fm["v1_priority"]), q(fm["purchase_type"]),
            q(body),
        ]) + ")")

        parts = chunks(body)
        if not parts:
            sys.exit(f"❌ {path.name}: לא נוצר אף קטע")
        for i, part in enumerate(parts):
            total_chars += len(part)
            chunk_rows.append("(" + ", ".join([
                q(fm["id"]), str(i), q(part),
                q(fm["authority_tier"]), q("he"), q(REVIEW_STATUS),
            ]) + ")")

    DOC_COLS = ["id", "title", "doc_type", "authority_tier", "locale", "scope_resort",
                "volatility", "last_verified", "review_status", "source_urls",
                "product_family", "audience", "v1_priority", "purchase_type", "body"]
    # ⚠️ ה-SET נגזר מרשימת העמודות ואינו נכתב שוב, כדי שהן לא יוכלו להיפרד.
    doc_set = ",\n  ".join(f"{c} = excluded.{c}" for c in DOC_COLS if c != "id")
    # ⚠️ f-string אינה מקבלת \\n בתוך ביטוי, ולכן החיבורים נעשים כאן.
    doc_values = ",\n".join(doc_rows)
    chunk_values = ",\n".join(chunk_rows)
    doc_cols = ", ".join(DOC_COLS)

    sql = f"""-- ==========================================================================
-- Park Day Companion — מאגר הידע: {len(files)} מסמכים · {len(chunk_rows)} קטעים
-- ==========================================================================
--
-- נוצר על ידי scripts/build-knowledge-seed.py מתוך knowledge/.
-- אין לערוך ביד — לעדכן את המסמכים ולהריץ את הסקריפט מחדש.
--
-- ⚠️ **בלי embeddings.** הווקטורים מחושבים בנפרד על ידי פונקציית שרת,
-- כי הם דורשים את מפתח ג'מיני — והמפתח אינו עובר דרך הקובץ הזה. לכן
-- אחרי ההרצה הזו הקטעים קיימים ו-embedding שלהם NULL, וזה המצב הצפוי.
--
-- ⚠️ אפשר להריץ שוב בבטחה. אידמפוטנטי לפי id.
--
-- ⚠️ להריץ **אחרי** מיגרציה 025 (ארבעת שדות הטקסונומיה ו-source_urls).
--
-- ==========================================================================

BEGIN;

set local search_path = public, extensions;

insert into knowledge_doc
  ({doc_cols})
values
{doc_values}
on conflict (id) do update set
  {doc_set},
  updated_at = now();

-- ⚠️ הקטעים נמחקים ונכתבים מחדש, ולא מתעדכנים במקום. מסמך שנערך עשוי
-- להתחלק למספר אחר של קטעים, ועדכון לפי chunk_index היה משאיר קטעים
-- ישנים תלויים באוויר — עם embedding תקף, ולכן הם היו ממשיכים להישלף.
delete from knowledge_chunk
 where doc_id in (select id from knowledge_doc);

insert into knowledge_chunk
  (doc_id, chunk_index, content, authority_tier, locale, review_status)
values
{chunk_values};

COMMIT;

-- ── אימות ────────────────────────────────────────────────────────────
select
  (select count(*) from knowledge_doc)                                as "מסמכים",
  (select count(*) from knowledge_chunk)                              as "קטעים",
  (select count(*) from knowledge_chunk where embedding is null)      as "בלי וקטור (צפוי: כל הקטעים)",
  (select count(*) from knowledge_doc where cardinality(source_urls) > 1) as "מסמכים עם שני מקורות";
"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    io.open(OUT, "w", encoding="utf-8").write(sql)
    print(f"{OUT.relative_to(ROOT)}  {len(sql) // 1024} KB")
    print(f"  {len(files)} מסמכים · {len(chunk_rows)} קטעים · "
          f"{total_chars // len(chunk_rows)} תווים לקטע בממוצע")
    print(f"  {len(DOC_COLS)} עמודות נכתבות, {len(DOC_COLS) - 1} מרועננות בהתנגשות")
    return 0


if __name__ == "__main__":
    sys.exit(main())
