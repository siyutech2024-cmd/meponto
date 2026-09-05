import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { sendPushToRider } from "../../lib/server/notify";
import { computeBalance, type FranchiseCommissionSnapshot, type RiderWithdrawal, type WalletPayment } from "../../lib/finance";
import {
  buildAssessmentBoard,
  commissionActiveForWeek,
  commissionEffectiveFrom,
  defaultAssessmentRule,
  type AssessmentRule,
} from "../../lib/assessment";
import { scopeFromRequest } from "../../lib/server/authz";
import { callRpc, dbDirectReadEnabled, fetchRows } from "../../lib/server/db-read";
import { pendingDeductions, type RiderDailyEarning, type RiderDailyKpi } from "../../lib/performance";
import { addBreakdown, breakdownOf, emptyBreakdown, isV2Date, payableOf, poolOfRow, settlementV2From, sumBreakdown, type EarningBreakdown } from "../../lib/settlement";
import {
  earningsByDateRange,
  earningsByRider99,
  earningsMaxDateT,
  earningsSettledTotalsT,
  kpisByDateRange,
  perfMode,
} from "../../lib/server/db/performance-repo";

// pontos: Leader Mode settlement needs station payee info (leaderPixKey/CNPJ).
// assessmentRules: 加盟商佣金比例来自考核规则(2026-09-05)。
const COLLECTIONS = ["riderWithdrawals", "riderDailyEarnings", "riderDailyKpis", "riders", "franchises", "walletPayments", "franchiseDepositLedgerEntries", "pontos", "assessmentRules"];
// L2 direct-read mode: the two T+1 collections (grow per rider per day) are
// fetched as WINDOWED database rows instead of hydrated wholesale — only the
// small collections still go through the memory refresh.
const SMALL_COLLECTIONS = ["riderWithdrawals", "riders", "franchises", "walletPayments", "franchiseDepositLedgerEntries", "assessmentRules"];

/** Windowed T+1 rows straight from the database; falls back to a full legacy
 *  refresh + in-memory filter when direct read is off or fails. */
async function earningsWindow(from: string, to: string): Promise<RiderDailyEarning[]> {
  if (dbDirectReadEnabled()) {
    try {
      // M1 read switch: fact table when CORE_MODE_PERF=read.
      return perfMode() === "read"
        ? await earningsByDateRange(from, to)
        : await fetchRows<RiderDailyEarning>("riderDailyEarnings", [
            { op: "gte", field: "date", value: from },
            { op: "lte", field: "date", value: to },
          ]);
    } catch (error) {
      console.warn(`[wallet] direct earnings read failed, legacy path. (${(error as Error).message})`);
    }
  }
  await refreshCollectionsFromDatabase(["riderDailyEarnings"]);
  return memory.riderDailyEarnings.filter((row) => row.date >= from && row.date <= to);
}

/** Windowed KPI rows (same direct-read / legacy fallback shape as earningsWindow). */
async function kpiWindow(from: string, to: string): Promise<RiderDailyKpi[]> {
  if (dbDirectReadEnabled()) {
    try {
      return perfMode() === "read"
        ? await kpisByDateRange(from, to)
        : await fetchRows<RiderDailyKpi>("riderDailyKpis", [
            { op: "gte", field: "date", value: from },
            { op: "lte", field: "date", value: to },
          ]);
    } catch (error) {
      console.warn(`[wallet] direct kpi read failed, legacy path. (${(error as Error).message})`);
    }
  }
  await refreshCollectionsFromDatabase(["riderDailyKpis"]);
  return memory.riderDailyKpis.filter((k) => k.date >= from && k.date <= to);
}

function activeAssessmentRule(): AssessmentRule {
  return memory.assessmentRules.find((rule) => rule.id === "rule-active") ?? defaultAssessmentRule;
}

/** 骑手付款记录是否属于这名骑手:优先 99ID,历史记录没有 99ID 才回退姓名(重名风险只留在历史)。 */
const paymentIsForRider = (p: WalletPayment, rider99Id: string, name: string) =>
  p.target === "rider" && (p.rider99Id ? p.rider99Id === rider99Id : p.refName === name);

/** True when a walletPayments row is a franchise COMMISSION payout (总部→加盟商佣金),
 *  which must never be mixed into the rider-settlement 已付 figures. */
const isCommissionPayment = (p: WalletPayment) => p.kind === "commission";

/**
 * 加盟商佣金 · 周口径(2026-09-05 业务方定,仅 commissionEffectiveFrom 起的周):
 *
 *   佣金比例      = 考核看板该加盟商当周 commissionPct(最小抽佣 ± KPI 加减,普通池)
 *   佣金基准      = Σ 普通池骑手当周 行程收入 tripIncome
 *   总部应付佣金  = round(基准 × 比例 / 100, 2)
 *   加盟商应付骑手 = Σ 今日统计 total(= 所有收入 − 现金单欠款 − 餐损;加盟商每日发给骑手)
 *
 * 两个数字**分开显示**,互不冲抵:加盟商每天付骑手工资,总部每周付加盟商佣金。
 * PRO 池不参与(维持 完单 × 费率;PRO 运营即将取消)。纯派生量;真正入账的只有
 * `payCommission` 写下的那一条 kind="commission" 付款记录及其快照。
 */
function computeFranchiseCommission(
  rule: AssessmentRule,
  win: { from: string; to: string },
  weekEarnings: RiderDailyEarning[],
  weekKpis: RiderDailyKpi[],
): Map<string, FranchiseCommissionSnapshot> {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byNinetyNine = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
  const board = new Map(buildAssessmentBoard(rule, win.from, win.to, "franchise", weekKpis, memory.riders, undefined, "standard").map((g) => [g.name, g]));
  const acc = new Map<string, { tripIncome: number; payable: number; riders: Set<string>; dates: Set<string> }>();
  for (const row of weekEarnings) {
    if (row.date < win.from || row.date > win.to) continue;
    const rider = byNinetyNine.get(row.rider99Id);
    if (poolOfRow(row, rider?.pool, settlementV2From(rule)) === "pro") continue;
    const franchise = rider?.franchise ?? "Unassigned";
    const cur = acc.get(franchise) ?? { tripIncome: 0, payable: 0, riders: new Set<string>(), dates: new Set<string>() };
    cur.tripIncome = r2(cur.tripIncome + (row.tripIncome ?? 0));
    cur.payable = r2(cur.payable + (row.total ?? 0));
    cur.riders.add(row.rider99Id);
    cur.dates.add(row.date);
    acc.set(franchise, cur);
  }
  const out = new Map<string, FranchiseCommissionSnapshot>();
  for (const [franchise, cur] of acc) {
    const group = board.get(franchise);
    // 无 KPI 数据的加盟商:所有 metric 为 na → 不加不减 → 最小抽佣。
    const pct = group?.commissionPct ?? rule.minCommissionPct;
    out.set(franchise, {
      pct,
      tripIncome: cur.tripIncome,
      commission: r2((cur.tripIncome * pct) / 100),
      riderPayable: cur.payable,
      riders: cur.riders.size,
      days: cur.dates.size,
      minPct: rule.minCommissionPct,
      totalAdjust: group?.totalAdjust ?? 0,
      metrics: group?.metrics ?? {},
    });
  }
  return out;
}

const today = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

