#!/usr/bin/env python3
"""המקום היחיד שבו כתוב איפה כל דבר יושב ברפו.

🔴 **קיים לקראת פיצול הרפו ל-apps/web ו-apps/server.** לפני הקובץ הזה כל
סקריפט חישב לעצמו `ROOT / "knowledge"` או `ROOT / "db" / "migrations"`,
וכ-60 מקומות היו נשברים בהזזת תיקייה — כל אחד בשקט, בזמן אחר.

⚠️ **המקור הוא `paths.json`, לא הקובץ הזה.** הטעינה בפייתון, ב-TypeScript
(`paths.ts`) ובבאש (`python3 scripts/paths.py KEY`) קוראת את אותו קובץ.
שלוש רשימות היו שלושה מקורות אמת.

  from paths import P, ROOT        # P.KNOWLEDGE → Path מוחלט
  python3 scripts/paths.py SOURCE  # מדפיס את הנתיב היחסי, לשימוש בבאש
"""
import json
import pathlib
import sys
from types import SimpleNamespace

ROOT = pathlib.Path(__file__).resolve().parent.parent
REL: dict[str, str] = json.loads((ROOT / "scripts" / "paths.json").read_text("utf-8"))
P = SimpleNamespace(**{k: ROOT / v for k, v in REL.items()})

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in REL:
        raise SystemExit(f"שימוש: paths.py <{'|'.join(REL)}>")
    print(REL[sys.argv[1]])
