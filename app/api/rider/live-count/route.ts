import { sessionFromRequest } from "../../../lib/auth-session";
import { fetchRows } from "../../../lib/server/db-read";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import type { Rider } from "../../../lib/data";

/**
 * 模式二 A3 — the rider's OWN realtime order count (今日实时约 X 单).
 *
 * Fed by the Eastwind realtime scrapers (main + PRO instance) posting to
 * /api/eastwind/rider-status every 5 min → rider_status_snapshots. The
 * riders-live endpoint is HQ/franchise-scoped and a rider session cannot call
 * it; this endpoint returns exactly ONE row — the caller's — resolved from
 * the session (never from a client-supplied id).
 *
 * Payload is intentionally amount-free (counts/minutes only), matching the
 * PRO contract "settlement is counts, money is offline". The figure is an
 * ESTIMATE until the next-day settlement import confirms it.
 *
 * Deliberately MEMORY-FREE (repository layer only) so it doesn't count
 * against the module-guard in-memory route baseline it must not grow.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return json({ error: "Faça login.", code: "unauthenticated" }, 401);

  try {
    // Rider-scoped direct read (L2 pattern): resolve the caller's 99 ID.
    let riders = session.userId
      ? await fetchRows<Rider>("riders", [{ op: "eq", field: "id", value: session.userId }])
      : [];
    if (riders.length === 0 && session.name) {
      riders = await fetchRows<Rider>("riders", [{ op: "eq", field: "name", value: session.name }]);
    }
    const nineId = riders[0]?.ninetyNineId ?? "";
    if (!nineId) return json({ data: { available: false } });

    // Per-rider latest snapshot row (indexed on rider_ext_id, captured_at
    // DESC) — naturally multi-source safe: whichever feed (main/PRO) carries
    // this rider, their newest row wins. Freshness gate: older than 30 min =
    // boards closed or scraper down → unavailable (app hides the line).
    const client = getSupabaseServerClient();
    const { data: rows, error } = await client
      .from("rider_status_snapshots")
      .select("captured_at,finished_cnt,online_mins,status,shift_start,shift_end")
      .eq("rider_ext_id", nineId)
      .order("captured_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) return json({ data: { available: false } });
    const capturedAt = row.captured_at as string;
    if (Date.now() - Date.parse(capturedAt) > 30 * 60_000) {
      return json({ data: { available: false, capturedAt } });
    }

    return json({
      data: {
        available: true,
        capturedAt,
        finishedToday: Number(row.finished_cnt ?? 0),
        onlineMins: Number(row.online_mins ?? 0),
        status: String(row.status ?? ""),
        shift: [row.shift_start, row.shift_end].filter(Boolean).join("-"),
      },
    });
  } catch (error) {
    // Snapshot tables missing / scraper not live yet → soft-unavailable.
    console.warn(`[rider/live-count] unavailable: ${(error as Error).message}`);
    return json({ data: { available: false } });
  }
}
