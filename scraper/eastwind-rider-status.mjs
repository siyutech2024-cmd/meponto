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
// Per-rider detail card ("Performance in Current Shift"). Fired only when a
// rider is clicked. Confirmed live 2026-07-03: vendor.rider.monitor.riderTarget.
// If Eastwind renames it, rounds log 0/N plus a "gateway apis seen" diagnostic —
// update the constant from that line.
const RIDER_TARGET_API = "vendor.rider.monitor.riderTarget";
const isDetailApi = (api) => api === RIDER_TARGET_API;

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
  /**
   * Multi-city rotation (2026-08-27). ONE OL account can serve several cities
   * — the board has a city picker. Configure as
   *   CITIES="São Paulo:55000199,São João da Boa Vista:<cityId>"
   * and each round scrapes them in order, uploading one batch per city with
   * its own cityId. Leave unset to keep the single-city behaviour.
   * The label must match the option text in the Eastwind city dropdown.
   */
  cities: (process.env.CITIES || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.lastIndexOf(":");
      return idx === -1 ? { label: entry, id: "" } : { label: entry.slice(0, idx).trim(), id: entry.slice(idx + 1).trim() };
    }),
  intervalMin: Number(process.env.INTERVAL_MIN || 5),
  shiftStartMin: hmToMin(process.env.SHIFT_START, 0),     // e.g. "10:30"
  shiftEndMin: hmToMin(process.env.SHIFT_END, 24 * 60),   // e.g. "22:30"
  tz: process.env.TZ || "America/Sao_Paulo",
  headless: process.env.HEADLESS !== "false",
  detailEnabled: process.env.DETAIL_ENABLED !== "false", // click riders for per-rider metrics
  detailMax: Number(process.env.DETAIL_MAX || 80),       // safety cap per round
  alertWebhook: process.env.ALERT_WEBHOOK_URL || "", // Slack/Discord/Zapier incoming webhook
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

