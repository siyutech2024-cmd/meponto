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

export const appTasks: AppTask[] = [
  { id: "task-weekly-orders", title: "本周完单 100 单", description: "完成 100 单得奖励积分。", metric: "completed_orders", target: 100, rewardPoints: 500, period: "weekly", audience: "rider", enabled: true, createdAt: "2026-06-01 00:00", createdBy: "HQ" },
  { id: "task-weekly-checkin", title: "本周签到 5 天", description: "到站签到累计 5 次。", metric: "checkins", target: 5, rewardPoints: 150, period: "weekly", audience: "rider", enabled: true, createdAt: "2026-06-01 00:00", createdBy: "HQ" },
];

export const taskClaims: TaskClaim[] = [];
