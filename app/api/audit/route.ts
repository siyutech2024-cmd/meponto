import { jsonResponse, memory, type ServerAuditEntry } from "../../lib/server/memory";
import { flushPendingToDatabase } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";
import { getSupabaseServerClient } from "../../lib/supabase/server";

const auditRisks = new Set(["Low", "Medium", "High"]);

/**
 * 审计日志改为直读数据库。
 *
 * auditEntries 已从冷启动水合里排除(见 lib/server/persistence.ts:
 * HYDRATION_EXCLUDED)——39,888 行占全部行数的 74%,却从不参与业务计算,
 * 没有理由每个 serverless 实例都搬一遍。代价是这里不能再读 memory:
 * 内存里只有本实例启动后新写的那几条。
 *
 * 所以按数据库倒序分页取。默认 200 条,?limit= 最多 1000 —— 审计是排查工具,
 * 没人需要一次拉四万行。
 */
export async function GET(request: Request) {
  const forbidden = requirePermission(request, "view_audit");
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200));

  const bootstrapEntry: ServerAuditEntry = {
    id: "aud-api-001",
    actor: "System",
    action: "API_AUDIT_BOOTSTRAP",
    entity: "API",
    entityId: "pontosys-api",
    detail: "Server-side audit endpoint is ready for database-backed audit events.",
    risk: "Low",
    createdAt: "2026-05-15 17:36",
  };

  // 内存里只有本实例新写的几条 —— 和数据库结果按 id 去重后合并,
  // 保证"刚做完一个操作立刻刷新审计页"能看到自己那条(还没 flush 完的情况)。
  let persisted: ServerAuditEntry[] = [];
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_state_records")
      .select("data")
      .eq("collection", "auditEntries")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    persisted = (data ?? []).map((row) => (row as { data: ServerAuditEntry }).data);
  } catch (error) {
    // 数据库读不到就退回内存(本实例的新条目),不让审计页整个挂掉。
    console.warn(`[audit] DB read failed, memory fallback: ${(error as Error).message}`);
    persisted = [];
  }

  const seen = new Set<string>();
  const merged: ServerAuditEntry[] = [];
  for (const entry of [...memory.auditEntries, ...persisted]) {
    if (!entry?.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }

  return jsonResponse({ data: [bootstrapEntry, ...merged] });
}

async function postImpl(request: Request) {
  const forbidden = requirePermission(request, "view_dashboard");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<ServerAuditEntry>;
  if (!body.actor || !body.action || !body.entity) {
    return jsonResponse({ error: "actor, action and entity are required" }, { status: 400 });
  }

  // 注意:不能再用 memory.auditEntries.length 生成 id —— 审计已不进水合,
  // 内存长度只反映本实例,重启后会从 1 重新开始撞 id。改用时间戳+随机后缀。
  const id =
    typeof body.id === "string" && /^[\w.:-]{1,64}$/.test(body.id)
      ? body.id
      : `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const existing = memory.auditEntries.find((entry) => entry.id === id);
  if (existing) return jsonResponse({ data: existing });

  const entry: ServerAuditEntry = {
    id,
    actor: String(body.actor),
    action: String(body.action),
    entity: String(body.entity),
    entityId: String(body.entityId ?? ""),
    detail: String(body.detail ?? ""),
    risk: auditRisks.has(String(body.risk)) ? (body.risk as ServerAuditEntry["risk"]) : "Low",
    createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  memory.auditEntries.unshift(entry);
  return jsonResponse({ data: entry }, { status: 201 });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function POST(...args: Parameters<typeof postImpl>) {
  const response = await postImpl(...args);
  await flushPendingToDatabase();
  return response;
}
