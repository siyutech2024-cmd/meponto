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

// Parse "HH:MM" (or "HH") into minutes-of-day. Falls back to `def`.
function hmToMin(s, def) {
  if (s == null || s === "") return def;
  const m = String(s).trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return def;
  return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
}

const cfg = {
  ingestUrl: process.env.MEPONTO_INGEST_URL,
  ingestToken: process.env.MEPONTO_INGEST_TOKEN || "",
  profileDir: process.env.PROFILE_DIR || "./.eastwind-profile",
  cityId: process.env.CITY_ID || "55000199",
  intervalMin: Number(process.env.INTERVAL_MIN || 5),
  shiftStartMin: hmToMin(process.env.SHIFT_START, 0),     // e.g. "10:30"
  shiftEndMin: hmToMin(process.env.SHIFT_END, 24 * 60),   // e.g. "22:30"
  tz: process.env.TZ || "America/Sao_Paulo",
  headless: process.env.HEADLESS !== "false",
  alertWebhook: process.env.ALERT_WEBHOOK_URL || "", // Slack/Discord/Zapier incoming webhook
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

// Throttled alert to a generic webhook. Sends Slack- and Discord-compatible
// payloads. Re-alerts for the same key at most once per hour to avoid spam.
const _alertedAt = new Map();
async function alert(key, text) {
  log("ALERT:", text);
  if (!cfg.alertWebhook) return;
  const last = _alertedAt.get(key) || 0;
  if (Date.now() - last < 60 * 60 * 1000) return; // once per hour per key
  _alertedAt.set(key, Date.now());
  const msg = `[Eastwind scraper] ${text}`;
  try {
    await fetch(cfg.alertWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg, content: msg }),
    });
  } catch (e) {
    log("alert webhook failed:", e.message);
  }
}

function inShiftWindow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour").value) % 24;
  const mi = Number(parts.find((p) => p.type === "minute").value);
  const cur = h * 60 + mi;
  if (cfg.shiftStartMin <= cfg.shiftEndMin) return cur >= cfg.shiftStartMin && cur < cfg.shiftEndMin;
  return cur >= cfg.shiftStartMin || cur < cfg.shiftEndMin; // window wraps midnight
}

async function pull(ctx) {
  if (!inShiftWindow()) {
    log("outside shift window — skip");
    return;
  }
  const capturedAt = new Date().toISOString();
  const page = await ctx.newPage();

  // Capture gateway responses fired by the rider board. Track every gateway
  // api name seen this round so we can tell "page didn't load" from "auth issue".
  const caps = {};
  const seenApis = new Set();
  page.on("response", async (r) => {
    const u = r.url();
    if (!u.includes("/gateway")) return;
    const m = u.match(/[?&]api=([^&]+)/);
    const api = m ? decodeURIComponent(m[1]) : "";
    if (api) seenApis.add(api);
    if (api === RIDER_LIST_API || api === KPI_API) {
      try { caps[api] = await r.json(); } catch { /* non-json */ }
    }
  });

  try {
    await page.goto(RIDERS_URL, { waitUntil: "domcontentloaded" });
    if (!page.url().includes("/monitor/")) {
      await alert("login", "LOGIN_REQUIRED — session expired. Re-copy .eastwind-profile (run login.mjs on a desktop, then redeploy).");
      return;
    }
    // Wait explicitly for the rider list response (cold start / slow networks
    // can take much longer than a fixed delay). Then a short settle for KPI.
    await page
      .waitForResponse((r) => r.url().includes(RIDER_LIST_API), { timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(2500);

    const riderList = caps[RIDER_LIST_API] ?? null;
    const kpi = caps[KPI_API] ?? null;
    if (!riderList && !kpi) {
      // Diagnostics: what is the page actually showing?
      let diag = "";
      try {
        const url = page.url();
        const title = await page.title().catch(() => "");
        const bodyText = (await page.evaluate(() => document.body?.innerText || "").catch(() => "")).replace(/\s+/g, " ").slice(0, 220);
        diag = ` | url=${url} | title=${title} | body="${bodyText}"`;
        await page.screenshot({ path: "debug-last.png", fullPage: false }).catch(() => {});
      } catch { /* ignore */ }
      await alert("empty", `nothing captured (gateway APIs seen: ${[...seenApis].join(", ") || "none"})${diag}`);
      return;
    }

    const res = await fetch(cfg.ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-token": cfg.ingestToken },
      body: JSON.stringify({ capturedAt, cityId: cfg.cityId, riderList, kpi }),
    });
    const txt = await res.text();
    log(`ingest ${res.status}: ${txt.slice(0, 300)}`);
    if (!res.ok) await alert("ingest", `ingest failed HTTP ${res.status}: ${txt.slice(0, 200)}`);
    else _alertedAt.delete("login"); // healthy round clears the login alert throttle
  } finally {
    await page.close();
  }
}

async function main() {
  if (!cfg.ingestUrl) {
    console.error("MEPONTO_INGEST_URL is required");
    process.exit(1);
  }
  log("starting scraper", {
    interval: cfg.intervalMin,
    shift: `${process.env.SHIFT_START || "00:00"}-${process.env.SHIFT_END || "24:00"}`,
    tz: cfg.tz,
  });
  const ctx = await chromium.launchPersistentContext(cfg.profileDir, {
    headless: cfg.headless,
    viewport: { width: 1440, height: 900 },
  });

  await pull(ctx).catch((e) => log("pull error:", e.message));
  setInterval(() => pull(ctx).catch((e) => log("pull error:", e.message)), cfg.intervalMin * 60 * 1000);
}

main();