/** Monday-anchored natural week containing `date` → [start..start+6]. */
function weekWindow(date: string): { from: string; to: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const back = (day - 1 + 7) % 7; // days since the most recent Monday
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - back);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const riderName = url.searchParams.get("riderName") ?? "";
  const riderId = url.searchParams.get("riderId") ?? "";
  // Rider wallet view only needs the rider-app permission.
  const forbidden = requirePermission(request, riderName || riderId ? "use_rider_app" : "view_finance");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(dbDirectReadEnabled() ? SMALL_COLLECTIONS : COLLECTIONS);

  const franchiseScope = url.searchParams.get("franchise") ?? "";
  const stationScope = url.searchParams.get("station") ?? "";

  // Periodic billing statement: per-rider daily settle rows for one franchise.
  let statementFranchise = url.searchParams.get("statement") ?? "";
  if (statementFranchise) {
    // A franchise session can only ever query ITS OWN statement.
    const scope = await scopeFromRequest(request);
    if (scope.franchise) statementFranchise = scope.franchise;
    const to = url.searchParams.get("to") || today();
    const from = url.searchParams.get("from") || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const byNinetyNine = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
    let kpiWin: RiderDailyKpi[];
    if (dbDirectReadEnabled()) {
      try {
        kpiWin = perfMode() === "read"
          ? await kpisByDateRange(from, to)
          : await fetchRows<RiderDailyKpi>("riderDailyKpis", [
              { op: "gte", field: "date", value: from },
              { op: "lte", field: "date", value: to },
            ]);
      } catch (error) {
        console.warn(`[wallet] direct kpi read failed, legacy path. (${(error as Error).message})`);
        await refreshCollectionsFromDatabase(["riderDailyKpis"]);
        kpiWin = memory.riderDailyKpis.filter((k) => k.date >= from && k.date <= to);
      }
    } else {
      kpiWin = memory.riderDailyKpis.filter((k) => k.date >= from && k.date <= to);
    }
    const earnWin = await earningsWindow(from, to);
    const v2From = settlementV2From(activeAssessmentRule());
    const kpiByKey = new Map(kpiWin.map((k) => [`${k.date}|${k.rider99Id}`, k]));
    const earnByKey = new Map(earnWin.map((e) => [`${e.date}|${e.rider99Id}`, e]));
    // Union of both T+1 tables so KPI-only days still appear (data completeness).
    const keys = [...new Set([...kpiByKey.keys(), ...earnByKey.keys()])];
    // Daily rider payments inside the window → per-day paid status.
    const dailyPayments = memory.walletPayments.filter((p) => p.target === "rider" && p.weekFrom === p.weekTo && p.weekFrom >= from && p.weekTo <= to);
    const paidDay = (date: string, rider99Id: string, name: string) => dailyPayments.some((p) => p.weekFrom === date && paymentIsForRider(p, rider99Id, name));
    const r2 = (n: number) => Math.round((n ?? 0) * 100) / 100;
    const rows = keys
      .map((key) => {
        const [date, rider99Id] = key.split("|");
        return { date, rider99Id, earning: earnByKey.get(key), kpi: kpiByKey.get(key), rider: byNinetyNine.get(rider99Id) };
      })
      .filter(({ rider }) => statementFranchise === "all" || (rider?.franchise ?? "Unassigned") === statementFranchise)
      .map(({ date, rider99Id, earning, kpi, rider }) => {
        const riderName = rider?.name ?? earning?.riderName ?? kpi?.riderName ?? rider99Id;
        return {
          date,
          riderName,
          rider99Id,
          cpf: rider?.cpf || earning?.cpf || kpi?.cpf || "",
          pix: rider?.pix || earning?.pix || "",
          phone: rider?.phone || earning?.phone || kpi?.phone || "",
          franchise: rider?.franchise ?? "Unassigned",
          station: rider?.ponto ?? "Unassigned",
          orders: earning?.orders ?? 0,
          kpiOrders: kpi?.completedOrders ?? null,
          onlineHours: kpi?.onlineHours ?? null,
          ar: kpi?.ar ?? null,
          tsh: kpi?.tsh ?? null,
          total: r2(earning?.total ?? 0),
          tripIncome: r2(earning?.tripIncome ?? 0),
          bonus: r2(earning?.bonus ?? 0),
          tips: r2(earning?.tips ?? 0),
          cashDebt: r2(earning?.cashDebt ?? 0),
          mealDeduction: r2(earning?.mealDeduction ?? 0),
          other: r2(earning?.other ?? 0),
          manualAdjust: r2(earning?.manualAdjust ?? 0),
          referralBonus: r2(earning?.referralBonus ?? 0),
          settleAmount: r2(earning?.settleAmount ?? 0),
          // v2(生效日起):应付 = 今日统计;之前 = settleAmount。PRO 行 0(按 完单×费率 另算)。
          payable: earning ? payableOf(earning, v2From) : 0,
          v2: isV2Date(date, v2From),
          pool: earning ? poolOfRow(earning, rider?.pool, v2From) : (rider?.pool === "pro" ? "pro" : "standard"),
          consistent: earning ? breakdownOf(earning).consistent : true,
          totalMismatch: earning?.totalMismatch ?? 0,
          paid: paidDay(date, rider99Id, riderName),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.riderName.localeCompare(b.riderName));
    // total 沿用旧字段名但按行口径求和(v2 行 = 今日统计,旧行 = settleAmount),导出与页面同源。
    const total = Math.round(rows.reduce((sum, row) => sum + row.payable, 0) * 100) / 100;
    const legacyTotal = Math.round(rows.reduce((sum, row) => sum + row.settleAmount, 0) * 100) / 100;
    return jsonResponse({ data: { franchise: statementFranchise, from, to, rows, total, legacyTotal, v2From } });
  }

  // Leader Mode: pending weekly settlements awaiting franchise review.
  if (url.searchParams.get("leaderPending") === "1") {
    const scope = await scopeFromRequest(request);
    const pending = memory.walletPayments.filter(
      (p) => p.target === "leader" && p.status === "pending" && (!scope.franchise || p.franchise === scope.franchise),
    );
    return jsonResponse({ data: pending });
  }

  // Raw payment records in a window (paid-status lookup for T+1 board).
  if (url.searchParams.get("payments") === "1") {
    const from = url.searchParams.get("from") || today();
    const to = url.searchParams.get("to") || today();
    const scope = await scopeFromRequest(request);
    const inWindow = memory.walletPayments.filter((p) => p.weekFrom >= from && p.weekTo <= to);
    return jsonResponse({ data: scope.franchise ? inWindow.filter((p) => p.franchise === scope.franchise) : inWindow });
  }

  // Weekly settlement, folded franchise → rider (the main HQ wallet view).
  if (url.searchParams.get("view") === "weekly") {
    // No explicit week → anchor to the MOST RECENT week that has settlement
    // data (T+1 imports lag the calendar), so the default view is never blank.
    let anchor = url.searchParams.get("week") || "";
    if (!anchor) {
      if (dbDirectReadEnabled()) {
        anchor =
          (await (perfMode() === "read"
            ? earningsMaxDateT()
            : callRpc<string | null>("collection_max_date", { p_collection: "riderDailyEarnings" })
          ).catch(() => null)) ?? "";
      }
      if (!anchor) {
        await refreshCollectionsFromDatabase(["riderDailyEarnings"]);
        const dates = memory.riderDailyEarnings.map((e) => e.date).filter(Boolean).sort();
        anchor = dates.length ? dates[dates.length - 1] : today();
      }
    }
    const win = weekWindow(anchor);
    const weekEarnings = await earningsWindow(win.from, win.to);
    const scope = await scopeFromRequest(request);
    const byNinetyNine = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
    const round = (n: number) => Math.round(n * 100) / 100;
    // 结算口径开关(app/lib/settlement.ts):生效周起 v2 —— 普通池应付 = 今日统计、池按行
    // account 判定、骑手付款按 99ID 匹配;之前的周逐字节沿用 v1。一个日期,一套口径。
    const rule = activeAssessmentRule();
    const v2From = settlementV2From(rule);
    const v2 = isV2Date(win.from, v2From);

    // 模式二 T3 · HqProRate: PRO settlement is NOT read from the sheet (PRO
    // rows carry zero money by design — v3.0 R6). The HQ→franchise amount is
    // DERIVED: completed orders × rate (8月 = R$12/单). Both ends of the board
    // compute it from the same config, so the two views can never disagree.
    await refreshCollectionsFromDatabase(["mallConfigs"]);
    const proRate = Number(
      memory.mallConfigs.find((c) => c.id === "mall-config")?.hqProRatePerOrder ?? 12,
    ) || 0;

    // Sum settle per rider within the window.
    // v2 下同一骑手同周可能既有普通行又有 PRO 行(中途转池),所以聚合键 = 99ID|池。
    const riderAgg = new Map<string, { name: string; rider99Id: string; franchise: string; station: string; settle: number; orders: number; days: number; cashDebt: number; pool: "standard" | "pro"; breakdown: EarningBreakdown }>();
    for (const row of weekEarnings) {
      if (row.date < win.from || row.date > win.to) continue;
      const rider = byNinetyNine.get(row.rider99Id);
      const franchise = rider?.franchise ?? "Unassigned";
      if (scope.franchise && franchise !== scope.franchise) continue;
      // 站点会话:只看本站骑手(此前站点账号会看到全网 —— 2026-08-11 补)
      if (scope.station && (rider?.ponto ?? "Unassigned") !== scope.station) continue;
      const pool = poolOfRow(row, rider?.pool, v2From);
      const key = v2 ? `${row.rider99Id}|${pool}` : row.rider99Id;
      const cur = riderAgg.get(key) ?? { name: rider?.name ?? row.rider99Id, rider99Id: row.rider99Id, franchise, station: rider?.ponto ?? "Unassigned", settle: 0, orders: 0, days: 0, cashDebt: 0, pool, breakdown: emptyBreakdown() };
      // PRO: money comes from orders × rate, never from the sheet.
      // 普通池:v2 = 今日统计(所有收入 − 现金 − 餐损,即加盟商每日实付);v1 = settleAmount。
      cur.settle += pool === "pro" ? 0 : payableOf(row, v2From);
      // 模式二(2026-08-11):PRO 的现金单欠款单独累计 —— 骑手代收的顾客
      // 现金,欠加盟商的债务;结算单必须能看见,加盟商才能净额结算。
      // 普通池:v2 的今日统计已经扣掉现金,不再单列;v1 沿用旧注释的口径不动。
      if (pool === "pro") cur.cashDebt += row.cashDebt ?? 0;
      else if (v2) cur.breakdown = addBreakdown(cur.breakdown, row);
      cur.orders += row.orders ?? 0;
      cur.days += 1;
      riderAgg.set(key, cur);
    }
    // Apply the derived PRO amount once the order total is final.
    for (const r of riderAgg.values()) {
      if (r.pool === "pro") r.settle = round(r.orders * proRate);
    }

    // Payments recorded for this window (weekly entries match the window
    // exactly; daily entries fall inside it).
    const paymentsInWindow = memory.walletPayments.filter((p) => p.weekFrom >= win.from && p.weekTo <= win.to);
    const paidToRider = new Map<string, number>();
    const paidToFranchise = new Map<string, number>();
    // 骑手已付:v2 按 99ID 归集(记录缺 99ID 时回退姓名),v1 沿用姓名。
    const riderPaidKey = (rider99Id: string, name: string) => (v2 ? rider99Id : name);
    const idByNameWeekly = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.name, r.ninetyNineId!]));
    for (const p of paymentsInWindow) {
      // 佣金付款(kind=commission)是另一条线,不算进"已付·总部→商"(2026-09-05)。
      if (isCommissionPayment(p)) continue;
      if (p.target === "rider") {
        const k = v2 ? (p.rider99Id || idByNameWeekly.get(p.refName) || p.refName) : p.refName;
        paidToRider.set(k, (paidToRider.get(k) ?? 0) + p.amount);
      } else paidToFranchise.set(p.refName, (paidToFranchise.get(p.refName) ?? 0) + p.amount);
    }
    // A PAID PIX withdrawal IS the franchise paying the rider, so it must count
    // as rider "已付" too — otherwise the settlement board and the rider wallet
    // (which already deducts paid withdrawals via computeBalance) disagree.
    // Attribute by the date the payout was confirmed (paidAt within the window).
    for (const w of memory.riderWithdrawals) {
      if (w.status !== "paid") continue;
      const paidDate = (w.paidAt ?? "").slice(0, 10);
      if (!paidDate || paidDate < win.from || paidDate > win.to) continue;
      if (scope.franchise && (w.franchise ?? "Unassigned") !== scope.franchise) continue;
      const k = v2 ? w.rider99Id || w.riderName : w.riderName;
      paidToRider.set(k, (paidToRider.get(k) ?? 0) + w.amount);
    }

    // Group into franchise → riders (each row carries its pool so the board
    // can show a PRO sub-total next to the standard one — 分池对账).
    type WeeklyRiderRow = { name: string; rider99Id: string; station: string; settle: number; orders: number; days: number; cashDebt: number; paid: number; pool: "standard" | "pro"; breakdown?: EarningBreakdown };
    const groups = new Map<string, { franchise: string; settle: number; proSettle: number; proOrders: number; proCashDebt: number; wages: number; wagesBreakdown: EarningBreakdown; riders: WeeklyRiderRow[] }>();
    for (const r of riderAgg.values()) {
      // Round each rider's settle FIRST, then sum, so the franchise total always
      // equals the sum of the displayed rider rows (no cent drift).
      const riderSettle = round(r.settle);
      const riderCashDebt = round(r.cashDebt);
      const g = groups.get(r.franchise) ?? { franchise: r.franchise, settle: 0, proSettle: 0, proOrders: 0, proCashDebt: 0, wages: 0, wagesBreakdown: emptyBreakdown(), riders: [] };
      g.settle = round(g.settle + riderSettle);
      if (r.pool === "pro") {
        g.proSettle = round(g.proSettle + riderSettle);
        g.proOrders += r.orders;
        g.proCashDebt = round(g.proCashDebt + riderCashDebt);
      } else if (v2) {
        // v2 · 骑手工资(普通池)= Σ 今日统计;拆解只做加总,供加盟商逐项对表。
        g.wages = round(g.wages + riderSettle);
        g.wagesBreakdown = sumBreakdown(g.wagesBreakdown, r.breakdown);
      }
      // 已付按 99ID(v2)/姓名(v1)归集。同一骑手转池后两行共享同一笔已付,只挂在普通行上,避免重复计入。
      const paid = r.pool === "pro" && v2 && riderAgg.has(`${r.rider99Id}|standard`) ? 0 : round(paidToRider.get(riderPaidKey(r.rider99Id, r.name)) ?? 0);
      g.riders.push({ name: r.name, rider99Id: r.rider99Id, station: r.station, settle: riderSettle, orders: r.orders, days: r.days, cashDebt: riderCashDebt, paid, pool: r.pool, ...(v2 && r.pool === "standard" ? { breakdown: r.breakdown } : {}) });
      groups.set(r.franchise, g);
    }
    // ---- 加盟商佣金(2026-09-05,仅生效周起) ----------------------------------
    // 生效周之前:下面这段完全不执行,返回体与改动前逐字节一致 —— 那些周已经按旧
    // 口径结算过了。生效周起:每个加盟商附加 commission 字段。已经付过佣金的周读
    // 付款记录里的快照(冻结),没付的周实时计算。
    const commissionActive = commissionActiveForWeek(rule, win.from);
    let liveCommission = new Map<string, FranchiseCommissionSnapshot>();
    if (commissionActive) {
      const weekKpis = await kpiWindow(win.from, win.to);
      liveCommission = computeFranchiseCommission(rule, win, weekEarnings, weekKpis);
    }
    const commissionPaidRows = paymentsInWindow.filter((p) => isCommissionPayment(p) && p.weekFrom === win.from && p.weekTo === win.to);
    const commissionFor = (franchise: string) => {
      if (!commissionActive) return undefined;
      const paid = commissionPaidRows.filter((p) => p.refName === franchise);
      const frozen = paid.find((p) => p.commission)?.commission;
      const snapshot = frozen ?? liveCommission.get(franchise);
      if (!snapshot) return undefined;
      return {
        ...snapshot,
        status: paid.length ? ("paid" as const) : ("open" as const),
        paidAmount: round(paid.reduce((sum, p) => sum + p.amount, 0)),
        paidAt: paid[0]?.paidAt ?? "",
        paymentId: paid[0]?.id ?? "",
        frozen: Boolean(frozen),
      };
    };

    const franchises = [...groups.values()]
      // v1 周不暴露 v2 字段(wages / wagesBreakdown),返回体与改动前一致。
      .map(({ wages, wagesBreakdown, ...g }) => ({ ...g, ...(v2 ? { wages, wagesBreakdown } : {}) }))
      .map((g) => ({
        ...g,
        riders: g.riders.sort((a, b) => b.settle - a.settle),
        franchisePaid: round(paidToFranchise.get(g.franchise) ?? 0),
        // 结算口径(2026-08-11 业务方定):净额 = 应结 − PRO 现金欠款。
        // 加盟商按净额打款;应结与欠款保持各自原值,账目可追溯。
        netSettle: round(g.settle - g.proCashDebt),
        ...(commissionActive ? { commission: commissionFor(g.franchise) } : {}),
      }))
      .sort((a, b) => b.settle - a.settle);
    const commissionSummary = commissionActive
      ? {
          effectiveFrom: commissionEffectiveFrom(rule),
          total: round(franchises.reduce((s, g) => s + (g.commission?.commission ?? 0), 0)),
          paidTotal: round(franchises.reduce((s, g) => s + (g.commission?.paidAmount ?? 0), 0)),
          riderPayableTotal: round(franchises.reduce((s, g) => s + (g.commission?.riderPayable ?? 0), 0)),
          minPct: rule.minCommissionPct,
        }
      : undefined;
    const grandTotal = round(franchises.reduce((s, g) => s + g.settle, 0));
    const proTotal = round(franchises.reduce((s, g) => s + g.proSettle, 0));
    const proOrdersTotal = franchises.reduce((s, g) => s + g.proOrders, 0);
    // PRO 现金欠款合计(显示用;净额 = proTotal - proCashDebtTotal 由页面呈现,
    // 不改动任何入账金额 —— 金额永远来自导入表格与费率推导,账本规则不变)
    const proCashDebtTotal = round(franchises.reduce((s, g) => s + g.proCashDebt, 0));
    const grandNetTotal = round(franchises.reduce((s, g) => s + g.netSettle, 0));

    // 倒扣待扣:某天算下来是负数 = 骑手当天不但没拿到钱,还欠了一笔。
    // 以前这种行只在显示层被过滤掉,系统里查不到"谁还欠多少"。这里按窗口外
    // 的全量算(欠款不会因为翻到下一周就消失),未核销的才算。
    const deductions = pendingDeductions(memory.riderDailyEarnings, v2From);
    const deductionTotal = round(deductions.reduce((sum, d) => sum + d.amount, 0));

    return jsonResponse({
      data: {
        week: win, franchises, grandTotal,
        // 模式二: PRO 小计 + 费率(两端同源,永远一致)+ 现金欠款合计
        proTotal, proOrdersTotal, proRate, proCashDebtTotal, grandNetTotal,
        // 倒扣待扣(派生量,全量口径)
        deductions, deductionTotal,
        payments: paymentsInWindow, scoped: Boolean(scope.franchise || scope.station),
        // 加盟商佣金汇总(仅生效周起出现;之前的周没有这个字段)
        ...(commissionSummary ? { commission: commissionSummary } : {}),
        // 结算口径版本:v2 = 应付按今日统计;页面据此切换文案与列。
        settlementVersion: v2 ? 2 : 1, v2From,
      },
    });
  }

  // Single-rider wallet (rider app).
  if (riderName || riderId) {
    // AUTH (anti-IDOR, mirrors /api/points): a rider session may only read its
    // OWN wallet — the response carries CPF/PIX/phone/balance. Reading someone
    // else's requires the finance permission (back-office).
    {
      const { sessionFromRequest } = await import("../../lib/auth-session");
      const session = await sessionFromRequest(request);
      const own =
        session &&
        memory.riders.some(
          (r) =>
            ((riderId && r.id === riderId) || (riderName && r.name === riderName)) &&
            (r.id === session.userId || r.name === session.name),
        );
      if (!own) {
        const denied = requirePermission(request, "view_finance");
        if (denied) return denied;
      }
    }
    const rider = memory.riders.find((item) => (riderId && item.id === riderId) || (riderName && item.name === riderName));
    if (!rider || !rider.ninetyNineId) {
      return jsonResponse({ data: { me: null, withdrawals: [] } });
    }
    // Direct read: only THIS rider's earning rows (a few hundred at most).
    let riderEarnings: RiderDailyEarning[];
    if (dbDirectReadEnabled()) {
      try {
        riderEarnings = perfMode() === "read"
          ? await earningsByRider99(rider.ninetyNineId)
          : await fetchRows<RiderDailyEarning>("riderDailyEarnings", [
              { op: "eq", field: "rider99Id", value: rider.ninetyNineId },
            ]);
      } catch (error) {
        console.warn(`[wallet] direct rider earnings read failed, legacy path. (${(error as Error).message})`);
        await refreshCollectionsFromDatabase(["riderDailyEarnings"]);
        riderEarnings = memory.riderDailyEarnings;
      }
    } else {
      riderEarnings = memory.riderDailyEarnings;
    }
    // v2(2026-09-06):骑手看到的每一天 = 今日统计(所有收入 − 现金 − 餐损),与加盟商每日
    // Trampay 实付同一个数;余额沿用旧字段名但按行口径求值(v2 行 = 今日统计)。
    const v2From = settlementV2From(activeAssessmentRule());
    const myRows = riderEarnings.filter((row) => row.rider99Id === rider.ninetyNineId);
    const balance = computeBalance(myRows.map((row) => ({ rider99Id: row.rider99Id, date: row.date, settleAmount: payableOf(row, v2From) })), memory.riderWithdrawals, rider.ninetyNineId, today());
    const withdrawals = memory.riderWithdrawals
      .filter((w) => w.rider99Id === rider.ninetyNineId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    // 最近 31 天逐日明细 + 每日已付状态(加盟商标记),给 App 钱包页做"每日结算单"。
    const sinceDaily = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);
    const daily = myRows
      .filter((row) => row.date >= sinceDaily && row.account !== "pro")
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((row) => ({
        date: row.date,
        orders: row.orders ?? 0,
        payable: payableOf(row, v2From),
        ...breakdownOf(row),
        paid: memory.walletPayments.some((p) => p.weekFrom === row.date && p.weekTo === row.date && paymentIsForRider(p, rider.ninetyNineId!, rider.name)),
      }));
    // 提现停用(v2):每日由加盟商 Trampay 打款;已提交的历史提现照常展示/处理。
    const withdrawalsEnabled = !isV2Date(today(), v2From);
    return jsonResponse({
      data: {
        me: { riderId: rider.id, name: rider.name, cpf: rider.cpf ?? "", pix: rider.pix ?? "", phone: rider.phone ?? "", isComplete: !!rider.cpf && !!rider.pix && !!rider.phone, station: rider.ponto, franchise: rider.franchise, ...balance },
        withdrawals,
        daily,
        withdrawalsEnabled,
        settlementVersion: withdrawalsEnabled ? 1 : 2,
      },
    });
  }

  // HQ / franchise back-office view.
  let riders = memory.riders.filter((rider) => rider.ninetyNineId);
  if (franchiseScope) riders = riders.filter((rider) => (rider.franchise ?? "Unassigned") === franchiseScope);
  if (stationScope) riders = riders.filter((rider) => (rider.ponto ?? "Unassigned") === stationScope);

  // Direct read: per-rider settled totals come from ONE grouped aggregate in
  // the database (earnings_settled_totals) instead of summing the whole
  // earnings collection in memory for every rider.
  let settledBy: Map<string, number> | null = null;
  if (dbDirectReadEnabled()) {
    settledBy = await (perfMode() === "read"
      ? earningsSettledTotalsT(today())
      : callRpc<Array<{ rider99Id: string; settled: number }>>("earnings_settled_totals", { p_today: today() })
    )
      .then((rows) => new Map(rows.map((r) => [r.rider99Id, Number(r.settled) || 0])))
      .catch((error) => {
        console.warn(`[wallet] earnings_settled_totals unavailable, legacy path. (${(error as Error).message})`);
        return null;
      });
  }
  if (!settledBy) await refreshCollectionsFromDatabase(["riderDailyEarnings"]);
  const balanceFor = (nineId: string) => {
    if (!settledBy) return computeBalance(memory.riderDailyEarnings, memory.riderWithdrawals, nineId, today());
    const settled = settledBy.get(nineId) ?? 0;
    const held = memory.riderWithdrawals.filter((w) => w.rider99Id === nineId && w.status === "requested").reduce((sum, w) => sum + w.amount, 0);
    const paid = memory.riderWithdrawals.filter((w) => w.rider99Id === nineId && w.status === "paid").reduce((sum, w) => sum + w.amount, 0);
    return { settled, held, paid, available: Math.max(0, settled - held - paid) };
  };

  const balances = riders
    .map((rider) => ({
      riderId: rider.id,
      name: rider.name,
      rider99Id: rider.ninetyNineId!,
      pix: rider.pix,
      franchise: rider.franchise ?? "Unassigned",
      station: rider.ponto ?? "Unassigned",
      ...balanceFor(rider.ninetyNineId!),
    }))
    .filter((row) => row.settled > 0 || row.paid > 0 || row.held > 0)
    .sort((a, b) => b.available - a.available);

  let withdrawals = memory.riderWithdrawals.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  if (franchiseScope) withdrawals = withdrawals.filter((w) => w.franchise === franchiseScope);
  if (stationScope) withdrawals = withdrawals.filter((w) => w.station === stationScope);

  // HQ settles with FRANCHISES: payable = riders' settled − franchise paid out.
  const franchiseMap = new Map<string, { settled: number; paid: number; held: number }>();
  for (const row of balances) {
    const entry = franchiseMap.get(row.franchise) ?? { settled: 0, paid: 0, held: 0 };
    entry.settled += row.settled;
    entry.paid += row.paid;
    entry.held += row.held;
    franchiseMap.set(row.franchise, entry);
  }
  const franchises = [...franchiseMap.entries()].map(([key, value]) => ({
    franchise: key,
    settled: value.settled,
    paidOut: value.paid,
    pendingRequests: value.held,
    payable: Math.max(0, value.settled - value.paid),
  }));

  return jsonResponse({ data: { balances, withdrawals, franchises } });
}

