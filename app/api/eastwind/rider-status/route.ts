import { jsonResponse } from "../../../lib/server/memory";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import {
  parseRiders,
  parseDeliveries,
  alignToMinute,
  type DeliveryRow,
} from "../../../lib/eastwind";
import { withinZone } from "../../../lib/geo";
import { SJBV_ZONE_ID } from "../../../lib/regions";
import { HOT_ZONES } from "../../../rider-monitor/hot-zones";

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
/** São João da Boa Vista — the only city the leader-mode feed may report. */
const SJBV_CITY = "55000174";

type Source = "main" | "pro" | "sjbv";

/**
 * Realtime scrapers feeding this endpoint (one VPS, separate Eastwind accounts):
 *  - EASTWIND_INGEST_TOKEN       → source "main" (old OL, São Paulo board)
 *  - EASTWIND_INGEST_TOKEN_PRO   → source "pro"  (new OL / PRO pool — PAUSED 2026-10-26)
 *  - EASTWIND_INGEST_TOKEN_SJBV  → source "sjbv" (Boa Vista account, leader mode)
 * The SOURCE comes from which token matched. Batches are delete-then-insert
 * scoped to (captured_at, source, city_id), so the feeds never wipe each other.
 * Returns the authenticated source, or null when unauthorized.
 */
function resolveSource(request: Request): Source | null {
  const main = process.env.EASTWIND_INGEST_TOKEN;
  const pro = process.env.EASTWIND_INGEST_TOKEN_PRO;
  const sjbv = process.env.EASTWIND_INGEST_TOKEN_SJBV;
  if (!main && !pro && !sjbv) return "main"; // unset → open (local/dev)
  const token =
    request.headers.get("x-ingest-token") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (sjbv && token === sjbv) return "sjbv";
  if (pro && token === pro) return "pro";
  if (main && token === main) return "main";
  return null;
}

/**
 * 新OL 并入 Boa Vista(业务方 2026-10-26 定):PRO 池暂停,原 PRO 实例的位置改跑
 * Boa Vista 专用账号(组长模式)。该实例在 .env 写 SOURCE_ACCOUNT=sjbv,抓取器把它
 * 随 payload 上报为 `sourceAccount`。任何已认证的抓取器都可以**只**声明进 "sjbv"
 * 这一条道 —— 不能借此冒充 main/pro —— 这样不必等 Vercel 新增 token 就能上线;
 * 配了 EASTWIND_INGEST_TOKEN_SJBV 之后两种方式等价。
 * 关键点:sjbv 骑手**不**走 PRO 自动打标(那会把他们的金额全部清零)。
 */
function laneOf(authenticated: Source, declared: unknown): Source {
  return declared === "sjbv" ? "sjbv" : authenticated;
}

/**
 * Boa Vista zone filter (业务方 2026-10-26:"只抓取这个区域内的骑手")。
 *
 * The Boa Vista account's board also lists riders in neighbouring towns
 * (e.g. Águas da Prata). The sjbv feed keeps a rider only when:
 *   - their GPS is inside the Boa Vista hot area (+0.5 km margin — the zone is
 *     traced, not surveyed), OR the board gives no position for them, OR
 *   - they were already kept earlier TODAY — a delivery that briefly leaves
 *     the area must not cut a rider's day in half.
 * Affects NEW sjbv rows only: no stored row is read-modified or deleted
 * beyond this batch's own idempotent replace. Kill switch: SJBV_ZONE_FILTER=off.
 */
const SJBV_ZONE_MARGIN_KM = 0.5;
async function keepInsideBoaVista<T extends { rider_ext_id: string | null; lat: number | null; lng: number | null }>(
  client: ReturnType<typeof getSupabaseServerClient>,
  snapshots: T[],
): Promise<{ kept: T[]; dropped: number }> {
  const zone = HOT_ZONES.find((z) => z.id === SJBV_ZONE_ID);
  if (!zone || process.env.SJBV_ZONE_FILTER === "off") return { kept: snapshots, dropped: 0 };
  // Fail-open: a rider whose position is unknown can't be judged, so they are
  // kept — only riders the board PLACES outside the area are dropped. (A new
  // account whose payload carried no GPS would otherwise lose the whole board.)
  const noGps = (s: T) => s.lat == null || s.lng == null;
  const inside = (s: T) => noGps(s) || withinZone(s.lat, s.lng, zone.points, SJBV_ZONE_MARGIN_KM);
  const outsideIds = [...new Set(snapshots.filter((s) => !inside(s)).map((s) => s.rider_ext_id).filter((id): id is string => Boolean(id)))];
  const seenToday = new Set<string>();
  if (outsideIds.length) {
    const sp = new Date(Date.now() - 3 * 3600_000);
    const dayStart = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3)).toISOString();
    const { data } = await client
      .from("rider_status_snapshots")
      .select("rider_ext_id")
      .eq("source", "sjbv")
      .gte("captured_at", dayStart)
      .in("rider_ext_id", outsideIds)
      .limit(5000);
    for (const row of (data ?? []) as Array<{ rider_ext_id: string | null }>) if (row.rider_ext_id) seenToday.add(row.rider_ext_id);
  }
  const kept = snapshots.filter((s) => inside(s) || (s.rider_ext_id != null && seenToday.has(s.rider_ext_id)));
  return { kept, dropped: snapshots.length - kept.length };
}

export async function POST(request: Request) {
  const authSource = resolveSource(request);
  if (!authSource) {
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    capturedAt?: string;
    cityId?: string;
    sourceAccount?: string; // "sjbv" = Boa Vista leader-mode feed (see laneOf)
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

  const source = laneOf(authSource, body.sourceAccount);
  const capturedAt = body.capturedAt ?? new Date().toISOString();
  const cityId = body.cityId ?? (source === "sjbv" ? SJBV_CITY : DEFAULT_CITY);
  // The Boa Vista account must only ever write Boa Vista rows: if its board
  // drifted to another city, refuse rather than mix another city's riders
  // into the leader-mode feed (the scraper logs the 409 and alerts).
  if (source === "sjbv" && cityId !== SJBV_CITY) {
    return jsonResponse({ error: `sjbv feed only accepts cityId ${SJBV_CITY}, got ${cityId}` }, { status: 409 });
  }
  const client = getSupabaseServerClient();

  const result: Record<string, unknown> = { capturedAt: alignToMinute(capturedAt) };

  // --- riders → snapshots + kpi -------------------------------------------
  if (body.riderList != null || body.kpi != null) {
    const parsed = parseRiders(body.riderList, body.kpi, capturedAt, cityId, body.riderFeatures ?? null);
    const { kpi } = parsed;
    let snapshots = parsed.snapshots;
    if (source === "sjbv") {
      const { kept, dropped } = await keepInsideBoaVista(client, snapshots);
      snapshots = kept;
      result.outsideZoneDropped = dropped;
    }
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
      // Read by scraper/switch-to-boavista.command: the Boa Vista instance is
      // only started once production reports the "sjbv" lane — on older code
      // its PRO token would land the riders in the PRO pool.
      lanes: ["main", "pro", "sjbv"],
    },
  });
}
