#!/usr/bin/env python3
"""Concatenate 001-014 plus the seeds into one file for Supabase Studio.

Migrations are meant to run in order, one at a time. This exists because they
have to be pasted into a SQL editor by hand, and pasting fourteen files in the
right order is exactly the kind of thing that goes wrong once and is hard to see
afterwards.

⚠️ db/local/000_auth_shim.sql is deliberately excluded. On Supabase the auth
schema belongs to the platform; the shim would collide with the real one.

Usage: python3 scripts/build-supabase-bundle.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "db" / "supabase-bundle.sql"

migrations = sorted((ROOT / "db" / "migrations").glob("*.sql"))
seeds = sorted((ROOT / "db" / "seed").glob("*.sql"))

if not migrations:
    raise SystemExit("no migrations found")

# A file whose name does not start with its number would run out of order.
for f in migrations:
    if not re.match(r"^\d{3}_", f.name):
        raise SystemExit(f"✗ {f.name} is not numbered — it would run out of order. Rename it.")

parts = [
    "-- Park Day Companion — כל המיגרציות בקובץ אחד, לפי הסדר.",
    f"-- נוצר על ידי scripts/build-supabase-bundle.py מתוך {len(migrations)} מיגרציות ו-{len(seeds)} seeds.",
    "--",
    "-- להדביק ל-Supabase Studio → SQL Editor ולהריץ פעם אחת.",
    "--",
    "-- ⚠️ db/local/000_auth_shim.sql אינו כאן, בכוונה. ב-Supabase סכמת auth",
    "--    שייכת לפלטפורמה, והפיגום המקומי היה מתנגש בה.",
    "--",
    "-- כל קובץ עטוף ב-BEGIN/COMMIT משלו, ולכן כישלון עוצר בנקודה מוגדרת",
    "-- ואינו משאיר מיגרציה חצי-מיושמת.",
    "",
]

for f in migrations + seeds:
    label = "seed" if f.parent.name == "seed" else "migration"
    parts += [
        "",
        "-- " + "=" * 74,
        f"-- {label}: {f.name}",
        "-- " + "=" * 74,
        "",
        f.read_text(encoding="utf-8").strip(),
        "",
    ]

OUT.write_text("\n".join(parts) + "\n", encoding="utf-8")
size = OUT.stat().st_size
print(f"{OUT.relative_to(ROOT)}  {size / 1024:.0f} KB")
print(f"  {len(migrations)} migrations: {migrations[0].name} … {migrations[-1].name}")
print(f"  {len(seeds)} seeds: {', '.join(s.name for s in seeds)}")
print("  auth shim excluded ✓")
