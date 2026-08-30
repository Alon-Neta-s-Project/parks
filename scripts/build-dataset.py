#!/usr/bin/env python3
"""Derive the app dataset from the workbook.

The workbook is the database. Every field below traces to a column in
ACTIVITY_DATABASE -- nothing is inferred, enriched or filled in. Where the
workbook says "Unknown" or "Not confirmed", that survives into the dataset as
null plus a note, because "we looked and did not find" is information.

Scope: attractions and entertainment only (232 rows). Dining and special events
stay in the workbook and in data/source/*.json but are not built into the app.

Usage: python3 scripts/build-dataset.py
"""
import json
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source" / "activity_database.json"
OUT = ROOT / "src" / "data"

IN_SCOPE = {"Attraction", "Entertainment"}
KIND = {"Attraction": "attraction", "Entertainment": "entertainment"}

# ACCESS_RULES calls DisneyGirlBlog an aggregator used for intensity only, and the
# workbook README makes official Disney/Universal the authority for everything
# else. That maps onto the brief's authority tiers.
TIER_OFFICIAL = 1
TIER_AGGREGATE = 4


def slugify(park: str, name: str) -> str:
    """Stable id. Must include the park -- Starbucks appears in three parks."""
    raw = f"{park} {name}"
    raw = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", raw.lower())).strip("-")


def status_of(text: str) -> dict:
    """The workbook's Status / Seasonality is free text with dates inside it.

    Filtering needs an enum, and the exact wording still matters to a reader, so
    keep both rather than discarding the sentence.
    """
    if text == "Open / current":
        return {"state": "open", "note": None}
    lowered = text.lower()
    if "temporarily unavailable" in lowered or "closure" in lowered:
        return {"state": "closed", "note": text}
    return {"state": "check", "note": text}


def intensity_of(row: dict) -> dict:
    raw = row.get("Intensity")
    basis = row.get("Intensity Source Basis") or ""
    if raw in {"1", "2", "3", "4"}:
        return {"value": int(raw), "basis": basis, "rated": True}
    # "Unknown" means DisneyGirlBlog has no explicit rating for this exact
    # current name. Never coerce that to 0 -- unrated is not gentle.
    return {"value": None, "basis": basis, "rated": False}


def fast_access(row: dict) -> dict:
    """The nine ticketing columns, passed through rather than collapsed.

    Multi Pass vs Single Pass is the distinction the product exists to make
    legible, and it is the only dimension with complete coverage.
    """
    ll = row.get("Lightning Lane Type") or "N/A"
    return {
        "system": ll,
        "offered": ll in {"Multi Pass", "Single Pass"},
        "inMultiPass": row.get("Included in Multi Pass?") or "N/A",
        "singlePassRequired": row.get("Separate Single Pass Purchase Required?") == "Yes",
        "premierIncluded": row.get("Premier Pass Included?") or "N/A",
        "extraCost": ll == "Single Pass",
        "summary": row.get("Optional Fast Access / Pass") or "",
        "notes": row.get("Lightning Lane Purchase Notes") or "",
        # 52 Universal rows say Express participation is not confirmed on the
        # official source. Section 7: show the contradiction, do not resolve it.
        "unconfirmed": (row.get("Optional Fast Access / Pass") or "").startswith("Not confirmed"),
    }


def sources_of(row: dict) -> list:
    out, seen = [], set()
    for url, tier, label in (
        (row.get("Official Activity Source URL"), TIER_OFFICIAL, "official"),
        (row.get("Access Source URL"), TIER_OFFICIAL, "access"),
        (row.get("Intensity Source URL"), TIER_AGGREGATE, "intensity"),
    ):
        if url and url not in seen:
            seen.add(url)
            out.append({"url": url, "tier": tier, "role": label})
    return out


def main():
    rows = [r for r in json.loads(SRC.read_text(encoding="utf-8")) if r["Activity Type"] in IN_SCOPE]

    experiences, ids = [], set()
    for row in rows:
        park, name = row["Park"], row["Activity"]
        eid = slugify(park, name)
        if eid in ids:
            raise SystemExit(f"duplicate id {eid!r} -- slug rule is not stable")
        ids.add(eid)
        experiences.append({
            "id": eid,
            "nameEn": name,
            # No Hebrew names in the workbook. Left null rather than transliterated.
            "nameHe": None,
            "resort": row["Resort"],
            "park": park,
            "parkKind": "water" if row["Park Type"] == "Water Park" else "theme",
            "kind": KIND[row["Activity Type"]],
            "land": row["Area / Land"],
            "subtype": row["Subtype"],
            "intensity": intensity_of(row),
            "status": status_of(row.get("Status / Seasonality") or ""),
            "admission": row.get("Required Admission / Ticket") or "",
            "reservation": row.get("Reservation / Additional Payment") or "",
            "fastAccess": fast_access(row),
            "sources": sources_of(row),
            "sourceVerifiedAt": row.get("Last Verified"),
            # Not in the workbook. Present as explicit nulls so the UI can render
            # a real empty state and the gap stays visible instead of vanishing.
            "heightMinCm": None,
            "sensitivities": None,
            "durationMin": None,
            "opened": None,
            "getsWet": None,
            "airConditioned": None,
            "accessibility": None,
            "popularity": None,
            "editorial": None,
            "youtubeId": None,
        })

    experiences.sort(key=lambda e: (e["park"], e["land"], e["nameEn"]))

    parks = {}
    for e in experiences:
        p = parks.setdefault(e["park"], {
            "name": e["park"], "resort": e["resort"], "kind": e["parkKind"],
            "count": 0, "rated": 0, "lands": set(),
        })
        p["count"] += 1
        p["rated"] += 1 if e["intensity"]["rated"] else 0
        p["lands"].add(e["land"])
    park_list = sorted(
        ({**p, "lands": sorted(p["lands"])} for p in parks.values()),
        key=lambda p: (p["resort"], -p["count"]),
    )

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "experiences.json").write_text(
        json.dumps(experiences, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (OUT / "parks.json").write_text(
        json.dumps(park_list, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    rated = sum(1 for e in experiences if e["intensity"]["rated"])
    print(f"experiences {len(experiences)}  rated {rated}  parks {len(park_list)}")
    print(f"  subtypes {len({e['subtype'] for e in experiences})}  lands {len({e['land'] for e in experiences})}")
    for p in park_list:
        print(f"  {p['name']:32} {p['count']:3} rows  {p['rated']:3} rated  {len(p['lands']):2} lands")


if __name__ == "__main__":
    main()