// page.evaluate / page.title have NO timeout in Playwright: on a page stuck in
// a redirect loop (the didi pc-login bounce, 2026-09-03) they can pend forever
// and the whole round goes silent — 46 minutes of blank log before a human
// noticed. Every such call goes through here.
const bounded = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))]);
const LOGIN_URL_RE = /pc-login|\/common\/login|\/login(\b|\?|#)/i;
const loginMsg = (url) =>
  `LOGIN_REQUIRED — session expired (landed on ${String(url).slice(0, 90)}). Run scraper/relogin-OL老号.command (VNC).`;

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

// Pull [{id, name, phone}] out of the captured riderList JSON (shape-tolerant walk).
function riderPairs(payload) {
  const out = [];
  const seen = new Set();
  const walk = (node, depth) => {
    if (depth > 6 || node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) return node.forEach((x) => walk(x, depth + 1));
    const id = node.riderID ?? node.riderId ?? node.driverId;
    const name = node.riderName ?? node.name;
    if (id != null && name) {
      out.push({ id: String(id), name: String(name), phone: node.phoneNumber ? String(node.phoneNumber) : null });
    }
    for (const k of Object.keys(node)) walk(node[k], depth + 1);
  };
  walk(payload, 0);
  return out;
}

/**
 * Click each rider in the list so the page fires its per-rider detail API
 * (signed in-page — cannot be replayed server-side), and capture the response.
 * Returns { riderID: detailJson }. Failures skip the rider; the board data is
 * still ingested even if every click fails.
 */
async function captureRiderDetails(page, riderList) {
  const features = {};
  const riders = riderPairs(riderList).slice(0, cfg.detailMax);
  if (!riders.length) return features;
  const apiOf = (u) => {
    const m = u.match(/[?&]api=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  };
  const detailApisSeen = new Set();
  let captured = 0;
  let clickFails = 0;
  // Overall deadline: the click loop must never eat the whole interval —
  // partial details beat a wedged round.
  const deadline = Date.now() + 4 * 60_000;
  for (const { id, name, phone } of riders) {
    if (Date.now() > deadline) {
      log("detail capture deadline reached — keeping partial results");
      break;
    }
    // Arm the response wait BEFORE clicking; swallow its eventual rejection so
    // a failed click can't leave an unhandled promise rejection behind.
    const respP = page.waitForResponse((r) => isDetailApi(apiOf(r.url())), { timeout: 4000 });
    respP.catch(() => {});
    try {
      // Click target: phone number if visible (rendered untruncated in the
      // list), else the first two words of the name (long names are shown
      // ellipsized, so the full name never matches).
      const shortName = name.split(/\s+/).slice(0, 2).join(" ");
      const target = phone
        ? page.getByText(phone, { exact: false }).first()
        : page.getByText(shortName, { exact: false }).first();
      try {
        await target.click({ timeout: 2500 });
      } catch {
        if (!phone) { clickFails++; continue; }
        // phone not rendered on this layout — fall back to the name prefix
        try {
          await page.getByText(shortName, { exact: false }).first().click({ timeout: 2500 });
        } catch { clickFails++; continue; }
      }
      const resp = await respP;
      detailApisSeen.add(apiOf(resp.url()));
      features[id] = await resp.json();
      captured++;
      await page.keyboard.press("Escape").catch(() => {}); // close the card
      await page.waitForTimeout(200); // gentle pacing — avoid hammering the gateway
    } catch {
      /* detail api didn't fire for this rider — skip */
    }
  }
  log(
    `rider details captured: ${captured}/${riders.length}` +
      (clickFails ? ` (click failed: ${clickFails})` : "") +
      (detailApisSeen.size ? ` via [${[...detailApisSeen].join(", ")}]` : ""),
  );
  return features;
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

let pulling = false; // re-entrancy guard: a slow round must not overlap the next tick
let roundStartedAt = 0;
const ROUND_HANG_MS = 10 * 60_000; // watchdog: a round wedged past this is dead
async function pull(ctx, city = null, roundCapturedAt = null) {
  if (pulling) {
    // WATCHDOG (2026-08-22): a Playwright await can wedge forever, which used
    // to leave `pulling` stuck true and every later round skipped — the board
    // silently froze for hours. A hung round can't be untangled in-process;
    // exit and let pm2/systemd bring up a clean instance in seconds.
    if (Date.now() - roundStartedAt > ROUND_HANG_MS) {
      log("round hung >10min — exiting for a clean restart");
      process.exit(1);
    }
    log("previous round still running — skip");
    return;
  }
  if (!inShiftWindow()) {
    log("outside shift window — skip");
    return;
  }
  pulling = true;
  roundStartedAt = Date.now();
  // SAME BATCH KEY FOR THE WHOLE ROUND (2026-08-31): each city used to stamp
  // its own capture time, so a round produced one batch per city and the live
  // board — which reads only the latest batch per source — would flip-flop
  // between cities as soon as the new city has riders. All cities in a round
  // now share one capturedAt; the ingest scopes its delete by city_id, so the
  // cities coexist inside the batch instead of wiping each other.
  const capturedAt = roundCapturedAt ?? new Date().toISOString();
  const cityId = city?.id || cfg.cityId;
  let page;
  try {
    page = await ctx.newPage();
  } catch (e) {
    pulling = false; // newPage threw before the try/finally below — don't wedge every later round
    throw e;
  }

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
    if (!page.url().includes("/monitor/") || LOGIN_URL_RE.test(page.url())) {
      await alert("login", loginMsg(page.url()));
      return;
    }

    // ---- City switch (multi-city rotation) ---------------------------------
    // The board persists the selected city in localStorage and reads it on
    // load, so we set the ID and reload — no clicking, no text matching.
    //
    // ⚠ 2026-08-27 事故教训: 最初按城市名点下拉,结果抓取器会话是**中文界面**
    // ("圣保罗"/"圣若昂达博阿维斯塔"),按 "Sao Paulo" 永远匹配不上,两个城市
    // 全部跳过,连主号上传都断了 40 分钟。cityId 是稳定的,和界面语言无关。
    if (city?.id) {
      const key = "monitorRiderlistCityID";
      const already = await bounded(page.evaluate((k) => localStorage.getItem(k), key), 15_000, "read cityID");
      if (already !== String(city.id)) {
        await bounded(page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, String(city.id)]), 15_000, "write cityID");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForResponse((r) => r.url().includes(RIDER_LIST_API), { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2500);
      }
      // Verify against the REQUEST the board actually issued (cityID=<id> in
      // the gateway query) — never trust the click, trust the traffic.
      const usedCity = await bounded(page.evaluate(() => {
        const hit = performance.getEntriesByType("resource").map((e) => e.name).reverse().find((u) => u.includes("riderList") && u.includes("cityID="));
        return hit ? (hit.match(/[?&]cityID=(\d+)/) || [])[1] ?? "" : "";
      }), 15_000, "verify cityID");
      if (usedCity && usedCity !== String(city.id)) {
        log(`city switch failed: board still on cityID=${usedCity}, wanted ${city.id} — skipping`);
        await alert(`city:${city.label}`, `could not switch to ${city.label} (board on ${usedCity})`);
        return;
      }
      log(`city → ${city.label} (${city.id})`);
    }
    // Wait explicitly for the rider list response (cold start / slow networks
    // can take much longer than a fixed delay). Then a short settle for KPI.
    await page
      .waitForResponse((r) => r.url().includes(RIDER_LIST_API), { timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(2500);

    const riderList = caps[RIDER_LIST_API] ?? null;
    const kpi = caps[KPI_API] ?? null;
    // The board redirects to the didi login page CLIENT-SIDE, after
    // domcontentloaded — the first URL check above still sees /monitor/. Seen
    // 2026-09-03: every round reported "nothing captured" with url=pc-login
    // instead of LOGIN_REQUIRED, so nobody knew a re-login was due.
    if (!riderList && !kpi && LOGIN_URL_RE.test(page.url())) {
      await alert("login", loginMsg(page.url()));
      return;
    }
    if (!riderList && !kpi) {
      // Diagnostics: what is the page actually showing?
      let diag = "";
      try {
        const url = page.url();
        const title = await bounded(page.title(), 10_000, "title").catch(() => "");
        const bodyText = (await bounded(page.evaluate(() => document.body?.innerText || ""), 10_000, "body").catch(() => "")).replace(/\s+/g, " ").slice(0, 220);
        diag = ` | url=${url} | title=${title} | body="${bodyText}"`;
        await page.screenshot({ path: "debug-last.png", fullPage: false }).catch(() => {});
      } catch { /* ignore */ }
      await alert("empty", `nothing captured (gateway APIs seen: ${[...seenApis].join(", ") || "none"})${diag}`);
      return;
    }

    // Per-rider detail cards (AR/CAA/%TSH/declined/… per rider). Best-effort:
    // adds up to ~detailMax clicks per round, board ingest never depends on it.
    let riderFeatures = {};
    if (cfg.detailEnabled && riderList) {
      riderFeatures = await captureRiderDetails(page, riderList).catch(() => ({}));
      if (!Object.keys(riderFeatures).length) {
        // Diagnostic: which gateway apis DID fire this round (incl. during clicks)?
        log(`no rider details — gateway apis seen: [${[...seenApis].join(", ")}]`);
      }
    }

    const res = await fetch(cfg.ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-token": cfg.ingestToken },
      body: JSON.stringify({ capturedAt, cityId, riderList, kpi, riderFeatures }),
      // A hanging ingest request must not wedge the round forever.
      signal: AbortSignal.timeout(60_000),
    });
    const txt = await res.text();
    log(`ingest ${res.status} [${city?.label ?? "default"} / ${cityId}]: ${txt.slice(0, 300)}`);
    if (!res.ok) await alert("ingest", `ingest failed HTTP ${res.status}: ${txt.slice(0, 200)}`);
    else _alertedAt.delete("login"); // healthy round clears the login alert throttle
  } finally {
    pulling = false;
    await page.close().catch(() => {}); // a dead context must not mask the real error
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

  // One round = every configured city, in order, in the SAME session.
  // FAILURE ISOLATION (2026-08-27): each city is independent — one city that
  // can't be selected must never stop the others from uploading. The main
  // city is listed first, so it is always captured before any experimental
  // new-city work can go wrong.
  // A closed browser context is unrecoverable in-process (2026-08-31 outage:
  // the VPS rebooted, Chromium died mid-round, and the scraper sat silent for
  // 66 minutes until a human restarted it). Exit instead — pm2 brings up a
  // clean instance with a fresh browser in seconds, same policy as the hang
  // watchdog.
  const FATAL_RE = /has been closed|Target closed|browser closed|browserContext/i;
  const fatalCheck = (e, label) => {
    log(`pull error${label ? ` [${label}]` : ""}:`, e.message);
    if (FATAL_RE.test(String(e.message))) {
      log("browser context is dead — exiting for a clean pm2 restart");
      process.exit(1);
    }
  };
  // HARD LIMIT per city (2026-09-03): the in-round watchdog only fires when a
  // later tick runs pull() and finds `pulling` still true; an await that never
  // resolves inside a round kept the feed silent for 46 minutes. This timer is
  // independent of ticks: past the limit we exit and let pm2 bring up a fresh
  // browser. Budget: 4-min detail deadline + waits ≪ 7 min.
  const CITY_HARD_LIMIT_MS = 7 * 60_000;
  const withHardLimit = (p, label) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        log(`round exceeded ${CITY_HARD_LIMIT_MS / 60_000} min${label ? ` [${label}]` : ""} — exiting for a clean pm2 restart`);
        process.exit(1);
      }, CITY_HARD_LIMIT_MS);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  const round = async () => {
    const capturedAt = new Date().toISOString(); // one batch key for every city this round
    if (cfg.cities.length === 0) {
      await withHardLimit(pull(ctx, null, capturedAt), null).catch((e) => fatalCheck(e, null));
      return;
    }
    for (const city of cfg.cities) {
      await withHardLimit(pull(ctx, city, capturedAt), city.label).catch((e) => fatalCheck(e, city.label));
    }
  };

  await round();
  setInterval(() => void round(), cfg.intervalMin * 60 * 1000);
}

main();
