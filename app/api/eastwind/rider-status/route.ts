import { jsonResponse } from "../../../lib/server/memory";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import {
  parseRiders,
  parseDeliveries,
  alignToMinute,
  type DeliveryRow,
} from "../../../lib/eastwind";

/**
 * Ingest endpoint for the Eastwind (99Food) real-time monitor scraper.
 *
 *   POST /api/eastwind/rider-status
 *   Header: x-ingest-token: <EASTWIND_INGEST_TOKEN>   (or Authorization: Bearer)
 *   Body:   { capturedAt: ISO, cityId?, riders?: <raw>, delivery?: <raw> }
 *
 * - riders  → rider_status_snapshots (+ rider_kpi_snapshots) as a batch snapshot
 *             (delete-then-insert per captured_at batch for idempotency)
 * - delivery → eastwind_deliveries upserted by order_no (timeline progresses)
 *
 * The raw JSON is always stored so the field mapping in app/lib/eastwind.ts can
 * be corrected later without re-scraping. Service-role writes only.
 */

const DEFAULT_CITY = "55000199";

/**
 * Two realtime scrapers feed this endpoint (two VPSes, two Eastwind accounts):
 *  - EASTWIND_INGEST_TOKEN      → source "main" (the original all-riders board)
 *  - EASTWIND_INGEST_TOKEN_PRO  → source "pro"  (the PRO-pool monitoring VPS)
 * The SOURCE comes from which token matched — scrapers need zero code changes,
 * the new VPS just uses the PRO token in its .env. Batches are delete-then-
 * insert scoped to (captured_at, source), so the two feeds never wipe each
 * other. Returns the resolved source, or null when unauthorized.
 */
function resolveSource(request: Request): "main" | "pro" | null {
  const main = process.env.EASTWIND_INGEST_TOKEN;
  const pro = process.env.EASTWIND_INGEST_TOKEN_PRO;
  if (!main && !pro) return "main"; // unset → open (local/dev)
  const token =
    request.headers.get("x-ingest-token") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (pro && token === pro) return "pro";
  if (main && token === main) return "main";
  return null;
}

export async function POST(request: Request) {
  const source = resolveSource(request);
  if (!source) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    capturedAt?: string;
    cityId?: string;
    riderList?: unknown; // vendor.rider.monitor.riderList payload
    kpi?: unknown;       // vendor.rider.monitor.vendorFeatureInShift payload
    riderFeatures?: Record<string, unknown>; // per-rider detail responses keyed by riderID
    delivery?: unknown;  // optional (waybill board, currently disabled)
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const capturedAt = body.capturedAt ?? new Date().toISOString();
  const cityId = body.cityId ?? DEFAULT_CITY;
  const client = getSupabaseServerClient();

  const result: Record<string, unknown> = { capturedAt: alignToMinute(capturedAt) };

  // --- riders → snapshots + kpi -------------------------------------------
  if (body.riderList != null || body.kpi != null) {
    const { snapshots, kpi } = parseRiders(body.riderList, body.kpi, capturedAt, cityId, body.riderFeatures ?? null);
    const batch = alignToMinute(capturedAt);

    // Idempotent batch PER SOURCE: only this feed's prior rows for the batch
    // are replaced — the other VPS's rows in the same 5-min bucket survive.
    await client.from("rider_status_snapshots").delete().eq("captured_at", batch).eq("source", source);
    if (snapshots.length) {
      const { error } = await client.from("rider_status_snapshots").insert(snapshots.map((s) => ({ ...s, source })));
      if (error) return jsonResponse({ error: `rider_status_snapshots: ${error.message}` }, { status: 500 });
    }

    await client.from("rider_kpi_snapshots").delete().eq("captured_at", batch).eq("source", source);
    const { error: kErr } = await client.from("rider_kpi_snapshots").insert({ ...kpi, source });
    if (kErr) return jsonResponse({ error: `rider_kpi_snapshots: ${kErr.message}` }, { status: 500 });

    result.ridersInserted = snapshots.length;
    result.kpiCaptured = true;
    result.source = source;
  }

  // --- delivery → upsert by order_no (waybill board; disabled for now) -----
  if (body.delivery != null) {
    const rows = parseDeliveries(body.delivery, cityId, capturedAt);
    const now = new Date().toISOString();
    // first_seen_at is intentionally omitted so existing rows keep their value;
    // new rows fall back to the column default (now()).
    const upsertRows = rows.map((r: DeliveryRow) => ({ ...r, last_seen_at: now, updated_at: now }));
    if (upsertRows.length) {
      const { error } = await client
        .from("eastwind_deliveries")
        .upsert(upsertRows, { onConflict: "order_no" });
      if (error) return jsonResponse({ error: `eastwind_deliveries: ${error.message}` }, { status: 500 });
    }
    result.deliveriesUpserted = upsertRows.length;
  }

  return jsonResponse({ data: result });
}

// Lightweight health/info for manual checks.
export function GET() {
  return jsonResponse({
    data: {
      endpoint: "POST /api/eastwind/rider-status",
      expects: { capturedAt: "ISO", cityId: "optional", riders: "raw JSON", delivery: "raw JSON" },
      tables: ["rider_status_snapshots", "rider_kpi_snapshots", "eastwind_deliveries"],
      authHeader: "x-ingest-token",
    },
  });
}
