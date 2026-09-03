/**
 * Every URL worth telling a crawler about, and the single source for
 * `/sitemap.xml` and `/robots.txt`.
 *
 * An agent handed only the domain has to guess; these two files plus
 * `/llm.txt` are what it checks first.
 */
export const PAGES: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "monthly", priority: "1.0" },
  { path: "/docs", changefreq: "weekly", priority: "0.9" },
  { path: "/llm.txt", changefreq: "weekly", priority: "0.9" },
  { path: "/console", changefreq: "monthly", priority: "0.5" },
];

export const sitemap = (origin: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(
  ({ path, changefreq, priority }) =>
    `  <url>
    <loc>${origin}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
).join("\n")}
</urlset>
`;

export const robots = (origin: string) =>
  `User-agent: *
Allow: /

# The manual, as plain text: what proxycroc is and every route it serves.
# Agents should start there.
# ${origin}/llm.txt

Sitemap: ${origin}/sitemap.xml
`;