type Body =
  | { action: "requestWithdrawal"; riderId?: string; riderName?: string; amount: number }
  | { action: "confirmPayment"; withdrawalId: string; note?: string }
  | { action: "rejectWithdrawal"; withdrawalId: string; note?: string }
  | { action: "recordPayment"; target: "franchise" | "rider"; refName: string; franchise?: string; amount: number; period?: "weekly" | "daily"; weekFrom: string; weekTo: string; note?: string }
  | { action: "generateLeaderSettlements"; franchise: string; week: string }
  | { action: "confirmLeaderPayment"; paymentId: string; note?: string }
  | { action: "payCommission"; franchise: string; weekFrom: string; weekTo: string; note?: string };

async function handlePost(request: Request) {
  const peek = (await request.clone().json().catch(() => ({}))) as { action?: string };
  const forbidden =
    peek.action === "requestWithdrawal"
      ? requirePermission(request, "use_rider_app") && requirePermission(request, "view_finance")
      : requirePermission(request, "view_finance");
  if (forbidden) return forbidden;

  await refreshCollectionsFromDatabase(COLLECTIONS);
  const body = (await request.json().catch(() => ({}))) as Partial<Body> & Record<string, unknown>;
  const actor = roleFromRequest(request);

  switch (body.action) {
    case "generateLeaderSettlements": {
      // Leader Mode weekly settlement (docs/leader-mode-design.md §3, P2):
      // closed assessments × settlement components → ONE pending payment per
      // station per week. Idempotent by deterministic id; franchisee confirms
      // via the regular payment review before any money moves.
      const franchiseName = String(body.franchise ?? "");
      const week = String(body.week ?? "");
      if (!/^\d{4}-W\d{2}$/.test(week) || !franchiseName) {
        return jsonResponse({ error: "week (YYYY-Www) and franchise are required" }, { status: 400 });
      }
      const franchiseRec = memory.franchises.find((f) => f.name === franchiseName && f.leaderMode === true);
      if (!franchiseRec) return jsonResponse({ error: "franchise not found or leaderMode off" }, { status: 404 });

      const { listAssessments, markWeekSettled } = await import("../../lib/server/db/leader-repo");
      const { computeLeaderSettlement, defaultLeaderSettlementRules, weekIdToDates } = await import("../../lib/leader-mode");

      const closed = (await listAssessments(franchiseName, week)).filter((a) => a.state === "closed");
      if (closed.length === 0) {
        return jsonResponse({ error: "no closed assessments for this week — close the week first" }, { status: 409 });
      }

      const rules = franchiseRec.leaderSettlementRules ?? defaultLeaderSettlementRules;
      const dates = weekIdToDates(week);
      const generated: Array<{ station: string; totalBRL: number; id: string }> = [];
      const skippedNoPayee: string[] = [];
      const alreadyGenerated: string[] = [];

      for (const assessment of closed) {
        const station = memory.pontos.find((p) => p.id === assessment.stationId);
        // Payee resolution (design D1 refinement): the leader IS a rider, so
        // fall back to their rider Pix — station-level overrides (CNPJ/Pix)
        // only when explicitly set. Order: CNPJ > station Pix > rider record
        // Pix > latest T+1 earnings Pix.
        let payee = station?.leaderCnpj?.trim() || station?.leaderPixKey?.trim() || "";
        if (!payee && station?.leaderRiderId) {
          const leaderRider = memory.riders.find((r) => r.id === station.leaderRiderId);
          payee = leaderRider?.pix?.trim() ?? "";
          if (!payee && leaderRider?.ninetyNineId) {
            const earn = memory.riderDailyEarnings.find(
              (row) => row.rider99Id === leaderRider.ninetyNineId && String(row.pix ?? "").trim(),
            );
            payee = String(earn?.pix ?? "").trim();
          }
        }
        if (!payee) {
          skippedNoPayee.push(assessment.stationName);
          continue;
        }
        const id = `lp-${assessment.stationId}-${week}`;
        if (memory.walletPayments.some((p) => p.id === id)) {
          alreadyGenerated.push(assessment.stationName);
          continue;
        }
        const { lines, totalBRL } = computeLeaderSettlement(assessment, rules);
        const breakdown = lines
          .map((l) => `${l.label.pt} v${l.version}: ${l.orders}×R$${l.amountBRL.toFixed(2)}${l.skippedReason ? ` (${l.skippedReason})` : ""} = R$${l.totalBRL.toFixed(2)}`)
          .join(" · ");
        memory.walletPayments.unshift({
          id,
          target: "leader",
          refName: assessment.stationName,
          franchise: franchiseName,
          amount: totalBRL,
          period: "weekly",
          weekFrom: dates[0] ?? "",
          weekTo: dates[6] ?? "",
          note: `[LeaderMode ${week}] ${breakdown} — payee: ${payee}`,
          paidBy: "",
          paidAt: "",
          status: "pending",
        });
        generated.push({ station: assessment.stationName, totalBRL, id });
      }

      if (generated.length > 0 || alreadyGenerated.length === closed.length - skippedNoPayee.length) {
        await markWeekSettled(franchiseName, week, new Date().toISOString());
      }
      appendServerAudit({
        actor,
        action: "LEADER_SETTLEMENT_GENERATED",
        entity: "WalletPayment",
        entityId: `${franchiseName}:${week}`,
        detail: `组长周结生成：${generated.length} 张待复核付款单（合计 R$${generated.reduce((s, g) => s + g.totalBRL, 0).toFixed(2)}）；无收款信息跳过 ${skippedNoPayee.length}；已存在 ${alreadyGenerated.length}。`,
        risk: "Medium",
      });
      await flushPendingToDatabase();
      return jsonResponse({ data: { week, franchise: franchiseName, generated, skippedNoPayee, alreadyGenerated } });
    }

    case "confirmLeaderPayment": {
      // Franchise review gate: pending → paid after the PIX transfer is done.
      const paymentId = String(body.paymentId ?? "");
      const index = memory.walletPayments.findIndex(
        (p) => p.id === paymentId && p.target === "leader" && p.status === "pending",
      );
      if (index === -1) return jsonResponse({ error: "pending leader payment not found" }, { status: 404 });
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const confirmed: WalletPayment = {
        ...memory.walletPayments[index],
        status: "paid",
        paidBy: actor,
        paidAt: stamp,
        note: body.note ? `${memory.walletPayments[index].note} — ${String(body.note)}` : memory.walletPayments[index].note,
      };
      memory.walletPayments[index] = confirmed;
      appendServerAudit({
        actor,
        action: "LEADER_SETTLEMENT_PAID",
        entity: "WalletPayment",
        entityId: paymentId,
        detail: `组长结算确认支付：${confirmed.refName} R$${confirmed.amount.toFixed(2)}（${confirmed.weekFrom}~${confirmed.weekTo}）。`,
        risk: "Medium",
      });
      await flushPendingToDatabase();
      return jsonResponse({ data: confirmed });
    }

    case "payCommission": {
      // 总部 → 加盟商 · 周佣金(2026-09-05)。金额由服务端按当周数据计算,不接受
      // 客户端传入;一周一个加盟商只能付一次(幂等 409);写入即冻结快照。
      const franchiseName = String(body.franchise ?? "").trim();
      const weekFrom = String(body.weekFrom ?? "");
      const weekTo = String(body.weekTo ?? "");
      if (!franchiseName) return jsonResponse({ error: "请选择加盟商" }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(weekTo)) return jsonResponse({ error: "结算周期无效" }, { status: 400 });
      const win = weekWindow(weekFrom);
      if (win.from !== weekFrom || win.to !== weekTo) return jsonResponse({ error: "结算周期必须是完整自然周（周一至周日）" }, { status: 400 });
      const scope = await scopeFromRequest(request);
      if (scope.franchise || scope.station) return jsonResponse({ error: "仅总部可支付加盟商佣金" }, { status: 403 });
      const rule = activeAssessmentRule();
      if (!commissionActiveForWeek(rule, win.from)) {
        return jsonResponse({ error: `该周早于佣金口径生效日 ${commissionEffectiveFrom(rule)}，已按旧口径结算，不再变动。`, code: "before_effective" }, { status: 409 });
      }
      const duplicate = memory.walletPayments.find((p) => isCommissionPayment(p) && p.refName === franchiseName && p.weekFrom === win.from && p.weekTo === win.to);
      if (duplicate) return jsonResponse({ error: "该加盟商本周佣金已支付", code: "already_paid", payment: duplicate }, { status: 409 });
      const weekEarnings = await earningsWindow(win.from, win.to);
      const weekKpis = await kpiWindow(win.from, win.to);
      const snapshot = computeFranchiseCommission(rule, win, weekEarnings, weekKpis).get(franchiseName);
      if (!snapshot) return jsonResponse({ error: "该加盟商本周没有普通池结算数据" }, { status: 404 });
      if (snapshot.commission <= 0) return jsonResponse({ error: "本周佣金为 0，无需支付" }, { status: 409 });
      const payment: WalletPayment = {
        id: makeServerId("pay", memory.walletPayments.length + 1),
        target: "franchise",
        kind: "commission",
        refName: franchiseName,
        franchise: franchiseName,
        amount: snapshot.commission,
        period: "weekly",
        weekFrom: win.from,
        weekTo: win.to,
        note: String(body.note ?? "").slice(0, 200),
        paidBy: actor,
        paidAt: nowStamp(),
        commission: snapshot,
      };
      memory.walletPayments.unshift(payment);
      appendServerAudit({
        actor,
        action: "FRANCHISE_COMMISSION_PAID",
        entity: "WalletPayment",
        entityId: payment.id,
        detail: `加盟商佣金：${franchiseName} ${win.from}~${win.to} R$${snapshot.commission.toFixed(2)}（行程收入 R$${snapshot.tripIncome.toFixed(2)} × ${snapshot.pct}%）。`,
        risk: "Medium",
      });
      await flushPendingToDatabase();
      return jsonResponse({ data: payment }, { status: 201 });
    }

    case "recordPayment": {
      const { target, refName, franchise = "", period = "weekly", weekFrom, weekTo, note = "" } = body as {
        target: "franchise" | "rider"; refName?: string; franchise?: string; period?: "weekly" | "daily"; weekFrom?: string; weekTo?: string; note?: string;
      };
      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (target !== "franchise" && target !== "rider") return jsonResponse({ error: "target inválido" }, { status: 400 });
      if (!refName?.trim() || !Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: "请填写有效的对象与金额" }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekFrom ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(weekTo ?? "")) return jsonResponse({ error: "结算周期无效" }, { status: 400 });

      // Over-payment guard: a payment may not exceed what is still owed for this
      // target in the window (应结 − 已付). Keeps 已付 ≤ 应结.
      // 口径与周结算板完全同源(payableOf / poolOfRow / 完单×费率),两边不会再出现
      // "看板一个数、校验另一个数"(2026-09-05 实测过 1304.08 vs 1382.62)。
      const v2From = settlementV2From(activeAssessmentRule());
      const payWeekV2 = isV2Date(weekFrom!, v2From);
      const riderRef = (body as { rider99Id?: string }).rider99Id ? String((body as { rider99Id?: string }).rider99Id) : "";
      await refreshCollectionsFromDatabase(["mallConfigs"]);
      const proRateGuard = Number(memory.mallConfigs.find((c) => c.id === "mall-config")?.hqProRatePerOrder ?? 12) || 0;
      {
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const byNN = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
        let settleTotal = 0;
        let proOrders = 0;
        for (const row of memory.riderDailyEarnings) {
          if (row.date < weekFrom! || row.date > weekTo!) continue;
          const rider = byNN.get(row.rider99Id);
          const fname = rider?.franchise ?? "Unassigned";
          const rname = rider?.name ?? row.riderName ?? row.rider99Id;
          if (target === "franchise" && fname !== refName.trim()) continue;
          if (target === "rider" && (riderRef ? row.rider99Id !== riderRef : rname !== refName.trim())) continue;
          if (poolOfRow(row, rider?.pool, v2From) === "pro") proOrders += row.orders ?? 0;
          else settleTotal = r2(settleTotal + payableOf(row, v2From));
        }
        settleTotal = r2(settleTotal + proOrders * proRateGuard);
        let alreadyPaid = 0;
        for (const p of memory.walletPayments) {
          if (isCommissionPayment(p)) continue; // 佣金不是结算款
          if (p.target !== target) continue;
          if (target === "rider" ? !paymentIsForRider(p, riderRef, refName.trim()) : p.refName !== refName.trim()) continue;
          if (p.weekFrom < weekFrom! || p.weekTo > weekTo!) continue;
          alreadyPaid = r2(alreadyPaid + p.amount);
        }
        if (target === "rider") {
          for (const w of memory.riderWithdrawals) {
            if (w.status !== "paid" || (riderRef ? w.rider99Id !== riderRef : w.riderName !== refName.trim())) continue;
            const pd = (w.paidAt ?? "").slice(0, 10);
            if (pd < weekFrom! || pd > weekTo!) continue;
            alreadyPaid = r2(alreadyPaid + w.amount);
          }
        }
        const outstanding = r2(settleTotal - alreadyPaid);
        if (amount > outstanding + 0.01) {
          return jsonResponse({ error: `金额超过待付 R$ ${outstanding.toFixed(2)}（应结 ${settleTotal.toFixed(2)} − 已付 ${alreadyPaid.toFixed(2)}）。`, code: "amount_exceeds_due", outstanding, settle: settleTotal, alreadyPaid }, { status: 409 });
        }
      }
      const payment: WalletPayment = {
        id: makeServerId("pay", memory.walletPayments.length + 1),
        target,
        refName: refName.trim(),
        ...(target === "rider" && riderRef ? { rider99Id: riderRef } : {}),
        franchise: (target === "franchise" ? refName : franchise).trim(),
        amount,
        period: period === "daily" ? "daily" : "weekly",
        weekFrom: weekFrom!,
        weekTo: weekTo!,
        note: String(note).slice(0, 200),
        paidBy: actor,
        paidAt: nowStamp(),
      };
      memory.walletPayments.unshift(payment);
      // HQ→franchise payment also draws down the franchise prepaid balance,
      // and CASCADES: every rider of that franchise with unpaid settle in the
      // window is marked paid for the remaining amount (单笔覆盖整周).
      let cascaded = 0;
      if (target === "franchise") {
        // DECOUPLED (2026-08-06): recording a payment no longer draws down the
        // franchise prepaid-deposit ledger. Settlement is paid daily outside
        // the system; the auto-drawdown (with no top-ups ever recorded) was
        // the sole cause of the phantom negative balances (-R$123k). Deposit
        // movements now happen ONLY through explicit top-up/adjust entries.
        const byNinetyNine = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.ninetyNineId!, r]));
        const idByName = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [r.name, r.ninetyNineId!]));
        // key = v2: 99ID / v1: 姓名;金额口径同看板(普通池 payableOf,PRO 完单×费率)。
        const settleByRider = new Map<string, number>();
        const nameOfKey = new Map<string, string>();
        for (const row of memory.riderDailyEarnings) {
          if (row.date < payment.weekFrom || row.date > payment.weekTo) continue;
          const rider = byNinetyNine.get(row.rider99Id);
          if ((rider?.franchise ?? "Unassigned") !== refName.trim()) continue;
          const name = rider?.name ?? row.riderName ?? row.rider99Id;
          const key = payWeekV2 ? row.rider99Id : name;
          nameOfKey.set(key, name);
          const amount = poolOfRow(row, rider?.pool, v2From) === "pro" ? (row.orders ?? 0) * proRateGuard : payableOf(row, v2From);
          settleByRider.set(key, Math.round(((settleByRider.get(key) ?? 0) + amount) * 100) / 100);
        }
        const paidByRider = new Map<string, number>();
        for (const p of memory.walletPayments) {
          if (p.target !== "rider" || p.weekFrom < payment.weekFrom || p.weekTo > payment.weekTo) continue;
          const key = payWeekV2 ? (p.rider99Id || idByName.get(p.refName) || p.refName) : p.refName;
          paidByRider.set(key, (paidByRider.get(key) ?? 0) + p.amount);
        }
        // 已付 PIX 提现也是"加盟商已付给骑手"(与看板同口径,之前这里漏了 → 级联双标)。
        for (const w of memory.riderWithdrawals) {
          if (w.status !== "paid") continue;
          const pd = (w.paidAt ?? "").slice(0, 10);
          if (pd < payment.weekFrom || pd > payment.weekTo) continue;
          const key = payWeekV2 ? w.rider99Id || w.riderName : w.riderName;
          paidByRider.set(key, (paidByRider.get(key) ?? 0) + w.amount);
        }
        // Distribute the ACTUAL franchise payment across riders in proportion to
        // their unpaid settle — never more than a rider's remaining, never more
        // than the franchise actually paid. A partial franchise payment now
        // produces partial rider payments (previously it marked everyone full).
        const r2c = (n: number) => Math.round(n * 100) / 100;
        const remainingByRider = [...settleByRider.entries()]
          .map(([name, settle]) => [name, r2c(settle - (paidByRider.get(name) ?? 0))] as [string, number])
          .filter(([, remaining]) => remaining > 0);
        const totalRemaining = r2c(remainingByRider.reduce((sum, [, remaining]) => sum + remaining, 0));
        const pool = Math.min(amount, totalRemaining);
        let distributed = 0;
        remainingByRider.forEach(([key, remaining], index) => {
          const isLast = index === remainingByRider.length - 1;
          const raw = isLast ? r2c(pool - distributed) : r2c((pool * remaining) / totalRemaining);
          const share = Math.min(raw, remaining);
          if (share <= 0) return;
          distributed = r2c(distributed + share);
          cascaded += 1;
          memory.walletPayments.unshift({
            id: makeServerId("pay", memory.walletPayments.length + 1),
            target: "rider",
            refName: nameOfKey.get(key) ?? key,
            ...(payWeekV2 ? { rider99Id: key } : {}),
            franchise: refName.trim(),
            amount: share,
            period: payment.period,
            weekFrom: payment.weekFrom,
            weekTo: payment.weekTo,
            note: `随加盟商付款 ${payment.id}`,
            paidBy: actor,
            paidAt: payment.paidAt,
          });
        });
      }
      appendServerAudit({ actor, action: "WALLET_PAYMENT_RECORDED", entity: "WalletPayment", entityId: payment.id, detail: `${target} ${refName} R$${amount.toFixed(2)} (${payment.period}, ${weekFrom}~${weekTo})${note ? ` — ${note}` : ""}.`, risk: "Medium" });
      return jsonResponse({ data: payment }, { status: 201 });
    }

    case "requestWithdrawal": {
      // v2(2026-09-06 业务方定):App 提现停用,每日由加盟商 Trampay 打款为准。
      // 已提交的提现不受影响(confirmPayment / rejectWithdrawal 照常)。
      if (isV2Date(today(), settlementV2From(activeAssessmentRule()))) {
        return jsonResponse({ error: "Saque pelo app desativado — o pagamento é feito diariamente pela franquia via PIX.", code: "withdrawals_disabled" }, { status: 409 });
      }
      const { riderId, riderName } = body as { riderId?: string; riderName?: string };
      // Identity from the AUTHENTICATED session when present (closes IDOR — a
      // rider can only withdraw their own balance); body fallback for demo only.
      const { sessionFromRequest } = await import("../../lib/auth-session");
      const session = await sessionFromRequest(request);
      // Progressive login: an unverified Google guest must confirm phone + CPF
      // before moving money. Clear message instead of a confusing "not found".
      if (session && session.verified === false) {
        return jsonResponse({ error: "Confirme seu telefone e CPF para solicitar saque.", code: "needs_verification" }, { status: 403 });
      }
      const rider = session
        ? memory.riders.find((item) => item.id === session.userId || item.name === session.name)
        : memory.riders.find((item) => (riderId && item.id === riderId) || (riderName && item.name === riderName));
      if (!rider || !rider.ninetyNineId) return jsonResponse({ error: "Cadastro não encontrado." }, { status: 404 });

      // Profile gate: PIX payouts require a complete CPF + PIX on file.
      if (!rider.cpf || !rider.pix) {
        return jsonResponse({ error: "Complete CPF e chave PIX no seu perfil para solicitar saque.", code: "profile_incomplete" }, { status: 422 });
      }

      const balance = computeBalance(memory.riderDailyEarnings, memory.riderWithdrawals, rider.ninetyNineId, today());
      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0) return jsonResponse({ error: "Valor inválido." }, { status: 400 });
      if (amount > balance.available) {
        return jsonResponse({ error: `Saldo insuficiente: disponível R$ ${balance.available.toFixed(2)} (ganhos até ontem).` }, { status: 409 });
      }
      if (memory.riderWithdrawals.some((w) => w.rider99Id === rider.ninetyNineId && w.status === "requested")) {
        return jsonResponse({ error: "Você já tem um saque em análise. Aguarde a confirmação." }, { status: 409 });
      }

      const withdrawal: RiderWithdrawal = {
        id: makeServerId("wd", memory.riderWithdrawals.length + 1),
        riderId: rider.id,
        riderName: rider.name,
        rider99Id: rider.ninetyNineId,
        pix: rider.pix || rider.cpf,
        franchise: rider.franchise ?? "Unassigned",
        station: rider.ponto ?? "Unassigned",
        amount,
        status: "requested",
        requestedAt: nowStamp(),
      };
      memory.riderWithdrawals.unshift(withdrawal);

      appendServerAudit({
        actor,
        action: "WITHDRAWAL_REQUESTED",
        entity: "RiderWithdrawal",
        entityId: withdrawal.id,
        detail: `${rider.name} requested R$${amount.toFixed(2)} via PIX ${withdrawal.pix} (franchise ${withdrawal.franchise}).`,
        risk: "Medium",
      });

      return jsonResponse({ data: { withdrawal, balance: { ...balance, held: balance.held + amount, available: balance.available - amount } } }, { status: 201 });
    }

    case "confirmPayment":
    case "rejectWithdrawal": {
      const { withdrawalId, note = "" } = body as { withdrawalId?: string; note?: string };
      const index = memory.riderWithdrawals.findIndex((w) => w.id === withdrawalId);
      if (index === -1) return jsonResponse({ error: "withdrawal not found" }, { status: 404 });
      const current = memory.riderWithdrawals[index];
      if (current.status !== "requested") return jsonResponse({ error: `withdrawal is already ${current.status}` }, { status: 409 });

      const stamp = nowStamp();
      if (body.action === "confirmPayment") {
        memory.riderWithdrawals[index] = { ...current, status: "paid", paidAt: stamp, paidBy: actor, note: String(note).slice(0, 200) };
        // DECOUPLED (2026-08-06): confirming a payout no longer auto-deducts
        // the franchise prepaid-deposit ledger (daily out-of-system payouts +
        // never-recorded top-ups made every balance spuriously negative).
        // Deposit movements now happen only through explicit top-up/adjust.
        await sendPushToRider(current.riderName, "Pagamento enviado 💰", `Seu saque de R$ ${current.amount.toFixed(2)} foi pago via PIX. Confira seu extrato.`, "/rider-app/wallet");
      } else {
        memory.riderWithdrawals[index] = { ...current, status: "rejected", rejectedAt: stamp, note: String(note).slice(0, 200) };
      }

      appendServerAudit({
        actor,
        action: body.action === "confirmPayment" ? "WITHDRAWAL_PAID" : "WITHDRAWAL_REJECTED",
        entity: "RiderWithdrawal",
        entityId: withdrawalId ?? "",
        detail: `${current.riderName} R$${current.amount.toFixed(2)} PIX ${current.pix} — ${body.action === "confirmPayment" ? "paid and balance reduced" : "rejected, hold released"}.`,
        risk: "Medium",
      });

      return jsonResponse({ data: memory.riderWithdrawals[index] });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}

// Ensure mutations are durably written before the serverless instance can freeze.
export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
