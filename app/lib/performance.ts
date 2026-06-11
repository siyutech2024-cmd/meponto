/**
 * T+1 rider performance (KPI) domain model.
 *
 * Source: Eastwind 报表 → 骑手报表 → 按骑手 (T+1). Columns observed live:
 * 骑手ID 骑手姓名 电话号码 骑手的身份证 城市 在线时长 完单数量 报名的班次数量
 * 报名的班次总时长 班次内实际在线时长 %TSH "%TSH in Critical Shifts" AR CAA Overtime
 *
 * KPI semantics:
 * - %TSH          = in-shift online hours / signed shift hours (schedule adherence)
 * - %TSH Critical = same, restricted to critical (重点) shifts; N/A when none
 * - AR            = acceptance rate of dispatched orders
 * - CAA           = cancellation after acceptance rate
 * - Overtime      = overtime delivery rate
 */

export type RiderDailyKpi = {
  id: string; // kpi-<date>-<rider99Id>
  date: string; // YYYY-MM-DD
  rider99Id: string;
  riderName: string;
  phone: string;
  cpf: string;
  city: string;
  onlineHours: number;
  completedOrders: number;
  signedShifts: number;
  signedShiftHours: number;
  inShiftOnlineHours: number;
  /** Percentages stored as 0-100; null = N/A in the source report. */
  tsh: number | null;
  tshCritical: number | null;
  ar: number | null;
  caa: number | null;
  overtime: number | null;
  importedAt: string;
};

export const riderDailyKpis: RiderDailyKpi[] = [];

/**
 * T+1 rider earnings — Eastwind "Ganhos do entregador parceiro" export plus
 * the operator's settlement columns (pix / order count / final amount).
 * Settlement formula observed in the sheet: 金额 = 今日统计 + order × 2.5.
 */
export type RiderDailyEarning = {
  id: string; // earn-<date>-<rider99Id>
  date: string;
  rider99Id: string;
  riderName: string;
  phone: string;
  cpf: string;
  city: string;
  total: number; // 今日统计(R$)
  tripIncome: number; // 行程收入(R$)
  cashDebt: number; // 现金单欠款(R$)
  mealDeduction: number; // 餐损扣款(R$)
  bonus: number; // 奖励(R$)
  other: number; // 其他(R$)
  tips: number; // 小费(R$)
  manualAdjust: number; // 人工调整(R$)
  referralBonus: number; // 推荐奖励(R$)
  pix: string;
  orders: number; // 完单（结算口径）
  settleAmount: number; // 金额(R$) — 最终结算
  importedAt: string;
};

export const riderDailyEarnings: RiderDailyEarning[] = [];

export type EarningAggregate = {
  key: string;
  riders: number;
  orders: number;
  total: number;
  tripIncome: number;
  cashDebt: number;
  mealDeduction: number;
  bonus: number;
  tips: number;
  manualAdjust: number;
  referralBonus: number;
  settleAmount: number;
};

export function aggregateEarnings(rows: RiderDailyEarning[], key: string): EarningAggregate {
  const sum = (field: keyof RiderDailyEarning) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  return {
    key,
    riders: rows.length,
    orders: sum("orders"),
    total: sum("total"),
    tripIncome: sum("tripIncome"),
    cashDebt: sum("cashDebt"),
    mealDeduction: sum("mealDeduction"),
    bonus: sum("bonus"),
    tips: sum("tips"),
    manualAdjust: sum("manualAdjust"),
    referralBonus: sum("referralBonus"),
    settleAmount: sum("settleAmount"),
  };
}

const PERCENT_FIELDS = ["tsh", "tshCritical", "ar", "caa", "overtime"] as const;
const HOUR_FIELDS = ["onlineHours", "completedOrders", "signedShifts", "signedShiftHours", "inShiftOnlineHours"] as const;

type Draft = Partial<RiderDailyKpi> & { numbers: number[]; percents: (number | null)[] };

/**
 * Tolerant parser: accepts a full-page copy of the Eastwind "按骑手" report
 * (one value per line) as well as tab/comma separated rows from 下载数据.
 */
