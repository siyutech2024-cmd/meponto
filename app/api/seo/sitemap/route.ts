/**
 * Sitemap for the public MePonto surfaces. Cross-subdomain URLs are valid
 * here because Search Console ownership is verified at the DNS (domain)
 * level for meponto.com, which covers every subdomain.
 */

const LASTMOD = new Date().toISOString().slice(0, 10);

const URLS: Array<{ loc: string; priority: string; changefreq: string }> = [
  { loc: "https://www.meponto.com/", priority: "1.0", changefreq: "weekly" },
  { loc: "https://mall.meponto.com/", priority: "0.8", changefreq: "daily" },
  { loc: "https://app.meponto.com/rider-login", priority: "0.6", changefreq: "monthly" },
  { loc: "https://www.meponto.com/privacy", priority: "0.3", changefreq: "yearly" },
];

export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${URLS.map(
  (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
).join("\n")}
</urlset>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
