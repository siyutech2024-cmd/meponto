import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { flushPendingToDatabase, persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { sessionFromRequest } from "../../lib/auth-session";
import { getAvailablePoints, type PointsLedgerEntry } from "../../lib/points";
import type { AppTask, TaskMetric, TaskPeriod } from "../../lib/tasks";

/**
 * Rider tasks/missions (任务). HQ configures goal + reward + period; the rider
 * app shows live progress from REAL metrics and claims a met task once per
 * period — reward lands as an append-only `earn` ledger entry.
 * Events: task.created.v1 / task.reward.granted.v1.
 */

const COLLECTIONS = ["appTasks", "taskClaims", "pointsLedgerEntries", "riders", "riderDailyKpis", "marketplaceOrders", "slotEnrollments"];
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
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
function periodKey(period: TaskPeriod) {
  return period === "weekly" ? mondayOf(todayStr()) : todayStr().slice(0, 7);
}
function inPeriod(period: TaskPeriod, dateLike?: string) {
  if (!dateLike) return false;
  const d = dateLike.slice(0, 10);
  if (period === "monthly") return d.slice(0, 7) === todayStr().slice(0, 7);
  const start = mondayOf(todayStr());
  return d >= start && d <= addDays(start, 6);
}

function progressFor(task: AppTask, rider: { id: string; ninetyNineId?: string }) {
  switch (task.metric) {
    case "completed_orders":
      return memory.riderDailyKpis
        .filter((k) => k.rider99Id === rider.ninetyNineId && inPeriod(task.period, k.date))
        .reduce((s, k) => s + (k.completedOrders ?? 0), 0);
    case "checkins":
      return memory.pointsLedgerEntries.filter((e) => e.riderId === rider.id && e.reasonCode === "PONTO_CHECKIN" && inPeriod(task.period, e.createdAt)).length;
    case "redemptions":
      return memory.marketplaceOrders.filter((o) => o.riderId === rider.id && o.status !== "cancelled" && inPeriod(task.period, o.createdAt)).length;
    case "slot_enrollments":
      return memory.slotEnrollments.filter((e) => e.riderId === rider.id && !["rejected", "cancelled"].includes(e.status) && inPeriod(task.period, e.submittedAt)).length;
    default:
      return 0;
  }
}

function claimId(taskId: string, riderId: string, period: TaskPeriod) {
  return `${taskId}::${riderId}::${periodKey(period)}`;
}

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login.", code: "unauthenticated" }, { status: 401 });
  await refreshCollectionsFromDatabase(COLLECTIONS);

  // Office (HQ) → full config list. Rider → enabled tasks with live progress.
  if (session.portal === "pontosys" || session.portal === "pontomall") {
    return jsonResponse({ data: { tasks: memory.appTasks } });
  }

  const rider = memory.riders.find((r) => r.id === session.userId || r.name === session.name);
  if (!rider) return jsonResponse({ data: { tasks: [] } });
  const tasks = memory.appTasks
    .filter((t) => t.enabled && (t.audience === "all" || t.audience === "rider"))
    .map((t) => {
      const progress = progressFor(t, rider);
      const claimed = memory.taskClaims.some((c) => c.id === claimId(t.id, rider.id, t.period));
      return { id: t.id, title: t.title, description: t.description ?? "", metric: t.metric, target: t.target, rewardPoints: t.rewardPoints, period: t.period, progress, claimed, claimable: progress >= t.target && !claimed };
    });
  return jsonResponse({ data: { tasks } });
}

type Body = { action?: string } & Record<string, unknown>;
const CONFIG_ACTIONS = new Set(["create", "update", "delete", "toggle"]);
const METRICS: TaskMetric[] = ["completed_orders", "checkins", "redemptions", "slot_enrollments"];

