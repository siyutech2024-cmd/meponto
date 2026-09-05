import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest, scopeFromRequest } from "../../lib/server/authz";
import {
  aggregateEarnings,
  aggregateKpis,
  deductionAmountOf,
  parseEastwindRiderKpis,
  type RiderDailyEarning,
  type RiderDailyKpi,
} from "../../lib/performance";
import { defaultMallConfig, resolveRiderTierStatus } from "../../lib/mall";
import { getAvailablePoints } from "../../lib/points";
import { sendPushToRider } from "../../lib/server/notify";
import { tagKpiAttribution } from "../../lib/leader-mode";
import { defaultAssessmentRule } from "../../lib/assessment";
import { settlementV2From } from "../../lib/settlement";
import { callRpc, dbDirectReadEnabled, fetchRows } from "../../lib/server/db-read";
import type { Rider } from "../../lib/data";
import { dualWrite } from "../../lib/server/db/dual-write";
import {
  PERF_MODULE,
  deleteEarningsByDate,
  deleteKpisByDate,
  earningsByDate,
  kpiLeaderboardT,
  kpisByDate,
  kpisByRider99,
  perfDatesT,
  perfMode,
  perfTrendT,
  upsertEarnings,
  upsertKpis,
} from "../../lib/server/db/performance-repo";

/**
 * M1 dual-write (docs/data-core-cure-plan.md W2, flag CORE_MODE_PERF):
 * after the legacy in-memory import lands, replay the DAY's final state into
 * the fact tables — day-level replay stays exactly consistent with memory
 * regardless of created/updated/backfill branches inside the import.
 */
async function dualWritePerfDay(date: string, which: "kpis" | "earnings" | "both"): Promise<void> {
  if (which !== "earnings") {
    await dualWrite(PERF_MODULE, `kpis ${date}`, () =>
      upsertKpis(memory.riderDailyKpis.filter((row) => row.date === date)));
  }
  if (which !== "kpis") {
    await dualWrite(PERF_MODULE, `earnings ${date}`, () =>
      upsertEarnings(memory.riderDailyEarnings.filter((row) => row.date === date)));
  }
}

/** Lifetime-orders milestones that trigger an achievement push. */
const BADGE_MILESTONES: Array<{ at: number; label: string }> = [
  { at: 1, label: "Primeira entrega 🚀" },
  { at: 50, label: "50 pedidos 🔥" },
  { at: 100, label: "100 pedidos 💪" },
  { at: 300, label: "300 pedidos 🏅" },
  { at: 600, label: "600 pedidos 👑" },
];

// pontos + franchises: needed by Leader Mode import-time attribution (D4).
const COLLECTIONS = ["riderDailyKpis", "riderDailyEarnings", "riders", "mallConfigs", "pointsLedgerEntries", "dispatchShifts", "shiftSignups", "memberMessages", "pontos", "franchises"];

type Located = { franchise: string; station: string; riderId: string | null };
type Enriched = RiderDailyKpi & Located;
type EnrichedEarning = RiderDailyEarning & Located;

function locate(rider99Id: string, riders: Rider[] = memory.riders): Located {
  const rider = riders.find((item) => item.ninetyNineId && item.ninetyNineId === rider99Id);
  return {
    riderId: rider?.id ?? null,
    franchise: rider?.franchise ?? "未关联",
    station: rider?.ponto ?? "未关联",
  };
}

function enrich(rows: RiderDailyKpi[], riders: Rider[] = memory.riders): Enriched[] {
  return rows.map((row) => ({ ...row, ...locate(row.rider99Id, riders) }));
}

/**
 * L2 direct read (docs/overview-read-path-optimization-plan.md §3): serve the
 * analytics GET views straight from indexed database rows — one date / one
 * rider of rows plus three tiny aggregate RPCs — instead of hydrating the
 * whole KPI + earnings collections per request. Any failure returns null and
 * the caller falls back to the legacy in-memory path. Kill switch:
 * READPATH_DB_DIRECT=false.
 */
