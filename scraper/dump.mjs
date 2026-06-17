/**
 * One-off: capture ALL gateway responses on the rider board so we can find
 * which API returns the rider list (vendorFeatureInShift only returns the KPI
 * header). Writes sample-gateway.json (gitignored, local only).
 *
 *   node dump.mjs      (stop `npm start` first — the profile is locked while
 *                       the scraper is running)
 */
import "./load-env.mjs";
import { chromium } from "playwright";
import fs from "node:fs";

const RIDERS_URL = "https://eastwind.99app.com/monitor/riders/list";

const ctx = await chromium.launchPersistentContext(process.env.PROFILE_DIR || "./.eastwind-profile", {
  headless: true,
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const captured = {};
page.on("response", async (r) => {
  const u = r.url();
  if (!u.includes("/gateway")) return;
  const m = u.match(/[?&]api=([^&]+)/);
  const api = m ? decodeURIComponent(m[1]) : "unknown";
  try {
    captured[api] = await r.json();
  } catch (e) {
    /* non-json */
  }
});

await page.goto(RIDERS_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000); // let all XHRs fire

fs.writeFileSync("sample-gateway.json", JSON.stringify(captured, null, 2));
console.log("captured gateway APIs:", Object.keys(captured));
console.log("wrote sample-gateway.json");

await ctx.close();
