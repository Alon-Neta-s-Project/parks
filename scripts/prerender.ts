/**
 * Pre-render every content page to real HTML at build time.
 *
 * Content pages have to arrive as full HTML, not an empty shell a script fills
 * in — that is the whole SEO channel, and it is also what makes a page readable
 * before any JavaScript runs. This walks every route and writes a static file
 * per page, each carrying its own title, description and canonical link.
 *
 * The pages are static data, so pre-rendering is enough; there is nothing here
 * that has to be rendered per request.
 *
 * Run after `vite build`: npx tsx scripts/prerender.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { P } from "./paths";
import experiences from "../apps/web/src/data/experiences.json";
import parks from "../apps/web/src/data/parks.json";

const DIST = P.DIST;

const shell = readFileSync(join(DIST, "index.html"), "utf8");
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Page { path: string; title: string; description: string; heading: string; body: string }

const pages: Page[] = [];

pages.push({
  path: "index-home",
  title: "מדריך הפארקים באורלנדו",
  description: `${experiences.length} מתקנים והופעות בעשרה פארקים, עם ציון מפורש של מה שאין לנו.`,
  heading: "מדריך הפארקים באורלנדו",
  body: parks.map((p) => `<li><a href="#/park/${encodeURIComponent(p.name)}">${esc(p.name)}</a> — ${p.count}</li>`).join(""),
});

for (const p of parks) {
  const rows = experiences.filter((e) => e.park === p.name);
  pages.push({
    path: `park/${p.slug}`,
    title: `${p.name} — מדריך הפארקים`,
    description: `${p.count} מתקנים והופעות ב-${p.name}, מתוכם ${p.rated} עם דירוג עוצמה.`,
    heading: p.name,
    body: rows.map((e) => `<li><a href="#/experience/${e.id}">${esc(e.nameEn)}</a> — ${esc(e.land)}</li>`).join(""),
  });
}

for (const e of experiences) {
  const facts = [
    `<dt>פארק</dt><dd>${esc(e.park)}</dd>`,
    `<dt>אזור</dt><dd>${esc(e.land)}</dd>`,
    `<dt>סוג</dt><dd>${esc(e.subtype)}</dd>`,
    `<dt>עוצמה</dt><dd>${e.intensity.rated ? `${e.intensity.value} מתוך 4` : "אין דירוג"}</dd>`,
    `<dt>מגבלת גובה</dt><dd>${
      e.heightRequirementCm === null ? "אין נתון"
        : e.heightRequirementCm === 0 ? "אין מגבלת גובה"
        : `${e.heightRequirementCm} ס"מ`
    }</dd>`,
    `<dt>כניסה נדרשת</dt><dd>${esc(e.admission)}</dd>`,
    `<dt>דילוג בתור</dt><dd>${esc(e.fastAccess.summary)}</dd>`,
    `<dt>המידע נבדק</dt><dd>${e.lastVerified}</dd>`,
  ].join("");
  pages.push({
    path: `experience/${e.id}`,
    title: `${e.nameEn} — ${e.park}`,
    description: `${e.nameEn} ב-${e.park}. ${e.intensity.rated ? `עוצמה ${e.intensity.value} מתוך 4.` : "אין דירוג עוצמה."} המידע נבדק ב-${e.lastVerified}.`,
    heading: e.nameEn,
    body: `<dl>${facts}</dl>`,
  });
}

for (const page of pages) {
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<link rel="alternate" hreflang="he" href="/${page.path}">`,
  ].join("\n    ");

  // The rendered content sits inside #root and is replaced when the app mounts.
  // Before that — and with scripting off entirely — the page is still readable.
  const html = shell
    .replace(/<title>.*?<\/title>/, head)
    .replace(
      '<div id="root"></div>',
      `<div id="root"><main><h1>${esc(page.heading)}</h1>${page.body}</main></div>`,
    );

  const out = join(DIST, page.path === "index-home" ? "." : page.path, "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

const urls = pages
  .map((p) => `  <url><loc>/${p.path === "index-home" ? "" : p.path}</loc></url>`)
  .join("\n");
writeFileSync(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);

console.log(`pre-rendered ${pages.length} pages + sitemap.xml`);
