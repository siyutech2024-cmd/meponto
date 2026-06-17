/**
 * Eastwind (99Food) real-time monitor scraper.
 *
 * Runs a real, logged-in Chromium (persistent profile) so the page generates
 * the anti-bot signatures (wsgsig / secdd-*) itself. Every INTERVAL minutes,
 * during the configured shift window, it loads the two monitor pages, captures
 * the gateway JSON responses, and POSTs them to the MePonto ingest endpoint.
 *
 * Why a real browser: the gateway requests are signed per-request by obfuscated
 * page JS; they cannot be replayed server-side. See docs/eastwind-realtime-sync-plan.md.
 *
 * First run: `node login.mjs` to sign in once (saves the session into the
 * persistent profile). After that this script reuses the session until it
 * expires, at which point it logs LOGIN_REQUIRED (hook your alerting there).
 *
 * Env (see .env.example):
 *   MEPONTO_INGEST_URL    e.g. https://sys.meponto.com/api/eastwind/rider-status
 *   MEPONTO_INGEST_TOKEN  shared secret (matches EASTWIND_INGEST_TOKEN on the server)
 *   PROFILE_DIR           persistent browser profile dir (default ./.eastwind-profile)
 *   CITY_ID               default 55000199
 *   INTERVAL_MIN          default 5
 *   SHIFT_START / SHIFT_END  local hours, default 0 / 24 (all day)
 *   TZ                    default America/Sao_Paulo
 *   HEADLESS              "false" to watch it (default true)
 */

import { chromium } from "playwright";

const RIDERS_URL = "https://eastwind.99app.com/monitor/riders/list";
const WAYBILL_URL = "https://eastwind.99app.com/monitor/waybill/list";
const RIDERS_API = "vendorFeatureInShift";
const DELIVERY_API = "vendor.rider.monitor.delivery";

const cfg = {
  ingestUrl: process.env.MEPONTO_INGEST_URL,
  ingestToken: process.env.MEPONTO_INGEST_TOKEN || "",
  profileDir: process.env.PROFILE_DIR || "./.eastwind-profile",
  cityId: process.env.CITY_ID || "55000199",
  intervalMin: Number(process.env.INTERVAL_MIN || 5),
  shiftStart: Number(process.env.SHIFT_START || 0),
  shiftEnd: Number(process.env.SHIFT_END || 24),
  tz: process.env.TZ || "America/Sao_Paulo",
  headless: process.env.HEADLESS !== "false",
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

function inShiftWindow() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: cfg.tz, hour: "2-digit", hour12: false }).format(new Date()),
  );
  if (cfg.shiftStart <= cfg.shiftEnd) return hour >= cfg.shiftStart && hour < cfg.shiftEnd;
  return hour >= cfg.shiftStart || hour < cfg.shiftEnd; // window wraps midnight
}

/** Load a monitor page and return the parsed JSON of its gateway response. */
async function grab(page, url, apiNeedle) {
  const waitForResp = page.waitForResponse(
    (r) => r.url().includes(apiNeedle) && r.request().method() === "GET",
    { timeout: 30000 },
  );
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const resp = await waitForResp;
  if (resp.status() !== 200) throw new Error(`${apiNeedle} HTTP ${resp.status()}`);
  return resp.json();
}

async function pull(ctx) {
  if (!inShiftWindow()) {
    log("outside shift window — skip");
    return;
  }
  const capturedAt = new Date().toISOString();
  const page = await ctx.newPage();
  try {
    // Login check: if redirected away from the monitor, the session expired.
    await page.goto(RIDERS_URL, { waitUntil: "domcontentloaded" });
    if (!page.url().includes("/monitor/")) {
      log("LOGIN_REQUIRED — session expired, re-run login.mjs (hook alerting here)");
      return;
    }
    const riders = await grab(page, RIDERS_URL, RIDERS_API).catch((e) => {
      log("riders grab failed:", e.message);
      return null;
    });
    const delivery = await grab(page, WAYBILL_URL, DELIVERY_API).catch((e) => {
      log("delivery grab failed:", e.message);
      return null;
    });

    if (!riders && !delivery) {
      log("nothing captured this round");
      return;
    }

    const res = await fetch(cfg.ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-token": cfg.ingestToken },
      body: JSON.stringify({ capturedAt, cityId: cfg.cityId, riders, delivery }),
    });
    const txt = await res.text();
    log(`ingest ${res.status}: ${txt.slice(0, 300)}`);
  } finally {
    await page.close();
  }
}

async function main() {
  if (!cfg.ingestUrl) {
    console.error("MEPONTO_INGEST_URL is required");
    process.exit(1);
  }
  log("starting scraper", { interval: cfg.intervalMin, shift: [cfg.shiftStart, cfg.shiftEnd], tz: cfg.tz });
  const ctx = await chromium.launchPersistentContext(cfg.profileDir, {
    headless: cfg.headless,
    viewport: { width: 1440, height: 900 },
  });

  await pull(ctx).catch((e) => log("pull error:", e.message));
  setInterval(() => pull(ctx).catch((e) => log("pull error:", e.message)), cfg.intervalMin * 60 * 1000);
}

main();
