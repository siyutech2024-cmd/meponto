import { smokeChecks } from "./smoke-manifest.mjs";

const baseUrl = process.env.PONTOSYS_BASE_URL ?? "http://localhost:3000";

function getGroup(path) {
  return path.startsWith("/api/") ? "api" : "page";
}

async function runCheck({ path, text, method = "GET", body: requestBody, headers = {}, expectedStatus }) {
  const url = new URL(path, baseUrl);
  const requestHeaders = {
    ...headers,
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
