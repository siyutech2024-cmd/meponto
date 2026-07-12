/**
 * Rider tasks/missions (任务). HQ (运营) configures goal + reward + period; the
 * rider app shows live progress computed from REAL metrics, and a met task can
 * be claimed once per period — the reward lands as an append-only points entry.
 */

export type TaskMetric = "completed_orders" | "checkins" | "redemptions" | "slot_enrollments";
export type TaskPeriod = "weekly" | "monthly";
export type TaskAudience = "rider" | "all";

export type AppTask = {
  id: string;
  title: string;
  description?: string;
  metric: TaskMetric;
  target: number;
  rewardPoints: number;
  period: TaskPeriod;
  audience: TaskAudience;
  enabled: boolean;
  createdAt: string;
  createdBy?: string;
};

/** One claim per rider per task per period (idempotent reward). */
export type TaskClaim = {
  id: string; // `${taskId}::${riderId}::${periodKey}`
  taskId: string;
  riderId: string;
  periodKey: string;
  rewardPoints: number;
  claimedAt: string;
};

export const taskMetricLabel: Record<TaskMetric, string> = {
  completed_orders: "完单数",
  checkins: "签到次数",
  redemptions: "兑换次数",
  slot_enrollments: "排班报名数",
};

// ---- Shared period math + REAL-metric progress ------------------------------
// One implementation consumed by BOTH /api/tasks (rider list + claim guard) and
// /api/rider/home (native APP missions), so progress can never diverge.

const todayStr = () => new Date().toISOString().slice(0, 10);

function addDays(date: string, days: number) {
  const v = new Date(`${date}T12:00:00Z`);
  v.setUTCDate(v.getUTCDate() + days);
  return v.toISOString().slice(0, 10);
}

function mondayOf(date: string) {
  const v = new Date(`${date}T12:00:00Z`);
  v.setUTCDate(v.getUTCDate() - ((v.getUTCDay() + 6) % 7));
  return v.toISOString().slice(0, 10);
}

/** Idempotency key for the current period (Monday for weekly, YYYY-MM for monthly). */
export function taskPeriodKey(period: TaskPeriod) {
  return period === "weekly" ? mondayOf(todayStr()) : todayStr().slice(0, 7);
}

export function taskInPeriod(period: TaskPeriod, dateLike?: string) {
  if (!dateLike) return false;
  const d = dateLike.slice(0, 10);
  if (period === "monthly") return d.slice(0, 7) === todayStr().slice(0, 7);
  const start = mondayOf(todayStr());
  return d >= start && d <= addDays(start, 6);
}

/** One claim per rider per task per period. */
export function taskClaimId(taskId: string, riderId: string, period: TaskPeriod) {
  return `${taskId}::${riderId}::${taskPeriodKey(period)}`;
}

type TaskProgressSources = {
  riderDailyKpis: Array<{ rider99Id: string; date: string; completedOrders?: number }>;
  pointsLedgerEntries: Array<{ riderId: string; reasonCode?: string; createdAt: string }>;
  marketplaceOrders: Array<{ riderId?: string; status: string; createdAt: string }>;
  slotEnrollments: Array<{ riderId: string; status: string; submittedAt?: string }>;
};

/** Live progress for a task from REAL collections (no mock counters). */
export function taskProgress(
  task: Pick<AppTask, "metric" | "period">,
  rider: { id: string; ninetyNineId?: string },
  data: TaskProgressSources,
): number {
  switch (task.metric) {
    case "completed_orders":
      return data.riderDailyKpis
        .filter((k) => !!rider.ninetyNineId && k.rider99Id === rider.ninetyNineId && taskInPeriod(task.period, k.date))
        .reduce((s, k) => s + (k.completedOrders ?? 0), 0);
    case "checkins":
      return data.pointsLedgerEntries.filter((e) => e.riderId === rider.id && e.reasonCode === "PONTO_CHECKIN" && taskInPeriod(task.period, e.createdAt)).length;
    case "redemptions":
      return data.marketplaceOrders.filter((o) => o.riderId === rider.id && o.status !== "cancelled" && taskInPeriod(task.period, o.createdAt)).length;
    case "slot_enrollments":
      return data.slotEnrollments.filter((e) => e.riderId === rider.id && !["rejected", "cancelled"].includes(e.status) && taskInPeriod(task.period, e.submittedAt)).length;
    default:
      return 0;
  }
}

export const appTasks: AppTask[] = [
  { id: "task-weekly-orders", title: "本周完单 100 单", description: "完成 100 单得奖励积分。", metric: "completed_orders", target: 100, rewardPoints: 500, period: "weekly", audience: "rider", enabled: true, createdAt: "2026-06-01 00:00", createdBy: "HQ" },
  { id: "task-weekly-checkin", title: "本周签到 5 天", description: "到站签到累计 5 次。", metric: "checkins", target: 5, rewardPoints: 150, period: "weekly", audience: "rider", enabled: true, createdAt: "2026-06-01 00:00", createdBy: "HQ" },
];

export const taskClaims: TaskClaim[] = [];
