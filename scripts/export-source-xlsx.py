#!/usr/bin/env python3
"""Export the workbook Neta supplied into plain JSON, verbatim.

This is NOT the importer described in section 6a of the master brief. It does no
mapping, no validation and no schema decisions -- it only makes the delivered
content readable by diff and by code without opening Excel. The real importer
(scripts/import-content.ts) waits on db/ and content-mapping.json.

Usage: python3 scripts/export-source-xlsx.py
"""
import json
import pathlib

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source" / "Orlando_Parks_Trip_Planner_2026_CURRENT_v5.xlsx"
OUT = ROOT / "data" / "source"


def cell(v):
    if v is None:
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    s = str(v).strip()
    return s or None


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    manifest = {}
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        header = [cell(h) or f"col_{i}" for i, h in enumerate(rows[0])]
        records = []
        for raw in rows[1:]:
            values = [cell(v) for v in raw]
            if not any(values):
                continue
            records.append({k: v for k, v in zip(header, values) if v is not None})
        path = OUT / f"{ws.title.lower()}.json"
        path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest[ws.title] = {"rows": len(records), "columns": header, "file": path.name}
        print(f"{ws.title:20} {len(records):4} rows -> {path.name}")

    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
