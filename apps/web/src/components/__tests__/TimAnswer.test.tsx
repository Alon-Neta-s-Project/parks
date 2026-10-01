import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TimAnswer } from "../TimAnswer";

/**
 * Tim's answer as formatted text (Alon, 01.10 — the agent writes Markdown, and the screen showed
 * `**` and `*` as characters). Only the formatting an answer needs; never a link, never HTML.
 */
const html = (md: string) => renderToStaticMarkup(<TimAnswer text={md} />);

describe("Tim's answer, rendered", () => {
  it("bold and italic", () => {
    expect(html("**Flight of the Hippogriff** מתאימה *לשניהם*")).toContain("<strong>Flight of the Hippogriff</strong>");
    expect(html("*לשניהם*")).toContain("<em>לשניהם</em>");
  });

  it("a list is a list — the screenshot of 01.10", () => {
    const out = html("הנה:\n\n* **The Barnstormer** — 89 ס\"מ\n* **Dumbo**");
    expect(out).toContain("<ul>");
    expect(out.match(/<li>/g)?.length).toBe(2);
    expect(out).not.toContain("* ");
  });

  // 🔴 No sources in the interface (CLAUDE.md). The server scrubs URLs; this is the second layer.
  it("never renders a link — only its text", () => {
    const out = html("ראו [האתר הרשמי](https://disneyworld.disney.go.com) לפרטים");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("disney.go.com");
    expect(out).toContain("האתר הרשמי");
  });

  it("never renders HTML from the answer", () => {
    const out = html('שלום <script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("onerror");
  });

  it("a heading is not a heading in a chat bubble — its text stays", () => {
    const out = html("## מתקנים מומלצים\nטקסט");
    expect(out).not.toMatch(/<h[1-6]/);
    expect(out).toContain("מתקנים מומלצים");
  });
});