async function performanceDirect(url: URL): Promise<Response | null> {
  if (!dbDirectReadEnabled()) return null;
  // M1 read switch: fact tables when CORE_MODE_PERF=read, JSONB mirror otherwise.
  const factRead = perfMode() === "read";
  try {
    if (url.searchParams.get("ranking") !== null) {
      const top = factRead
        ? await kpiLeaderboardT(10)
        : await callRpc<Array<{ name: string; orders: number }>>("kpi_leaderboard", { p_limit: 10 });
      return jsonResponse({ data: { top } });
    }

    const mine = url.searchParams.get("mine");
    if (mine) {
      const riderRows = await fetchRows<Rider>("riders", [{ op: "eq", field: "name", value: mine }]);
      const nineId = riderRows[0]?.ninetyNineId;
      if (!nineId) return jsonResponse({ data: null });
      const rows = factRead
        ? await kpisByRider99(nineId)
        : await fetchRows<RiderDailyKpi>("riderDailyKpis", [{ op: "eq", field: "rider99Id", value: nineId }]);
      const sorted = rows.sort((a, b) => b.date.localeCompare(a.date));
      if (!sorted.length) return jsonResponse({ data: null });
      // 同一天可能有 main + pro 两行(骑手周中入池/双号并行时)。只取一行会
      // 让 APP 里"我的状态"单量偏少 —— 合并同日所有行:数量相加,
      // 百分率复用 aggregateKpis 的口径(与看板一致,别自创第二种平均)。
      const latestDate = sorted[0].date;
      const merged = aggregateKpis(sorted.filter((row) => row.date === latestDate), latestDate);
      // Full six T+1 indicators (orders / online hours / TSH / AR / CAA /
      // overtime) so the rider app renders the complete status grid.
      return jsonResponse({
        data: {
          date: latestDate,
          completedOrders: merged.completedOrders,
          onlineHours: merged.onlineHours,
          tsh: merged.tsh,
          ar: merged.ar,
          caa: merged.caa,
          overtime: merged.overtime,
        },
      });
    }

    const date = url.searchParams.get("date");
    const franchise = url.searchParams.get("franchise");
    const station = url.searchParams.get("station");
    const accountParam = url.searchParams.get("account");
    const accountFilter = accountParam === "pro" || accountParam === "main" ? accountParam : null;

    const allDates = factRead ? await perfDatesT() : await callRpc<string[]>("perf_dates");
    const activeDate = date && allDates.includes(date) ? date : allDates[0] ?? null;

    // 趋势必须跟着视角走。加盟商/站点登录时顶部卡片按视角过滤,趋势图
    // 却曾是全网数据 —— Clayton 看到自家 400 单,曲线末点写着全网 957 单。
    // 骑手→加盟商/站点的归属在 riders 档案里(不在事实表),所以先取档案、
    // 算出"自家骑手的 99ID 数组"再查趋势,两步串行。全网视角传 null 不过滤。
    const riders = await fetchRows<Rider>("riders");
    const scopedTrendIds = (franchise || station)
      ? riders
          .filter((r) => r.ninetyNineId && (franchise ? r.franchise === franchise : true) && (station ? r.ponto === station : true))
          .map((r) => String(r.ninetyNineId))
      : null;

    const [kpiRaw, earnRaw, trend] = await Promise.all([
      !activeDate
        ? Promise.resolve([] as RiderDailyKpi[])
        : factRead
          ? kpisByDate(activeDate)
          : fetchRows<RiderDailyKpi>("riderDailyKpis", [{ op: "eq", field: "date", value: activeDate }]),
      !activeDate
        ? Promise.resolve([] as RiderDailyEarning[])
        : factRead
          ? earningsByDate(activeDate)
          : fetchRows<RiderDailyEarning>("riderDailyEarnings", [{ op: "eq", field: "date", value: activeDate }]),
      factRead
        ? perfTrendT(30, scopedTrendIds)
        : callRpc<Array<{ date: string; orders: number; proOrders: number; settle: number }>>("perf_trend", { p_days: 30, p_rider_ids: scopedTrendIds }),
    ]);

    let rows = enrich(kpiRaw, riders);
    if (franchise) rows = rows.filter((row) => row.franchise === franchise);
    if (station) rows = rows.filter((row) => row.station === station);
    if (accountFilter) rows = rows.filter((row) => accountOf(row) === accountFilter);

    const groupBy = (field: "station" | "franchise") => {
      const map = new Map<string, Enriched[]>();
      for (const row of rows) map.set(row[field], [...(map.get(row[field]) ?? []), row]);
      return [...map.entries()]
        .map(([key, group]) => ({ ...aggregateKpis(group, key), franchise: group[0].franchise }))
        .sort((a, b) => b.completedOrders - a.completedOrders);
    };

    const profileByNinetyNine = new Map(riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
    let earningRows: EnrichedEarning[] = earnRaw.map((row) => {
      const profile = profileByNinetyNine.get(row.rider99Id);
      return {
        ...row,
        pix: row.pix || profile?.pix || "",
        cpf: row.cpf || profile?.cpf || "",
        phone: row.phone || profile?.phone || "",
        ...locate(row.rider99Id, riders),
      };
    });
    if (franchise) earningRows = earningRows.filter((row) => row.franchise === franchise);
    if (station) earningRows = earningRows.filter((row) => row.station === station);
    if (accountFilter) earningRows = earningRows.filter((row) => accountOf(row) === accountFilter);
    // PRO 展示结算额 = 完单 × HqProRate(见 withProDerivedSettle 注释)。
    const mallCfg = (await fetchRows<{ id: string; hqProRatePerOrder?: number }>("mallConfigs", [{ op: "eq", field: "id", value: "mall-config" }]))[0];
    const proRate = Number(mallCfg?.hqProRatePerOrder ?? 12) || 0;
    earningRows = withProDerivedSettle(earningRows, proRate, (row) => accountOf(row) === "pro");

    const groupEarnings = (field: "station" | "franchise") => {
      const map = new Map<string, EnrichedEarning[]>();
      for (const row of earningRows) map.set(row[field], [...(map.get(row[field]) ?? []), row]);
      return [...map.entries()]
        .map(([key, group]) => ({ ...aggregateEarnings(group, key), franchise: group[0].franchise }))
        .sort((a, b) => b.settleAmount - a.settleAmount);
    };

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
  } catch (error) {
    console.warn(`[performance] direct read unavailable, legacy path. (${(error as Error).message})`);
    return null;
  }
}

const num = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * 模式二(2026-08-11 业务方指出"PRO 收入结算没显示金额"):
 * PRO 行表内金额恒为 0(v3.0 R6),收入结算视图的展示结算额改为
 * **完单 × HqProRate** —— 与钱包周结同一推导、同一费率配置,两处永远一致。
 * 只改读出的展示值,不写回任何存储;打款权威仍在钱包周结(加盟商整体转账)。
 */
const withProDerivedSettle = <T extends { orders?: number; settleAmount?: number }>(
  list: T[],
  proRate: number,
  isPro: (row: T) => boolean,
): T[] =>
  proRate > 0
    ? list.map((row) => (isPro(row) ? { ...row, settleAmount: Math.round((row.orders ?? 0) * proRate * 100) / 100 } : row))
    : list;

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
  // UNIFIED tier: the SAME rolling-window earned-points engine that prices
  // redemptions also sets the earn multiplier — one ladder everywhere.
  // 模式二: PRO 保底 Ouro —— 积分加成(+10%)与卡面同一档,一套阶梯到底。
  const riderProfile = memory.riders.find((item) => item.id === riderId);
  const tier = resolveRiderTierStatus(memory.pointsLedgerEntries, riderId, config, undefined, riderProfile?.pool === "pro" ? "ouro" : undefined);
  const points = Math.round(completedOrders * config.perOrderPoints * tier.pointsMultiplier);
  if (points <= 0) return;

  // Referral reward (anti-fraud): the inviter is only paid once, and only
  // after the invited rider has VERIFIED completed orders in Eastwind data.
  if (lifetime === 0 && completedOrders > 0) {
    const rider = memory.riders.find((item) => item.id === riderId);
    // invitedBy may be stored as "member:<id>", a 99 ID, or a plain name.
    // App signups store the "member:<id>" form, so the old name-only match
    // silently never fired — resolve every form here.
    const ref = (rider?.invitedBy ?? "").replace(/^member:/, "").trim();
    const inviter = ref && ref !== "Self-registration"
      ? memory.riders.find((item) => (item.id === ref || item.ninetyNineId === ref || item.name === ref) && item.id !== riderId)
      : undefined;
    const refId = `pts-ref-${riderId}`;
    const legacyRefId = `ref-${riderId}`; // sourceId used by the old signup-time reward
    // Single idempotency key per invited rider, across every path (first-order,
    // manual awardReferral, and the legacy signup-time entry) — never double-pay.
    const alreadyPaid = memory.pointsLedgerEntries.some(
      (entry) => entry.reasonCode === "REFERRAL_REWARD" && (entry.id === refId || entry.sourceId === refId || entry.sourceId === legacyRefId),
    );
    if (inviter && !alreadyPaid) {
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


/**
 * 模式二 · KPI 看板分池 (?account=main|pro)。
 *
 * 按行自带的 `account` 过滤,而不是回头 join 骑手当前的 pool —— 行上的账号
 * 记录的是「这条数据出自哪份日报」,那才是 KPI 与结算的真实口径。骑手中途转池
 * 时,历史行仍归属当时导入它的账号,不会被追溯改写。
 *
 * 为什么必须能分开看:PRO 行的金额一律为 0(v3.0 R6)。混在一起时,加盟商和
 * 站点的人均收入会被这些零金额行直接拉垮 —— 那个数字会变成假的。
 */
function accountOf(row: { account?: string }): "main" | "pro" {
  return row.account === "pro" ? "pro" : "main";
}

export async function GET(request: Request) {
  {
    const url0 = new URL(request.url);
    if (url0.searchParams.get("ranking") !== null) {
      // Lifetime completed-orders leaderboard (visible to riders).
      const forbidden = requirePermission(request, "use_rider_app");
      if (forbidden) return forbidden;
      const direct = await performanceDirect(url0);
      if (direct) return direct;
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
      const direct = await performanceDirect(url);
      if (direct) return direct;
      await refreshCollectionsFromDatabase(COLLECTIONS);
      const rider = memory.riders.find((item) => item.name === mine);
      if (!rider?.ninetyNineId) return jsonResponse({ data: null });
      const rows = memory.riderDailyKpis.filter((row) => row.rider99Id === rider.ninetyNineId).sort((a, b) => b.date.localeCompare(a.date));
      const latest = rows[0];
      if (!latest) return jsonResponse({ data: null });
      // Same six-indicator payload as the direct path above.
      return jsonResponse({
        data: {
          date: latest.date,
          completedOrders: latest.completedOrders,
          onlineHours: latest.onlineHours,
          tsh: latest.tsh,
          ar: latest.ar,
          caa: latest.caa,
          overtime: latest.overtime,
        },
      });
    }
  }
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;

  {
    const direct = await performanceDirect(new URL(request.url));
    if (direct) return direct;
  }

  await refreshCollectionsFromDatabase(COLLECTIONS);

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const franchise = url.searchParams.get("franchise");
  const station = url.searchParams.get("station");
  const accountParam2 = url.searchParams.get("account");
  const accountFilter = accountParam2 === "pro" || accountParam2 === "main" ? accountParam2 : null;

  const dates = [...new Set(memory.riderDailyKpis.map((row) => row.date))].sort().reverse();
  const activeDate = date && dates.includes(date) ? date : dates[0] ?? null;

  let rows = enrich(memory.riderDailyKpis.filter((row) => !activeDate || row.date === activeDate));
  if (franchise) rows = rows.filter((row) => row.franchise === franchise);
  if (station) rows = rows.filter((row) => row.station === station);
  if (accountFilter) rows = rows.filter((row) => accountOf(row) === accountFilter);

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
  const profileByNinetyNine = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
  let earningRows: EnrichedEarning[] = memory.riderDailyEarnings
    .filter((row) => !earningDate || row.date === earningDate)
    .map((row) => {
      // Contact fields fall back to the rider PROFILE (raw exports carry none).
      const profile = profileByNinetyNine.get(row.rider99Id);
      return {
        ...row,
        pix: row.pix || profile?.pix || "",
        cpf: row.cpf || profile?.cpf || "",
        phone: row.phone || profile?.phone || "",
        ...locate(row.rider99Id),
      };
    });
  if (franchise) earningRows = earningRows.filter((row) => row.franchise === franchise);
  if (station) earningRows = earningRows.filter((row) => row.station === station);
  if (accountFilter) earningRows = earningRows.filter((row) => accountOf(row) === accountFilter);
  // PRO 展示结算额 = 完单 × HqProRate(与 DB 直读路径同一口径)。
  const proRateLegacy = Number(memory.mallConfigs.find((c) => c.id === "mall-config")?.hqProRatePerOrder ?? 12) || 0;
  earningRows = withProDerivedSettle(earningRows, proRateLegacy, (row) => accountOf(row) === "pro");

  const groupEarnings = (field: "station" | "franchise") => {
    const map = new Map<string, EnrichedEarning[]>();
    for (const row of earningRows) map.set(row[field], [...(map.get(row[field]) ?? []), row]);
    return [...map.entries()]
      .map(([key, group]) => ({ ...aggregateEarnings(group, key), franchise: group[0].franchise }))
      .sort((a, b) => b.settleAmount - a.settleAmount);
  };

  // 30-day network trend (orders + settlement) for the chart.
  const trendDates = [...allDates].sort().slice(-30);
  // 视角过滤:与上面 DB 路径同一口径(加盟商/站点只看自家骑手)。
  const scopedIds = (franchise || station)
    ? new Set(
        memory.riders
          .filter((r) => r.ninetyNineId && (franchise ? r.franchise === franchise : true) && (station ? r.ponto === station : true))
          .map((r) => String(r.ninetyNineId)),
      )
    : null;
  const inScope = (id: string) => !scopedIds || scopedIds.has(id);
  const trend = trendDates.map((d) => {
    const dayRows = memory.riderDailyKpis.filter((row) => row.date === d && inScope(row.rider99Id));
    return {
      date: d,
      orders: dayRows.reduce((sum, row) => sum + (row.completedOrders ?? 0), 0),
      // PRO 单独一条曲线(金色)。orders 仍是总数 —— PRO 是"其中",不是"另外"。
      proOrders: dayRows.filter((row) => accountOf(row) === "pro").reduce((sum, row) => sum + (row.completedOrders ?? 0), 0),
      settle: Math.round(memory.riderDailyEarnings.filter((row) => row.date === d && inScope(row.rider99Id)).reduce((sum, row) => sum + (row.settleAmount ?? 0), 0) * 100) / 100,
    };
  });

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

/**
 * No-show discipline (骑手爽约惩罚): a rider who SIGNED UP for a dispatch shift
 * on [date] but has NO KPI row that day missed the shift. The first
 * NO_SHOW_FREE_ALLOWANCE misses only warn; each miss beyond that deducts
 * noShowPenaltyPoints (ledger `expire`, idempotent per shift, capped at the
 * available balance). The rider is told via in-app message + push.
 */
const NO_SHOW_FREE_ALLOWANCE = 2;
function evaluateNoShows(date: string) {
  const config = memory.mallConfigs.find((c) => c.id === "mall-config") ?? defaultMallConfig;
  const penalty = config.noShowPenaltyPoints ?? 50;
  const shiftsByDateId = new Map(memory.dispatchShifts.map((sh) => [sh.id, sh] as const));
  const hasData = (r99: string, d: string) => memory.riderDailyKpis.some((k) => k.rider99Id === r99 && k.date === d);
  const active = (g: { status: string }) => g.status === "submitted" || g.status === "approved" || g.status === "reported";

  // Today's no-shows, grouped per rider.
  const todays = memory.shiftSignups.filter((g) => {
    const sh = shiftsByDateId.get(g.shiftId);
    return !!sh && sh.date === date && active(g) && !!g.rider99Id && !hasData(g.rider99Id, date);
  });
  const byRider = new Map<string, typeof todays>();
  for (const g of todays) byRider.set(g.rider99Id, [...(byRider.get(g.rider99Id) ?? []), g]);

  const notices: Array<{ riderName: string; title: string; body: string }> = [];
  for (const [r99, misses] of byRider) {
    const rider = memory.riders.find((r) => r.ninetyNineId === r99);
    if (!rider) continue;
    // Deterministic lifetime no-show count (all signed shifts up to [date]).
    const totalNoShows = memory.shiftSignups.filter((g) => {
      const sh = shiftsByDateId.get(g.shiftId);
      return !!sh && sh.date <= date && active(g) && g.rider99Id === r99 && !hasData(r99, sh.date);
    }).length;
    let countedSoFar = totalNoShows - misses.length;
    for (const g of misses) {
      countedSoFar += 1;
      const overAllowance = countedSoFar > NO_SHOW_FREE_ALLOWANCE;
      const entryId = `pts-noshow-${g.shiftId}-${rider.id}`;
      if (overAllowance && penalty > 0 && !memory.pointsLedgerEntries.some((e) => e.id === entryId)) {
        const available = getAvailablePoints(memory.pointsLedgerEntries, rider.id);
        const delta = Math.min(available, penalty);
        if (delta > 0) {
          memory.pointsLedgerEntries.unshift({
            id: entryId,
            riderId: rider.id,
            accountId: `pts-${rider.id}`,
            type: "expire",
            points: delta,
            status: "approved",
            sourceType: "expiry",
            sourceId: entryId,
            balanceAfter: available - delta,
            reasonCode: "NO_SHOW_PENALTY",
            note: `Ausência no turno ${date} (${countedSoFar}ª falta)`,
            createdBy: "T+1 Import",
            createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
          });
        }
      }
      const sh = shiftsByDateId.get(g.shiftId);
      const when = `${date} ${sh?.timeRange ?? ""}`.trim();
      const title = overAllowance ? "Falta no turno — pontos descontados" : "Aviso de falta no turno";
      const body = overAllowance
        ? `Você se inscreveu no turno de ${when} e não registrou atividade. Desconto de ${penalty} pts aplicado (${countedSoFar}ª falta). Cancele com antecedência quando não puder comparecer.`
        : `Você se inscreveu no turno de ${when} e não registrou atividade (${countedSoFar}/${NO_SHOW_FREE_ALLOWANCE} sem desconto). A partir da próxima falta haverá desconto de ${penalty} pts.`;
      const msgId = `msg-noshow-${g.shiftId}-${rider.id}`;
      if (!memory.memberMessages.some((m) => m.id === msgId)) {
        memory.memberMessages.unshift({ id: msgId, riderName: rider.name, riderId: rider.id, title, body, href: "/rider-app/agenda", createdAt: new Date().toISOString() });
        notices.push({ riderName: rider.name, title, body });
      }
    }
  }
  // Push best-effort AFTER state writes (never blocks the import).
  for (const n of notices) void sendPushToRider(n.riderName, n.title, n.body, "/rider-app/agenda");
  return notices.length;
}

type Body =
  | { action: "import"; raw: string; date: string }
  // 模式二 T2: `account` selects the source Eastwind OL account
  // ("main" 旧OL 默认 / "pro" 新OL — PRO rows land with zero money).
  | { action: "importKpiRecords"; date: string; records: Array<Record<string, unknown>>; account?: "main" | "pro" }
  | { action: "importEarnings"; date: string; records: Array<Record<string, unknown>>; account?: "main" | "pro" }
  | { action: "purgeDate"; date: string }
  /** 倒扣核销:把指定的负数结算行标记为已了结(金额不改,只加标记)。 */
  | { action: "settleDeduction"; earningIds: string[] }
  | { action: "recreditPoints" };

async function handlePost(request: Request) {
  const forbidden = requirePermission(request, "view_analytics");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  const actor = roleFromRequest(request);

  if (body.action === "recreditPoints") {
    // Idempotent backfill: walk EVERY imported KPI day (oldest first, so the
    // tier multiplier evolves in order) and (re)credit per-order points for
    // riders linked in the roster. Fixed ledger ids (pts-ord-<date>-<riderId>)
    // mean existing days are updated in place — never double-credited. Fixes
    // riders whose KPI landed before their roster link / before auto-credit.
    const rows = [...memory.riderDailyKpis].sort((a, b) => (a.date < b.date ? -1 : 1));
    let credited = 0;
    let skipped = 0;
    for (const row of rows) {
      const riderIndex = memory.riders.findIndex((rider) => rider.ninetyNineId === row.rider99Id);
      if (riderIndex === -1 || (row.completedOrders ?? 0) <= 0) {
        skipped += 1;
        continue;
      }
      creditOrderPoints(memory.riders[riderIndex].id, row.rider99Id, row.date, row.completedOrders);
      credited += 1;
    }
    appendServerAudit({ actor, action: "POINTS_RECREDIT", entity: "PointsLedger", entityId: new Date().toISOString().slice(0, 10), detail: `T+1 积分补账：${credited} 行入账 / ${skipped} 行跳过（未关联或 0 单）`, risk: "Medium" });
    return jsonResponse({ data: { credited, skipped, ledgerSize: memory.pointsLedgerEntries.length } });
  }

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
      // Leader Mode D4: stamp today's station attribution BEFORE insertion.
      // No-op unless the rider's franchise runs leaderMode (São Paulo unchanged).
      tagKpiAttribution(record, memory.riders, memory.pontos, memory.franchises);
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

    await dualWritePerfDay(date, "kpis");
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
    /** 今日统计恒等式不成立的行(仅 earnings 导入,普通池)。 */
    const mismatches: Array<{ rider99Id: string; riderName: string; total: number; recomputed: number; diff: number }> = [];
    let updated = 0;

    const achievements: Array<{ riderName: string; label: string }> = [];
    let noShowNotices = 0;
    if (body.action === "importKpiRecords") {
      // 模式二 T2: same dual-source rule as earnings — the account is part of
      // the idempotency key so 旧 OL / 新 OL sheets never overwrite each other.
      const kpiAccount: "main" | "pro" = body.account === "pro" ? "pro" : "main";
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
          id: kpiAccount === "pro" ? `kpi-pro-${date}-${rider99Id}` : `kpi-${date}-${rider99Id}`,
          account: kpiAccount,
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
        tagKpiAttribution(record, memory.riders, memory.pontos, memory.franchises); // Leader Mode D4
        const index = memory.riderDailyKpis.findIndex((row) => row.id === record.id);
        // Lifetime orders excluding this day's record (so re-imports are idempotent).
        const otherSum = memory.riderDailyKpis
          .filter((row) => row.rider99Id === rider99Id && row.id !== record.id)
          .reduce((sum, row) => sum + (row.completedOrders ?? 0), 0);
        const before = otherSum + (index === -1 ? 0 : memory.riderDailyKpis[index].completedOrders ?? 0);
        const after = otherSum + record.completedOrders;
        if (index === -1) {
          memory.riderDailyKpis.unshift(record);
          created += 1;
        } else {
          memory.riderDailyKpis[index] = record;
          updated += 1;
        }
        // If the earnings row for this day lacked order/金额 columns, complete it now.
        const earnIndex = memory.riderDailyEarnings.findIndex((row) => row.date === date && row.rider99Id === rider99Id);
        if (earnIndex !== -1 && (memory.riderDailyEarnings[earnIndex].orders ?? 0) === 0 && record.completedOrders > 0) {
          // Backfill ORDERS only — 金额 stays exactly as imported (never computed).
          memory.riderDailyEarnings[earnIndex] = { ...memory.riderDailyEarnings[earnIndex], orders: record.completedOrders };
        }
        const riderIndex = memory.riders.findIndex((rider) => rider.ninetyNineId === rider99Id);
        if (riderIndex !== -1) {
          if (record.ar !== null) {
            memory.riders[riderIndex] = { ...memory.riders[riderIndex], ar: Math.round(record.ar) };
          }
          creditOrderPoints(memory.riders[riderIndex].id, rider99Id, date, record.completedOrders);
          // Achievement crossed during this import → notify the rider.
          for (const milestone of BADGE_MILESTONES) {
            if (before < milestone.at && after >= milestone.at) {
              achievements.push({ riderName: memory.riders[riderIndex].name, label: milestone.label });
            }
          }
        }
      }
    } else {
      // 模式二 T2 · dual-source import. `account` says which Eastwind OL
      // account the sheet came from: "main" (旧 OL, 普通池) or "pro" (新 OL,
      // PRO 池). PRO rows are stored with ZERO money — the settlement price is
      // agreed offline between franchise and rider, and per v3.0 R6 it must
      // never enter the system (so no client, and no future report, can ever
      // derive the per-order rate). Idempotency key includes the account, so
      // the two feeds can never overwrite each other.
      const account: "main" | "pro" = body.account === "pro" ? "pro" : "main";
      const isPro = account === "pro";
      for (const raw of records) {
        const rider99Id = String(raw.rider99Id ?? "").trim();
        if (!/^\d{6,}$/.test(rider99Id)) continue;
        const total = isPro ? 0 : num(raw.total);
        // Raw Eastwind export has no order column: orders come from the
        // same-day KPI sheet. 金额 is NEVER computed — sheet column only.
        const kpiSameDay = memory.riderDailyKpis.find((row) => row.date === date && row.rider99Id === rider99Id);
        const orders = raw.orders !== undefined ? num(raw.orders) : kpiSameDay?.completedOrders ?? 0;
        const record: RiderDailyEarning = {
          id: isPro ? `earn-pro-${date}-${rider99Id}` : `earn-${date}-${rider99Id}`,
          account,
          date,
          rider99Id,
          riderName: String(raw.riderName ?? "").trim() || "Desconhecido",
          phone: String(raw.phone ?? "").trim(),
          cpf: String(raw.cpf ?? "").trim(),
          city: String(raw.city ?? "").trim(),
          total,
          // PRO rows: income columns are forced to 0 at the door (v3.0 R6 —
          // per-order pay must never enter the system).
          tripIncome: isPro ? 0 : num(raw.tripIncome),
          // ⚠ cashDebt 例外(2026-08-11 业务方定):现金单欠款不是薪酬,是
          // 骑手代收的顾客现金 —— 欠加盟商的债务。清零它等于结算时看不见
          // 这笔账。保留原值,不泄露任何费率信息。
          cashDebt: num(raw.cashDebt),
          mealDeduction: isPro ? 0 : num(raw.mealDeduction),
          bonus: isPro ? 0 : num(raw.bonus),
          other: isPro ? 0 : num(raw.other),
          tips: isPro ? 0 : num(raw.tips),
          manualAdjust: isPro ? 0 : num(raw.manualAdjust),
          referralBonus: isPro ? 0 : num(raw.referralBonus),
          pix: String(raw.pix ?? "").trim(),
          orders,
          // Settlement amount: use the sheet's explicit 金额 column when present;
          // otherwise fall back to 行程收入 / Total diário (tripIncome), per the
          // confirmed business rule (最终金额 = 行程收入). PRO = always 0.
          settleAmount: isPro ? 0 : (raw.settleAmount !== undefined ? num(raw.settleAmount) : num(raw.tripIncome)),
          importedAt,
        };
        // 恒等式校验(2026-09-06):今日统计 = 行程收入 + 加项 − 现金 − 餐损。不一致不拦截
        // (原值照旧入库,表格是事实源),但记差额并在响应/审计里点名,页面标红。
        if (!isPro) {
          const recomputed = record.tripIncome + record.bonus + record.tips + record.other + record.manualAdjust + record.referralBonus - record.cashDebt - record.mealDeduction;
          const diff = Math.round((record.total - recomputed) * 100) / 100;
          if (Math.abs(diff) > 0.02) {
            record.totalMismatch = diff;
            mismatches.push({ rider99Id, riderName: record.riderName, total: record.total, recomputed: Math.round(recomputed * 100) / 100, diff });
          }
        }
        const index = memory.riderDailyEarnings.findIndex((row) => row.id === record.id);
        if (index === -1) {
          memory.riderDailyEarnings.unshift(record);
          created += 1;
        } else {
          memory.riderDailyEarnings[index] = record;
          updated += 1;
        }
        // Backfill empty profile contact fields from the Ganhos sheet (PIX 等).
        const riderIndex = memory.riders.findIndex((rider) => rider.ninetyNineId === rider99Id);
        if (riderIndex !== -1) {
          const rider = memory.riders[riderIndex];
          const patch: Partial<typeof rider> = {};
          if (!rider.pix && record.pix) patch.pix = record.pix;
          if (!rider.cpf && record.cpf) patch.cpf = record.cpf;
          if (!rider.phone && record.phone) patch.phone = record.phone;
          if (Object.keys(patch).length > 0) memory.riders[riderIndex] = { ...rider, ...patch };
        }
      }
    }

    const importAccount: "main" | "pro" = body.account === "pro" ? "pro" : "main";
    appendServerAudit({
      actor,
      action: body.action === "importEarnings" ? "EARNINGS_IMPORTED" : "KPI_IMPORTED",
      entity: body.action === "importEarnings" ? "RiderDailyEarning" : "RiderDailyKpi",
      entityId: date,
      detail: `[${importAccount}] ${body.action} for ${date}: ${created} created, ${updated} updated.${mismatches.length ? ` ⚠ ${mismatches.length} 行今日统计与各列不符。` : ""}`,
      risk: "Low",
    });

    // 模式二 T2 · 缺源告警: both OL accounts must be imported for the same day.
    // After one lands, report whether the other is still missing so operations
    // notices a half-imported day immediately (v3.0 T2 acceptance).
    const otherAccount = importAccount === "pro" ? "main" : "pro";
    const hasOther = body.action === "importEarnings"
      ? memory.riderDailyEarnings.some((row) => row.date === date && (row.account ?? "main") === otherAccount)
      : memory.riderDailyKpis.some((row) => row.date === date && (row.account ?? "main") === otherAccount);
    const missingSource = hasOther ? null : otherAccount;
    if (missingSource) {
      appendServerAudit({
        actor,
        action: "IMPORT_SOURCE_MISSING",
        entity: body.action === "importEarnings" ? "RiderDailyEarning" : "RiderDailyKpi",
        entityId: date,
        detail: `${date}: "${missingSource}" OL sheet not imported yet (only "${importAccount}" present).`,
        risk: "Medium",
      });
    }

    // Signed-up-but-absent riders: warn / deduct (idempotent per shift).
    if (body.action === "importKpiRecords") {
      noShowNotices = evaluateNoShows(date);
    }

    // Best-effort achievement pushes (deduped per rider+milestone this import).
    const seen = new Set<string>();
    for (const a of achievements) {
      const key = `${a.riderName}|${a.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await sendPushToRider(a.riderName, "Conquista desbloqueada! 🏆", `Você alcançou: ${a.label}. Confira seus selos na MePonto.`, "/mall");
    }

    // KPI imports may also backfill the same day's earnings orders → replay both.
    await dualWritePerfDay(date, body.action === "importEarnings" ? "earnings" : "both");
    return jsonResponse({ data: { created, updated, parsed: created + updated, achievements: achievements.length, noShowNotices, account: importAccount, missingSource, totalMismatches: mismatches } }, { status: 201 });
  }

  // Remove ONE business day's imported rows (both T+1 tables) — for fixing
  // mistaken uploads; re-import afterwards to restore correct data.
  /**
   * 倒扣核销 (settleDeduction).
   *
   * 负数结算行 = 骑手当天倒欠平台(现金单欠款、餐损…)。账本铁律:**原始导入
   * 行的金额一个字都不改** —— 核销只是在这一行上追加"谁、什么时候核销的"。
   * 待扣余额永远由未标记的负数行现算,不另存一个可能对不上的数字。
   * 仅总部可核销(这是一笔钱的了结),每次都写 Medium 风险审计。
   */
  if (body.action === "settleDeduction") {
    const hqScope = await scopeFromRequest(request);
    await refreshCollectionsFromDatabase(["assessmentRules"]);
    const v2From = settlementV2From(memory.assessmentRules.find((r) => r.id === "rule-active") ?? defaultAssessmentRule);
    if (hqScope.franchise || hqScope.station) return jsonResponse({ error: "仅总部可执行此操作" }, { status: 403 });
    const ids = Array.isArray(body.earningIds) ? body.earningIds.map(String) : [];
    if (ids.length === 0) return jsonResponse({ error: "earningIds is required" }, { status: 400 });
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    let done = 0;
    let total = 0;
    for (const id of ids) {
      const index = memory.riderDailyEarnings.findIndex((row) => row.id === id);
      if (index === -1) continue;
      const row = memory.riderDailyEarnings[index];
      // 只有"负数且未核销"的行才可核销 —— 重复点击、或误传正数行都是空操作。
      // 金额口径随 v2 生效日切换(今日统计 vs settleAmount),见 deductionAmountOf。
      const owed = deductionAmountOf(row, v2From);
      if (owed <= 0 || row.deductionSettledAt) continue;
      memory.riderDailyEarnings[index] = { ...row, deductionSettledAt: stamp, deductionSettledBy: actor };
      appendServerAudit({
        actor,
        action: "RIDER_DEDUCTION_SETTLED",
        entity: "RiderDailyEarning",
        entityId: row.id,
        detail: `${row.riderName} (99 ${row.rider99Id}) ${row.date}: 倒扣 R$ ${owed.toFixed(2)} 已核销。`,
        risk: "Medium",
      });
      done += 1;
      total += owed;
    }
    await flushPendingToDatabase();
    return jsonResponse({ data: { settled: done, amount: Math.round(total * 100) / 100 } });
  }

  if (body.action === "purgeDate") {
    const hqScope = await scopeFromRequest(request);
    if (hqScope.franchise || hqScope.station) return jsonResponse({ error: "仅总部可执行此操作" }, { status: 403 });
    const date = String(body.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResponse({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
    const kpiVictims = memory.riderDailyKpis.filter((row) => row.date === date);
    const earnVictims = memory.riderDailyEarnings.filter((row) => row.date === date);
    for (const row of kpiVictims) persistDeleteRecord("riderDailyKpis", row.id);
    for (const row of earnVictims) persistDeleteRecord("riderDailyEarnings", row.id);
    for (let i = memory.riderDailyKpis.length - 1; i >= 0; i -= 1) {
      if (memory.riderDailyKpis[i].date === date) memory.riderDailyKpis.splice(i, 1);
    }
    for (let i = memory.riderDailyEarnings.length - 1; i >= 0; i -= 1) {
      if (memory.riderDailyEarnings[i].date === date) memory.riderDailyEarnings.splice(i, 1);
    }
    appendServerAudit({ actor, action: "T1_DATE_PURGED", entity: "RiderDailyKpi", entityId: date, detail: `Purged ${kpiVictims.length} KPI + ${earnVictims.length} earning rows for ${date}.`, risk: "Medium" });
    await dualWrite(PERF_MODULE, `purge ${date}`, async () => {
      await deleteKpisByDate(date);
      await deleteEarningsByDate(date);
    });
    return jsonResponse({ data: { kpiRemoved: kpiVictims.length, earningsRemoved: earnVictims.length } });
  }

  // Backfill rider profile PIX/CPF/phone from already-imported Ganhos rows
  // (latest row per rider wins; only fills EMPTY profile fields).
  if (body.action === "syncRiderContacts") {
    const hqScope = await scopeFromRequest(request);
    if (hqScope.franchise || hqScope.station) return jsonResponse({ error: "仅总部可执行此操作" }, { status: 403 });
    const latestByNinetyNine = new Map<string, (typeof memory.riderDailyEarnings)[number]>();
    for (const row of [...memory.riderDailyEarnings].sort((a, b) => a.date.localeCompare(b.date))) {
      if (row.pix || row.cpf || row.phone) latestByNinetyNine.set(row.rider99Id, row);
    }
    let filled = 0;
    for (let i = 0; i < memory.riders.length; i += 1) {
      const rider = memory.riders[i];
      if (!rider.ninetyNineId) continue;
      const source = latestByNinetyNine.get(rider.ninetyNineId);
      if (!source) continue;
      const patch: Partial<typeof rider> = {};
      if (!rider.pix && source.pix) patch.pix = source.pix;
      if (!rider.cpf && source.cpf) patch.cpf = source.cpf;
      if (!rider.phone && source.phone) patch.phone = source.phone;
      if (Object.keys(patch).length > 0) {
        memory.riders[i] = { ...rider, ...patch };
        filled += 1;
      }
    }
    appendServerAudit({ actor, action: "RIDER_CONTACTS_SYNCED", entity: "Rider", entityId: "all", detail: `Backfilled contact fields for ${filled} riders from imported earnings.`, risk: "Low" });
    return jsonResponse({ data: { filled } });
  }

  // Standalone PIX sheet import: match riders by 99ID → CPF → exact name.
  if (body.action === "importPixRecords") {
    const hqScope = await scopeFromRequest(request);
    if (hqScope.franchise || hqScope.station) return jsonResponse({ error: "仅总部可执行此操作" }, { status: 403 });
    const records = Array.isArray((body as { records?: Array<Record<string, unknown>> }).records) ? (body as { records: Array<Record<string, unknown>> }).records.slice(0, 1000) : [];
    if (records.length === 0) return jsonResponse({ error: "records are required" }, { status: 400 });
    const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
    // CPF → 99ID bridge from both T+1 tables (covers riders whose profile CPF is empty).
    const cpfTo99 = new Map<string, string>();
    for (const row of [...memory.riderDailyKpis, ...memory.riderDailyEarnings]) {
      const c = digits(row.cpf);
      if (c && row.rider99Id) cpfTo99.set(c, row.rider99Id);
    }
    let matched = 0;
    const unmatched: string[] = [];
    for (const raw of records) {
      const pix = String(raw.pix ?? "").trim();
      if (!pix) continue;
      const id99 = digits(raw.rider99Id) || cpfTo99.get(digits(raw.cpf)) || "";
      const cpf = digits(raw.cpf);
      const name = String(raw.riderName ?? "").trim().toLowerCase();
      const index = memory.riders.findIndex(
        (rider) =>
          (id99 && rider.ninetyNineId === id99) ||
          (cpf && digits(rider.cpf) === cpf) ||
          (name && rider.name.trim().toLowerCase() === name),
      );
      if (index === -1) {
        unmatched.push(String(raw.riderName ?? raw.rider99Id ?? raw.cpf ?? "?"));
        continue;
      }
      const patch: Record<string, string> = { pix };
      if (cpf && !digits(memory.riders[index].cpf)) patch.cpf = String(raw.cpf ?? "").trim();
      memory.riders[index] = { ...memory.riders[index], ...patch };
      matched += 1;
    }
    appendServerAudit({ actor, action: "RIDER_PIX_IMPORTED", entity: "Rider", entityId: "all", detail: `PIX import: ${matched} matched, ${unmatched.length} unmatched.`, risk: "Low" });
    return jsonResponse({ data: { matched, unmatched: unmatched.slice(0, 20) } }, { status: 201 });
  }

  return jsonResponse({ error: "unknown action" }, { status: 400 });
}

// Ensure mutations are durably written before the serverless instance can freeze.
export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