async function handlePost(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const action = String(body.action ?? "");
  const session = await sessionFromRequest(request);
  const actor = roleFromRequest(request);

  // ---- HQ configuration ---------------------------------------------------
  if (CONFIG_ACTIONS.has(action)) {
    const forbidden = requirePermission(request, "manage_points");
    if (forbidden) return forbidden;
    if (session && session.portal !== "pontosys" && session.portal !== "pontomall") {
      return jsonResponse({ error: "仅运营后台可配置任务。", code: "forbidden" }, { status: 403 });
    }
    await refreshCollectionsFromDatabase(COLLECTIONS);

    if (action === "create") {
      const metric = METRICS.includes(body.metric as TaskMetric) ? (body.metric as TaskMetric) : "completed_orders";
      const period: TaskPeriod = body.period === "monthly" ? "monthly" : "weekly";
      const task: AppTask = {
        id: makeServerId("task", memory.appTasks.length + 1),
        title: String(body.title ?? "").trim().slice(0, 80) || "任务",
        description: String(body.description ?? "").slice(0, 200) || undefined,
        metric,
        target: Math.max(1, Math.floor(Number(body.target) || 1)),
        rewardPoints: Math.max(0, Math.floor(Number(body.rewardPoints) || 0)),
        period,
        audience: body.audience === "all" ? "all" : "rider",
        enabled: true,
        createdAt: nowStamp(),
        createdBy: actor,
      };
      memory.appTasks.unshift(task);
      appendServerAudit({ actor, action: "task.created.v1", entity: "AppTask", entityId: task.id, detail: `${task.title} · ${task.metric}≥${task.target} → ${task.rewardPoints} pts/${task.period}`, risk: "Low" });
      return jsonResponse({ data: task }, { status: 201 });
    }

    const index = memory.appTasks.findIndex((t) => t.id === body.taskId);
    if (index === -1) return jsonResponse({ error: "任务不存在", code: "not_found" }, { status: 404 });
    if (action === "delete") {
      const [removed] = memory.appTasks.splice(index, 1);
      persistDeleteRecord("appTasks", removed.id);
      return jsonResponse({ data: { ok: true } });
    }
    if (action === "toggle") {
      memory.appTasks[index] = { ...memory.appTasks[index], enabled: body.enabled === undefined ? !memory.appTasks[index].enabled : body.enabled === true };
      return jsonResponse({ data: memory.appTasks[index] });
    }
    // update
    const cur = memory.appTasks[index];
    memory.appTasks[index] = {
      ...cur,
      ...(body.title !== undefined ? { title: String(body.title).slice(0, 80) } : {}),
      ...(body.description !== undefined ? { description: String(body.description).slice(0, 200) || undefined } : {}),
      ...(body.metric !== undefined && METRICS.includes(body.metric as TaskMetric) ? { metric: body.metric as TaskMetric } : {}),
      ...(body.target !== undefined ? { target: Math.max(1, Math.floor(Number(body.target) || cur.target)) } : {}),
      ...(body.rewardPoints !== undefined ? { rewardPoints: Math.max(0, Math.floor(Number(body.rewardPoints) || 0)) } : {}),
      ...(body.period !== undefined ? { period: body.period === "monthly" ? "monthly" : "weekly" } : {}),
      ...(body.audience !== undefined ? { audience: body.audience === "all" ? "all" : "rider" } : {}),
    };
    return jsonResponse({ data: memory.appTasks[index] });
  }

  // ---- Rider claim --------------------------------------------------------
  if (action === "claim") {
    const forbidden = requirePermission(request, "use_rider_app");
    if (forbidden) return forbidden;
    await refreshCollectionsFromDatabase(COLLECTIONS);
    const rider = session ? memory.riders.find((r) => r.id === session.userId || r.name === session.name) : undefined;
    if (!rider) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });
    const task = memory.appTasks.find((t) => t.id === body.taskId && t.enabled);
    if (!task) return jsonResponse({ error: "任务不存在或已停用", code: "not_found" }, { status: 404 });
    const id = claimId(task.id, rider.id, task.period);
    if (memory.taskClaims.some((c) => c.id === id)) {
      return jsonResponse({ error: "本周期已领取该任务奖励。", code: "already_claimed" }, { status: 409 });
    }
    const progress = progressFor(task, rider);
    if (progress < task.target) {
      return jsonResponse({ error: `还差 ${task.target - progress} 才能领取。`, code: "task_incomplete", progress, target: task.target }, { status: 409 });
    }
    const available = getAvailablePoints(memory.pointsLedgerEntries, rider.id);
    const entry: PointsLedgerEntry = {
      id: `pts-${id}`,
      riderId: rider.id,
      accountId: `pts-${rider.id}`,
      type: "earn",
      points: task.rewardPoints,
      status: "approved",
      sourceType: "mission",
      sourceId: task.id,
      balanceAfter: available + task.rewardPoints,
      reasonCode: "TASK_REWARD",
      note: task.title,
      createdBy: "Task",
      createdAt: nowStamp(),
    };
    memory.pointsLedgerEntries.unshift(entry);
    memory.taskClaims.unshift({ id, taskId: task.id, riderId: rider.id, periodKey: periodKey(task.period), rewardPoints: task.rewardPoints, claimedAt: nowStamp() });
    appendServerAudit({ actor: rider.name, action: "task.reward.granted.v1", entity: "AppTask", entityId: task.id, detail: `${rider.name} 领取「${task.title}」+${task.rewardPoints} pts`, risk: "Low" });
    return jsonResponse({ data: { awarded: task.rewardPoints, available: available + task.rewardPoints } }, { status: 201 });
  }

  return jsonResponse({ error: "unknown action", code: "bad_request" }, { status: 400 });
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
