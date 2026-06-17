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

import "./load-env.mjs";
import { chromium } from "playwright";

const RIDERS_URL = "https://eastwind.99app.com/monitor/riders/list";
const RIDER_LIST_API = "vendor.rider.monitor.riderList";          // the rider list
const KPI_API = "vendor.rider.monitor.vendorFeatureInShift";      // header KPIs

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

async function pull(ctx) {
  if (!inShiftWindow()) {
    log("outside shift window — skip");
    return;
  }
  const capturedAt = new Date().toISOString();
  const page = await ctx.newPage();

  // Capture both gateway responses fired by the rider board in one page load.
  const caps = {};
  page.on("response", async (r) => {
    const u = r.url();
    if (!u.includes("/gateway")) return;
    const m = u.match(/[?&]api=([^&]+)/);
    const api = m ? decodeURIComponent(m[1]) : "";
    if (api === RIDER_LIST_API || api === KPI_API) {
      try { caps[api] = await r.json(); } catch { /* non-json */ }
    }
  });

  try {
    await page.goto(RIDERS_URL, { waitUntil: "domcontentloaded" });
    if (!page.url().includes("/monitor/")) {
      log("LOGIN_REQUIRED — session expired, re-run login.mjs (hook alerting here)");
      return;
    }
    await page.waitForTimeout(6000); // let riderList + KPI fire

    const riderList = caps[RIDER_LIST_API] ?? null;
    const kpi = caps[KPI_API] ?? null;
    if (!riderList && !kpi) {
      log("nothing captured this round");
      return;
    }

    const res = await fetch(cfg.ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-token": cfg.ingestToken },
      body: JSON.stringify({ capturedAt, cityId: cfg.cityId, riderList, kpi }),
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
