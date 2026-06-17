import { jsonResponse } from "../../../lib/server/memory";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import {
  parseRiders,
  parseDeliveries,
  alignTo5Min,
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

function authorized(request: Request): boolean {
  const expected = process.env.EASTWIND_INGEST_TOKEN;
  if (!expected) return true; // unset → open (local/dev); set it in production
  const token =
    request.headers.get("x-ingest-token") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return token === expected;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    capturedAt?: string;
    cityId?: string;
    riders?: unknown;
    delivery?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const capturedAt = body.capturedAt ?? new Date().toISOString();
  const cityId = body.cityId ?? DEFAULT_CITY;
  const client = getSupabaseServerClient();

  const result: Record<string, unknown> = { capturedAt: alignTo5Min(capturedAt) };

  // --- riders → snapshots + kpi -------------------------------------------
  if (body.riders !== undefined && body.riders !== null) {
    const { snapshots, kpi } = parseRiders(body.riders, capturedAt, cityId);
    const batch = alignTo5Min(capturedAt);

    // Idempotent batch: remove any prior rows for this exact batch first.
    await client.from("rider_status_snapshots").delete().eq("captured_at", batch);
    if (snapshots.length) {
      const { error } = await client.from("rider_status_snapshots").insert(snapshots);
      if (error) return jsonResponse({ error: `rider_status_snapshots: ${error.message}` }, { status: 500 });
    }

    await client.from("rider_kpi_snapshots").delete().eq("captured_at", batch);
    const { error: kErr } = await client.from("rider_kpi_snapshots").insert(kpi);
    if (kErr) return jsonResponse({ error: `rider_kpi_snapshots: ${kErr.message}` }, { status: 500 });

    result.ridersInserted = snapshots.length;
    result.kpiCaptured = true;
  }

  // --- delivery → upsert by order_no --------------------------------------
  if (body.delivery !== undefined && body.delivery !== null) {
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