export function parseEastwindRiderKpis(raw: string, date: string): RiderDailyKpi[] {
  const tokens = raw
    .split(/[\t\n\r,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const results: RiderDailyKpi[] = [];
  let draft: Draft | null = null;
  const importedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

  const finalize = () => {
    if (!draft || !draft.rider99Id) return;
    const numbers = draft.numbers;
    const percents = draft.percents;
    const record: RiderDailyKpi = {
      id: `kpi-${date}-${draft.rider99Id}`,
      date,
      rider99Id: draft.rider99Id,
      riderName: (draft.riderName ?? "").trim() || "Desconhecido",
      phone: draft.phone ?? "",
      cpf: draft.cpf ?? "",
      city: draft.city ?? "",
      onlineHours: numbers[0] ?? 0,
      completedOrders: numbers[1] ?? 0,
      signedShifts: numbers[2] ?? 0,
      signedShiftHours: numbers[3] ?? 0,
      inShiftOnlineHours: numbers[4] ?? 0,
      tsh: percents[0] ?? null,
      tshCritical: percents[1] ?? null,
      ar: percents[2] ?? null,
      caa: percents[3] ?? null,
      overtime: percents[4] ?? null,
      importedAt,
    };
    if (record.signedShifts > 0 || record.onlineHours > 0 || record.completedOrders > 0) {
      results.push(record);
    }
  };

  for (const token of tokens) {
    // A 15+ digit number starts a new rider record (Eastwind rider id).
    if (/^\d{15,}$/.test(token)) {
      finalize();
      draft = { rider99Id: token, numbers: [], percents: [] };
      continue;
    }
    if (!draft) continue;

    // Percentage or N/A → percent sequence.
    if (/^N\/?A$/i.test(token)) {
      draft.percents.push(null);
      continue;
    }
    // Accept both 97.1% and Brazilian 97,1% formats.
    const percentMatch = token.match(/^(\d+(?:[.,]\d+)?)%$/);
    if (percentMatch) {
      draft.percents.push(Number(percentMatch[1].replace(",", ".")));
      continue;
    }

    // Phone: 10-11 digits before the CPF (11 digits). Disambiguate by order.
    if (/^\d{10,11}$/.test(token)) {
      if (!draft.phone) {
        draft.phone = token;
      } else if (!draft.cpf) {
        draft.cpf = token;
      } else {
        const value = Number(token);
        if (Number.isFinite(value) && draft.numbers.length < HOUR_FIELDS.length) draft.numbers.push(value);
      }
      continue;
    }

    // Plain numbers → metric sequence (hours may be decimal).
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      if (draft.numbers.length < HOUR_FIELDS.length) draft.numbers.push(Number(token));
      continue;
    }

    // Known city names (Chinese or text) after CPF; otherwise part of the name.
    if (!draft.phone) {
      draft.riderName = draft.riderName ? `${draft.riderName} ${token}` : token;
    } else if (!draft.city && /[一-龥]|^S[aã]o/i.test(token)) {
      draft.city = token;
    }
  }
  finalize();

  return results;
}

export type KpiAggregate = {
  key: string;
  riders: number;
  onlineHours: number;
  completedOrders: number;
  signedShifts: number;
  signedShiftHours: number;
  inShiftOnlineHours: number;
  tsh: number | null; // weighted by signed shift hours
  ar: number | null; // simple average over riders that have the metric
  caa: number | null;
  overtime: number | null;
};

export function aggregateKpis(rows: RiderDailyKpi[], key: string): KpiAggregate {
  const sum = (field: (typeof HOUR_FIELDS)[number]) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
  const avg = (field: (typeof PERCENT_FIELDS)[number]) => {
    const values = rows.map((row) => row[field]).filter((value): value is number => value !== null && value !== undefined);
    if (values.length === 0) return null;
    return values.reduce((total, value) => total + value, 0) / values.length;
  };

  const signedShiftHours = sum("signedShiftHours");
  const inShift = sum("inShiftOnlineHours");

  return {
    key,
    riders: rows.length,
    onlineHours: sum("onlineHours"),
    completedOrders: sum("completedOrders"),
    signedShifts: sum("signedShifts"),
    signedShiftHours,
    inShiftOnlineHours: inShift,
    tsh: signedShiftHours > 0 ? (inShift / signedShiftHours) * 100 : avg("tsh"),
    ar: avg("ar"),
    caa: avg("caa"),
    overtime: avg("overtime"),
  };
}
