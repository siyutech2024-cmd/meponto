import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep `web-push` as an external server package so Next's output file tracing
  // copies it into the serverless function. The push route imports it at
  // runtime; without this the import fails on Vercel with
  // "Push indisponível: dependência web-push não instalada".
  serverExternalPackages: ["web-push"],
};

export default nextConfig;
