#!/usr/bin/env python3
"""Inline the built app into one self-contained HTML file.

The published page has to carry its own CSS and JS -- an artifact may only load
scripts from a short CDN allowlist, and stylesheets only from Google Fonts -- so
the Vite output is folded into a single file here. The wrapper supplies
<!doctype>, <html> and <body>, so this emits body-level markup only and lets the
stylesheet set direction on <html> instead of an attribute.

Run after `npm run build`. Usage: python3 scripts/build-artifact.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = ROOT / "design" / "preview" / "tim.html"

FONTS = (
    "https://fonts.googleapis.com/css2?"
    "family=Assistant:wght@400;500;600;700&family=Archivo:wght@400;500;600;700&display=swap"
)


def one(pattern: str, text: str) -> str:
    found = re.findall(pattern, text)
    if len(found) != 1:
        raise SystemExit(f"expected exactly one match for {pattern!r}, got {len(found)}")
    return found[0]


def main():
    index = (DIST / "index.html").read_text(encoding="utf-8")
    js = (DIST / one(r'<script type="module"[^>]*src="\.?/?([^"]+)"', index)).read_text("utf-8")
    css = (DIST / one(r'<link rel="stylesheet"[^>]*href="\.?/?([^"]+)"', index)).read_text("utf-8")

    # The bundle ends in an ES module; keep it a module so its imports still work.
    OUT.write_text(
        "\n".join([
            "<title>טים · מדריך הפארקים</title>",
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
            f'<link rel="stylesheet" href="{FONTS}">',
            f"<style>{css}</style>",
            '<div id="root"></div>',
            f'<script type="module">{js}</script>',
            "",
        ]),
        encoding="utf-8",
    )
    print(f"{OUT.relative_to(ROOT)}  {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
