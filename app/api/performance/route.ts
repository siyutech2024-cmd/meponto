import { appendServerAudit, jsonResponse, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { aggregateKpis, parseEastwindRiderKpis, type RiderDailyKpi } from "../../lib/performance";

const COLLECTIONS = ["riderDailyKpis", "riders"];

type Enriched = RiderDailyKpi & { franchise: string; station: string; riderId: string | null };

function enrich(rows: RiderDailyKpi[]): Enriched[] {
  return rows.map((row) => {
    const rider = memory.riders.find((item) => item.ninetyNineId && item.ninetyNineId === row.rider99Id);
    return {
      ...row,
      riderId: rider?.id ?? null,
      franchise: rider?.franchise ?? "未关联",
      station: rider?.ponto ?? "未关联",
    };
  });
}

export async function GET(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const franchise = url.searchParams.get("franchise");
  const station = url.searchParams.get("station");

  const dates = [...new Set(memory.riderDailyKpis.map((row) => row.date))].sort().reverse();
  const activeDate = date && dates.includes(date) ? date : dates[0] ?? null;

  let rows = enrich(memory.riderDailyKpis.filter((row) => !activeDate || row.date === activeDate));
  if (franchise) rows = rows.filter((row) => row.franchise === franchise);
  if (station) rows = rows.filter((row) => row.station === station);

  const groupBy = (field: "station" | "franchise") => {
    const map = new Map<string, Enriched[]>();
    for (const row of rows) {
      const key = row[field];
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()]
      .map(([key, group]) => ({ ...aggregateKpis(group, key), franchise: group[0].franchise }))
      .sort((a, b) => b.completedOrders - a.completedOrders);
  };

  return jsonResponse({
    data: {
      date: activeDate,
      dates,
      riders: rows.sort((a, b) => b.completedOrders - a.completedOrders),
      stations: groupBy("station"),
      franchises: groupBy("franchise"),
      total: aggregateKpis(rows, "total"),
    },
  });
}

type Body = { action: "import"; raw: string; date: string } | { action: "purgeDate"; date: string };

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  const actor = roleFromRequest(request);

  if (body.action === "import") {
    const date = String(body.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonResponse({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
    }
    const parsed = parseEastwindRiderKpis(String(body.raw ?? ""), date);
    if (parsed.length === 0) {
      return jsonResponse({ error: "未能解析任何骑手 KPI 行，请直接复制 Eastwind 骑手报表整页内容。" }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    for (const record of parsed) {
      const index = memory.riderDailyKpis.findIndex((row) => row.id === record.id);
      if (index === -1) {
        memory.riderDailyKpis.unshift(record);
        created += 1;
      } else {
        memory.riderDailyKpis[index] = record;
        updated += 1;
      }
      // Backfill rider profile KPI snapshot when the rider is linked.
      const riderIndex = memory.riders.findIndex((rider) => rider.ninetyNineId === record.rider99Id);
      if (riderIndex !== -1 && record.ar !== null) {
        memory.riders[riderIndex] = { ...memory.riders[riderIndex], ar: Math.round(record.ar) };
      }
    }

    appendServerAudit({
      actor,
      action: "KPI_IMPORTED",
      entity: "RiderDailyKpi",
      entityId: date,
      detail: `T+1 report for ${date}: ${created} created, ${updated} updated.`,
      risk: "Low",
    });

    return jsonResponse({ data: { created, updated, parsed: parsed.length } }, { status: 201 });
  }

  return jsonResponse({ error: "unknown action" }, { status: 400 });
}
