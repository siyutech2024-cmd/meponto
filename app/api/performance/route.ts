import { appendServerAudit, jsonResponse, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import {
  aggregateEarnings,
  aggregateKpis,
  parseEastwindRiderKpis,
  type RiderDailyEarning,
  type RiderDailyKpi,
} from "../../lib/performance";
import { defaultMallConfig, resolveTier } from "../../lib/mall";
import { getAvailablePoints } from "../../lib/points";

const COLLECTIONS = ["riderDailyKpis", "riderDailyEarnings", "riders", "mallConfigs", "pointsLedgerEntries"];

type Located = { franchise: string; station: string; riderId: string | null };
type Enriched = RiderDailyKpi & Located;
type EnrichedEarning = RiderDailyEarning & Located;

function locate(rider99Id: string): Located {
  const rider = memory.riders.find((item) => item.ninetyNineId && item.ninetyNineId === rider99Id);
  return {
    riderId: rider?.id ?? null,
    franchise: rider?.franchise ?? "未关联",
    station: rider?.ponto ?? "未关联",
  };
}

function enrich(rows: RiderDailyKpi[]): Enriched[] {
  return rows.map((row) => ({ ...row, ...locate(row.rider99Id) }));
}

const num = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Auto-credit mall points for completed orders on T+1 import.
 * Idempotent per rider per day (fixed ledger id), so re-importing the same
 * report updates instead of double-crediting. Tier multiplier applies.
 */
function creditOrderPoints(riderId: string, rider99Id: string, date: string, completedOrders: number) {
  const config = memory.mallConfigs.find((item) => item.id === "mall-config") ?? defaultMallConfig;
  const lifetime = memory.riderDailyKpis
    .filter((row) => row.rider99Id === rider99Id)
    .reduce((sum, row) => sum + (row.completedOrders ?? 0), 0);
  const tier = resolveTier(lifetime > 0 ? lifetime : null);
  const points = Math.round(completedOrders * config.perOrderPoints * tier.pointsMultiplier);
  if (points <= 0) return;

  // Referral reward (anti-fraud): the inviter is only paid once, and only
  // after the invited rider has VERIFIED completed orders in Eastwind data.
  if (lifetime === 0 && completedOrders > 0) {
    const rider = memory.riders.find((item) => item.id === riderId);
    const inviter = rider?.invitedBy ? memory.riders.find((item) => item.name === rider.invitedBy && item.id !== riderId) : undefined;
    const refId = `pts-ref-${riderId}`;
    if (inviter && !memory.pointsLedgerEntries.some((entry) => entry.id === refId)) {
      memory.pointsLedgerEntries.unshift({
        id: refId,
        riderId: inviter.id,
        accountId: `pts-${inviter.id}`,
        type: "earn",
        points: config.referralPoints,
        status: "approved",
        sourceType: "delivery",
        sourceId: refId,
        balanceAfter: getAvailablePoints(memory.pointsLedgerEntries, inviter.id) + config.referralPoints,
        reasonCode: "REFERRAL_REWARD",
        note: `Indicação confirmada: ${rider?.name ?? riderId} concluiu o primeiro pedido`,
        createdBy: "T+1 Import",
        createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      });
    }
  }

  const id = `pts-ord-${date}-${riderId}`;
  const note = `T+1 ${date} 完单 ${completedOrders} × ${config.perOrderPoints}分${tier.pointsMultiplier > 1 ? ` × ${tier.pointsMultiplier}（${tier.label}）` : ""}`;
  const index = memory.pointsLedgerEntries.findIndex((entry) => entry.id === id);
  if (index !== -1) {
    memory.pointsLedgerEntries[index] = { ...memory.pointsLedgerEntries[index], points, note };
    return;
  }
  memory.pointsLedgerEntries.unshift({
    id,
    riderId,
    accountId: `pts-${riderId}`,
    type: "earn",
    points,
    status: "approved",
    sourceType: "delivery",
    sourceId: `kpi-${date}`,
    balanceAfter: getAvailablePoints(memory.pointsLedgerEntries, riderId) + points,
    reasonCode: "ORDER_POINTS",
    note,
    createdBy: "T+1 Import",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  });
}

export async function GET(request: Request) {
  {
    const url0 = new URL(request.url);
    if (url0.searchParams.get("ranking") !== null) {
      // Lifetime completed-orders leaderboard (visible to riders).
      const forbidden = requirePermission(request, "use_rider_app");
      if (forbidden) return forbidden;
      await refreshCollectionsFromDatabase(COLLECTIONS);
      const byRider = new Map<string, number>();
      for (const row of memory.riderDailyKpis) {
        byRider.set(row.riderName, (byRider.get(row.riderName) ?? 0) + (row.completedOrders ?? 0));
      }
      const top = [...byRider.entries()]
        .map(([name, orders]) => ({ name, orders }))
        .sort((a, b) => b.orders - a.orders)
        .slice(0, 10);
      return jsonResponse({ data: { top } });
    }
  }
  {
    // Rider self-view: latest-day KPI for one rider (rider-app permission).
    const url = new URL(request.url);
    const mine = url.searchParams.get("mine");
    if (mine) {
      const forbidden = requirePermission(request, "use_rider_app");
      if (forbidden) return forbidden;
      await refreshCollectionsFromDatabase(COLLECTIONS);
      const rider = memory.riders.find((item) => item.name === mine);
      if (!rider?.ninetyNineId) return jsonResponse({ data: null });
      const rows = memory.riderDailyKpis.filter((row) => row.rider99Id === rider.ninetyNineId).sort((a, b) => b.date.localeCompare(a.date));
      const latest = rows[0];
      if (!latest) return jsonResponse({ data: null });
      return jsonResponse({ data: { date: latest.date, completedOrders: latest.completedOrders, tsh: latest.tsh, ar: latest.ar } });
    }
  }
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

  // Earnings for the same date + scope.
  const earningDates = [...new Set(memory.riderDailyEarnings.map((row) => row.date))].sort().reverse();
  const allDates = [...new Set([...dates, ...earningDates])].sort().reverse();
  const earningDate = date && allDates.includes(date) ? date : activeDate ?? earningDates[0] ?? null;
  let earningRows: EnrichedEarning[] = memory.riderDailyEarnings
    .filter((row) => !earningDate || row.date === earningDate)
    .map((row) => ({ ...row, ...locate(row.rider99Id) }));
  if (franchise) earningRows = earningRows.filter((row) => row.franchise === franchise);
  if (station) earningRows = earningRows.filter((row) => row.station === station);

  const groupEarnings = (field: "station" | "franchise") => {
    const map = new Map<string, EnrichedEarning[]>();
    for (const row of earningRows) map.set(row[field], [...(map.get(row[field]) ?? []), row]);
    return [...map.entries()]
      .map(([key, group]) => ({ ...aggregateEarnings(group, key), franchise: group[0].franchise }))
      .sort((a, b) => b.settleAmount - a.settleAmount);
  };

  // 30-day network trend (orders + settlement) for the chart.
  const trendDates = [...allDates].sort().slice(-30);
  const trend = trendDates.map((d) => ({
    date: d,
    orders: memory.riderDailyKpis.filter((row) => row.date === d).reduce((sum, row) => sum + (row.completedOrders ?? 0), 0),
    settle: Math.round(memory.riderDailyEarnings.filter((row) => row.date === d).reduce((sum, row) => sum + (row.settleAmount ?? 0), 0) * 100) / 100,
  }));

  return jsonResponse({
    data: {
      date: activeDate,
      dates: allDates,
      trend,
      riders: rows.sort((a, b) => b.completedOrders - a.completedOrders),
      stations: groupBy("station"),
      franchises: groupBy("franchise"),
      total: aggregateKpis(rows, "total"),
      earnings: {
        riders: earningRows.sort((a, b) => b.settleAmount - a.settleAmount),
        stations: groupEarnings("station"),
        franchises: groupEarnings("franchise"),
        total: aggregateEarnings(earningRows, "total"),
      },
    },
  });
}

type Body =
  | { action: "import"; raw: string; date: string }
  | { action: "importKpiRecords"; date: string; records: Array<Record<string, unknown>> }
  | { action: "importEarnings"; date: string; records: Array<Record<string, unknown>> }
  | { action: "purgeDate"; date: string };

async function handlePost(request: Request) {
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
      if (riderIndex !== -1) {
        if (record.ar !== null) {
          memory.riders[riderIndex] = { ...memory.riders[riderIndex], ar: Math.round(record.ar) };
        }
        creditOrderPoints(memory.riders[riderIndex].id, record.rider99Id, date, record.completedOrders);
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

  if (body.action === "importKpiRecords" || body.action === "importEarnings") {
    const date = String(body.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonResponse({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
    }
    const records = Array.isArray(body.records) ? body.records.slice(0, 500) : [];
    if (records.length === 0) return jsonResponse({ error: "records are required" }, { status: 400 });

    const importedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
    let created = 0;
    let updated = 0;

    if (body.action === "importKpiRecords") {
      for (const raw of records) {
        const rider99Id = String(raw.rider99Id ?? "").trim();
        if (!/^\d{6,}$/.test(rider99Id)) continue;
        const pct = (value: unknown) => {
          const text = String(value ?? "").replace(",", ".").replace("%", "").trim();
          if (!text || /^n\/?a$/i.test(text)) return null;
          const parsed = Number(text);
          return Number.isFinite(parsed) ? parsed : null;
        };
        const record: RiderDailyKpi = {
          id: `kpi-${date}-${rider99Id}`,
          date,
          rider99Id,
          riderName: String(raw.riderName ?? "").trim() || "Desconhecido",
          phone: String(raw.phone ?? "").trim(),
          cpf: String(raw.cpf ?? "").trim(),
          city: String(raw.city ?? "").trim(),
          onlineHours: num(raw.onlineHours),
          completedOrders: num(raw.completedOrders),
          signedShifts: num(raw.signedShifts),
          signedShiftHours: num(raw.signedShiftHours),
          inShiftOnlineHours: num(raw.inShiftOnlineHours),
          tsh: pct(raw.tsh),
          tshCritical: pct(raw.tshCritical),
          ar: pct(raw.ar),
          caa: pct(raw.caa),
          overtime: pct(raw.overtime),
          importedAt,
        };
        const index = memory.riderDailyKpis.findIndex((row) => row.id === record.id);
        if (index === -1) {
          memory.riderDailyKpis.unshift(record);
          created += 1;
        } else {
          memory.riderDailyKpis[index] = record;
          updated += 1;
        }
        const riderIndex = memory.riders.findIndex((rider) => rider.ninetyNineId === rider99Id);
        if (riderIndex !== -1) {
          if (record.ar !== null) {
            memory.riders[riderIndex] = { ...memory.riders[riderIndex], ar: Math.round(record.ar) };
          }
          creditOrderPoints(memory.riders[riderIndex].id, rider99Id, date, record.completedOrders);
        }
      }
    } else {
      for (const raw of records) {
        const rider99Id = String(raw.rider99Id ?? "").trim();
        if (!/^\d{6,}$/.test(rider99Id)) continue;
        const orders = num(raw.orders);
        const total = num(raw.total);
        const record: RiderDailyEarning = {
          id: `earn-${date}-${rider99Id}`,
          date,
          rider99Id,
          riderName: String(raw.riderName ?? "").trim() || "Desconhecido",
          phone: String(raw.phone ?? "").trim(),
          cpf: String(raw.cpf ?? "").trim(),
          city: String(raw.city ?? "").trim(),
          total,
          tripIncome: num(raw.tripIncome),
          cashDebt: num(raw.cashDebt),
          mealDeduction: num(raw.mealDeduction),
          bonus: num(raw.bonus),
          other: num(raw.other),
          tips: num(raw.tips),
          manualAdjust: num(raw.manualAdjust),
          referralBonus: num(raw.referralBonus),
          pix: String(raw.pix ?? "").trim(),
          orders,
          // Settlement comes straight from the source sheet's 金额 column —
          // no formula is applied on our side (rates can change per week).
          settleAmount: num(raw.settleAmount),
          importedAt,
        };
        const index = memory.riderDailyEarnings.findIndex((row) => row.id === record.id);
        if (index === -1) {
          memory.riderDailyEarnings.unshift(record);
          created += 1;
        } else {
          memory.riderDailyEarnings[index] = record;
          updated += 1;
        }
      }
    }

    appendServerAudit({
      actor,
      action: body.action === "importEarnings" ? "EARNINGS_IMPORTED" : "KPI_IMPORTED",
      entity: body.action === "importEarnings" ? "RiderDailyEarning" : "RiderDailyKpi",
      entityId: date,
      detail: `${body.action} for ${date}: ${created} created, ${updated} updated.`,
      risk: "Low",
    });

    return jsonResponse({ data: { created, updated, parsed: created + updated } }, { status: 201 });
  }

  return jsonResponse({ error: "unknown action" }, { status: 400 });
}

// Ensure mutations are durably written before the serverless instance can freeze.
export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
