/**
 * The chunks, as they enter the model's context.
 *
 * ⚠️ **The marking comes from volatility, not from the text.** That's the
 * whole idea of section 8: a caveat paragraph in the body of every document
 * pulled all documents closer together in embedding space — the more general
 * the question, the more the shared paragraph weighs — and also duplicated
 * information that already exists as a field. Here it's written once, per
 * chunk, from the field.
 *
 * ⚠️ And no sources. match_knowledge doesn't return source_urls, and what
 * never reaches this point can't leak into the answer.
 */
/**
 * 🔴 **What must not go out is blocked in code, not by an instruction.**
 *
 * The instructions tell Tim not to reveal links or keys. An instruction is a
 * request: a model can ignore it, and prompt injection is exactly the attempt
 * to make it do so. **What must be certain is checked on the output**, after
 * the model is done.
 *
 * ⚠️ **And this is the last layer, not the first.** The real protection is
 * that what must not be revealed **isn't in the context to begin with**: keys
 * are sent as an HTTP header and are not in the prompt, and `match_knowledge`
 * doesn't return `source_url` at all. You can't extract what was never sent.
 * This function catches whatever still managed to come out.
 */
export function scrubAnswer(text: string): { clean: string; hits: string[] } {
  const hits: string[] = [];
  let clean = text;

  // A web address. Tim should say "באתר הרשמי" ("on the official site"), and never quote a URL.
  clean = clean.replace(/https?:\/\/\S+|\b[a-z0-9-]+\.(com|org|net|co\.il)\/\S*/gi, () => {
    hits.push("url");
    return "באתר הרשמי";
  });

  // Anything that looks like a key. It shouldn't exist in the context — and if it shows up, it doesn't go out.
  clean = clean.replace(
    /AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb_(secret|publishable)_[A-Za-z0-9]{16,}/g,
    () => {
      hits.push("key");
      return "";
    },
  );

  return { clean, hits };
}
