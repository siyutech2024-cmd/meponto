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

    // Idempotent batch PER (SOURCE, CITY): only this feed's prior rows for the
    // batch AND this city are replaced — the other VPS's rows survive, and,
    // since the multi-city scraper (2026-08-31) stamps every city of a round
    // with the SAME capturedAt, the cities coexist inside one batch instead of
    // the second city's POST wiping the first city's rows.
    await client.from("rider_status_snapshots").delete().eq("captured_at", batch).eq("source", source).eq("city_id", cityId);
    if (snapshots.length) {
      const { error } = await client.from("rider_status_snapshots").insert(snapshots.map((s) => ({ ...s, source })));
      if (error) return jsonResponse({ error: `rider_status_snapshots: ${error.message}` }, { status: 500 });
    }

    await client.from("rider_kpi_snapshots").delete().eq("captured_at", batch).eq("source", source).eq("city_id", cityId);
    const { error: kErr } = await client.from("rider_kpi_snapshots").insert({ ...kpi, source });
    if (kErr) return jsonResponse({ error: `rider_kpi_snapshots: ${kErr.message}` }, { status: 500 });

    result.ridersInserted = snapshots.length;
    result.kpiCaptured = true;
    result.source = source;

    // 模式二规则(业务方 2026-08-10 定):出现在新 Eastwind(PRO 账号)看板
    // 上的骑手 = PRO 骑手,档案 pool 自动置 'pro',不再人工维护。
    // DB 端定点 UPDATE(见迁移 20260810120000),幂等;失败不阻塞入库 ——
    // 实时快照是主产物,标记下一批(3 分钟)自然补上。
    if (source === "pro" && snapshots.length) {
      const extIds = [...new Set(snapshots.map((s) => s.rider_ext_id).filter(Boolean))] as string[];
      if (extIds.length) {
        const { data: tagged, error: tagErr } = await client.rpc("eastwind_autotag_pro", { p_ext_ids: extIds });
        if (tagErr) result.autoTagError = tagErr.message;
        else result.autoTaggedPro = tagged ?? 0;
      }
    }
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
