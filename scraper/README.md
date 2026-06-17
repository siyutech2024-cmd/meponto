# Eastwind real-time monitor scraper

Logged-in Playwright worker that captures the 99Food Eastwind monitor data
(rider board + waybill board) every 5 minutes and forwards it to MePonto.

Why a real browser: the gateway requests are signed per-request by the page's
own anti-bot JS (`wsgsig` / `secdd-*`) and cannot be replayed server-side. The
scraper lets the page sign its own requests and only reads the JSON responses.
See `../docs/eastwind-realtime-sync-plan.md`.

## Setup

```bash
cd scraper
npm install
npx playwright install chromium
cp .env.example .env      # then edit MEPONTO_INGEST_URL + MEPONTO_INGEST_TOKEN
```

## 1. Log in once (interactive)

```bash
node login.mjs
```

A browser opens. Sign in by hand, wait until the rider board is visible, then
press Enter in the terminal. The session is saved into `./.eastwind-profile`.

> Log in manually. Never let automation type the password.

## 2. Run the scraper

```bash
npm start
```

It pulls immediately, then every `INTERVAL_MIN` minutes inside the shift window.
Each round POSTs `{ capturedAt, cityId, riders, delivery }` (raw gateway JSON)
to `MEPONTO_INGEST_URL`.

## Server side (MePonto)

- Migration: `supabase/migrations/20260617120000_eastwind_realtime_status.sql`
- Endpoint: `app/api/eastwind/rider-status/route.ts`
- Parser: `app/lib/eastwind.ts` (tolerant; raw JSON always stored)
- Set `EASTWIND_INGEST_TOKEN` in the server env to match `MEPONTO_INGEST_TOKEN`.

## Field mapping note

Field names in the gateway JSON were not observable during design, so the parser
resolves each column against candidate key lists and always stores `raw`. After
the first live run, query rows where typed columns are null, inspect `raw`, and
add the real keys to the candidate lists in `app/lib/eastwind.ts`.

## Deployment

Run on an always-on host (small VPS or container). The repo `Dockerfile` is for
the Next.js app; this worker is separate — a tiny `node:20-slim` + Playwright
image with a cron-like always-on process is enough. Keep it single-session and
at the 5-minute interval to stay well clear of rate/anti-bot limits.

## Login expiry

When the session expires the log prints `LOGIN_REQUIRED`; re-run `node login.mjs`.
Hook your alerting (email/SMS) at that log line — MePonto already has SendGrid.
