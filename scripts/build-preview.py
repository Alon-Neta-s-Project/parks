#!/usr/bin/env python3
"""Compose design/preview/index.html from page.html + tokens.css.

design/tokens.css is the single source of truth for the design language.
The preview must ship self-contained (it is published as an artifact and cannot
fetch a local stylesheet), so the tokens are inlined here rather than copied by
hand -- that keeps the published page and the repo file from drifting.
"""
import pathlib

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json
tokens = (P.DESIGN / "tokens.css").read_text(encoding="utf-8")
page = (P.DESIGN / "preview" / "page.html").read_text(encoding="utf-8")

MARKER = "/* @TOKENS@ */"
if MARKER not in page:
    raise SystemExit(f"marker {MARKER} not found in page.html")

out = P.DESIGN / "preview" / "index.html"
out.write_text(page.replace(MARKER, tokens.strip()), encoding="utf-8")
print(f"built {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")
