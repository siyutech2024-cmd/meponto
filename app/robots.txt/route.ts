/**
 * Host-aware robots.txt.
 * Public marketing hosts (meponto.com, mall) welcome every crawler — classic
 * search bots AND AI/answer-engine bots (GEO). Operational portal hosts
 * (sys/franchise/ponto/app) are private and fully disallowed.
 */

const PUBLIC_HOSTS = new Set(["meponto.com", "www.meponto.com", "mall.meponto.com"]);

const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "meta-externalagent",
];

export function GET(request: Request) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();

  const body = PUBLIC_HOSTS.has(host)
    ? [
        "User-agent: *",
        "Allow: /",
        "",
        ...AI_BOTS.flatMap((bot) => [`User-agent: ${bot}`, "Allow: /", ""]),
        "Sitemap: https://meponto.com/sitemap.xml",
        "",
      ].join("\n")
    : "User-agent: *\nDisallow: /\n";

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
