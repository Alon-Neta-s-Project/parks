import Markdown from "react-markdown";

/**
 * Tim's answer, as formatted text — the agent writes Markdown (bold ride names, lists), and the
 * screen showed the `**` and `*` as characters (Alon, 01.10).
 *
 * 🔴 **Only what an answer needs, nothing that can carry something else:**
 *   - **No links.** "No sources in the interface" is a product rule (CLAUDE.md). The server scrubs
 *     URLs from the answer (safety.ts); a link that got past it renders as its text — never as a
 *     link, and its address is never shown.
 *   - **No HTML from the answer** (`skipHtml`) — the model's output never becomes markup.
 *   - Headings, images, tables, code: unwrapped to their text. A chat bubble is not a document.
 * Rendered to React elements by react-markdown — no `dangerouslySetInnerHTML`.
 */
const ALLOWED = ["p", "strong", "em", "ul", "ol", "li", "br"];

export function TimAnswer({ text }: { text: string }) {
  return (
    <div className="bubble__md">
      <Markdown allowedElements={ALLOWED} unwrapDisallowed skipHtml>
        {text}
      </Markdown>
    </div>
  );
}
