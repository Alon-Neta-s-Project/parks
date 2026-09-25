#!/usr/bin/env python3
"""Compose apps/web/design/preview/index.html from page.html + the web app's tokens.css.

🔴 **The tokens come from the web app, not from a copy.** Until 25.09 this read
design/tokens.css — an older palette (navy and violet) than the one the site ships
(warm brown and orange), and both files called themselves the single source of
truth. So the approval page showed Neta colours the product no longer had.

The preview must ship self-contained (it is published as an artifact and cannot
fetch a local stylesheet), so the tokens are inlined here rather than copied by
hand. `--check` fails when index.html is stale; seed-freshness.test.ts runs it.

Usage: python3 scripts/build-preview.py [--check]
"""
import sys

from paths import P, ROOT  # noqa: E402 — המקור: scripts/paths.json
tokens = P.TOKENS_CSS.read_text(encoding="utf-8")
page = (P.DESIGN / "preview" / "page.html").read_text(encoding="utf-8")

MARKER = "/* @TOKENS@ */"
if MARKER not in page:
    raise SystemExit(f"marker {MARKER} not found in page.html")

out = P.DESIGN / "preview" / "index.html"
content = page.replace(MARKER, tokens.strip())

if "--check" in sys.argv:
    if not out.exists() or out.read_text(encoding="utf-8") != content:
        print(f"🔴 {out.relative_to(ROOT)} אינו מעודכן מול {P.TOKENS_CSS.relative_to(ROOT)}. להריץ: python3 scripts/build-preview.py")
        raise SystemExit(1)
    print(f"✅ {out.relative_to(ROOT)} מעודכן")
    raise SystemExit(0)

out.write_text(content, encoding="utf-8")
print(f"built {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")
