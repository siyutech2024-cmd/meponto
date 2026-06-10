import { smokeChecks } from "./smoke-manifest.mjs";

const baseUrl = process.env.PONTOSYS_BASE_URL ?? "http://localhost:3000";
const portalAccounts = {
  pontosys: { identifier: "hq@meponto.com", password: "pontosys-hq" },
  franchise: { identifier: "franchise@meponto.com", password: "franquia-demo" },
  ponto: { identifier: "ponto@meponto.com", password: "ponto-demo" },
  rider: { identifier: "rider@meponto.com", password: "rider-demo" },
  pontomall: { identifier: "mall@meponto.com", password: "pontomall-demo" },
  partner: { identifier: "partner@meponto.com", password: "partner-demo" },
  supplier: { identifier: "supplier@meponto.com", password: "supplier-demo" },
};
const portalCookies = new Map();

function getGroup(path) {
  return path.startsWith("/api/") ? "api" : "page";
}

function portalForCheck(path) {
  if (path.startsWith("/login") || path === "/reset-password" || path.startsWith("/api/auth/")) return null;
  if (path === "/franchise-admin") return "franchise";
  if (path === "/ponto-admin" || path === "/incidents" || path === "/chat") return "ponto";
  if (path === "/app" || path === "/rider-app" || path === "/rewards") return "rider";
  if (path === "/pontomall" || path === "/marketplace" || path === "/points-economy" || path === "/partner-points" || path === "/crm") return "pontomall";
  if (path === "/partner-app") return "partner";
  if (path === "/supplier-admin") return "supplier";
  return "pontosys";
}

async function cookieForPortal(portal) {
  if (!portal) return undefined;
  if (portalCookies.has(portal)) return portalCookies.get(portal);
  const account = portalAccounts[portal];
  const response = await fetch(new URL("/api/auth/login", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...account, portal }),
  });
  if (!response.ok) throw new Error(`Could not authenticate ${portal}: ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`Authentication for ${portal} did not return a session cookie`);
  portalCookies.set(portal, cookie);
  return cookie;
}

async function runCheck({ path, text, method = "GET", body: requestBody, headers = {}, expectedStatus, portal }) {
  const url = new URL(path, baseUrl);
  const cookie = await cookieForPortal(portal ?? portalForCheck(path));
  const requestHeaders = {
    ...headers,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(requestBody ? { "Content-Type": "application/json" } : {}),
  };
  const response = await fetch(url, {
    method,
    headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
    body: requestBody ? JSON.stringify(requestBody) : undefined,
  });
  const responseBody = await response.text();
  const statusMatches = expectedStatus === undefined ? response.ok : response.status === expectedStatus;
  if (!statusMatches) {
    const expected = expectedStatus === undefined ? "2xx" : expectedStatus;
    throw new Error(`${path} returned ${response.status}; expected ${expected}`);
  }
  if (!responseBody.includes(text)) {
    throw new Error(`${path} did not include expected text: ${text}`);
  }
  return { group: getGroup(path), path, status: response.status, method };
}

const results = [];

for (const check of smokeChecks) {
  results.push(await runCheck(check));
}

for (const result of results) {
  console.log(`ok ${result.status} ${result.method} ${result.group} ${result.path}`);
}

console.log(`Smoke checks passed: ${results.length}`);
