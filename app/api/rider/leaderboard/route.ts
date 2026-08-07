import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { sessionFromRequest } from "../../../lib/auth-session";
import { requirePermission } from "../../../lib/server/authz";
import { fetchRows } from "../../../lib/server/db-read";
import { defaultLeaderboardConfig, type AppSplashRecord } from "../../../lib/app-config";
import { weekWindow } from "../../../lib/assessment";
import type { Rider } from "../../../lib/data";

/**
 * 骑手排行榜(日榜 / 周榜)。
 *
 * ── 口径:实时抓取快照(业务方 2026-08-06 定)
 * 快照字段 finished_cnt 是**当日累计完单**,不是增量。所以:
 *   · 日榜 = 每人当天所有批次里取 MAX
 *   · 周榜 = 本周(周一→周日)每天各自 MAX,再按人相加
 * 绝不能直接 SUM —— 一天有十几个批次,SUM 会把同一个人重复累加十几倍,
 * 排名彻底失真。这是这个功能唯一容易写错的地方。
 *
 * ── 周的定义
 * 自然周,周一到周日(业务方 2026-08-07 定),和考核页、例会同一个"周" ——
 * 共用 lib/assessment 的 weekWindow()。骑手说"我这周第 3"时,运营在考核页
 * 查到的必须是同一个周,否则解释不清。
 * 周一零点自动清零:榜单从本周一算起,不是滚动 7 天。
 *
 * ── 为什么可行
 * 快照表保留了 48 天历史(实测 5,936 批次 / 33.6 万行),够算日榜和周榜。
 *
 * ── 展示规则(业务方定)
 *   · 一张总榜,PRO 与普通混排,PRO 标金色
 *   · 显示全名
 *   · 榜单长度由主后台 topN 控制;**调用者自己的名次永远附带**,
 *     哪怕排在榜外 —— 排行榜对排不进前列的人才最需要给个位置感
 *
 * ── 开关
 * 主后台(APP 配置页)控制 enabled / daily / weekly。关掉后这里直接返回
 * enabled:false,客户端不渲染入口 —— 服务端说了算,老版本客户端也绕不过。
 *
 * 刻意不进内存层:直连快照表聚合,不占 module-guard 的内存路由基线。
 */

type Row = { rider_ext_id: string | null; rider_name: string | null; finished_cnt: number | null; captured_at: string };
type Entry = { rank: number; name: string; rider99Id: string; orders: number; pool: "standard" | "pro"; isMe: boolean };

/** 圣保罗当地日期(YYYY-MM-DD)。榜单是给骑手看的,必须用他们的日历。 */
function spDate(offsetDays = 0): string {
  return new Date(Date.now() - 3 * 3600_000 + offsetDays * 864e5).toISOString().slice(0, 10);
}

/**
 * 把原始快照行折叠成「每人每天的最高累计值」,再按人汇总。
 * 返回按单量降序的完整名次(不截断 —— 截断在调用处做,因为要先找到"我"的名次)。
 */
function rank(rows: Row[], poolOf: (id: string) => "standard" | "pro", meId: string): Entry[] {
  // rider → date → max(finished)
  const perDay = new Map<string, Map<string, { name: string; max: number }>>();
  for (const row of rows) {
    const id = String(row.rider_ext_id ?? "").trim();
    if (!id) continue;
    const day = new Date(new Date(row.captured_at).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    const byDay = perDay.get(id) ?? new Map();
    const current = byDay.get(day);
    const value = Number(row.finished_cnt ?? 0) || 0;
    if (!current || value > current.max) byDay.set(day, { name: row.rider_name || current?.name || "", max: value });
    perDay.set(id, byDay);
  }

  const totals: Array<{ id: string; name: string; orders: number }> = [];
  for (const [id, byDay] of perDay) {
    let orders = 0;
    let name = "";
    for (const { name: n, max } of byDay.values()) {
      orders += max;
      if (n) name = n;
    }
    if (orders > 0) totals.push({ id, name, orders });
  }

  return totals
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name))
    .map((row, index) => ({
      rank: index + 1,
      name: row.name || `99 ${row.id}`,
      rider99Id: row.id,
      orders: row.orders,
      pool: poolOf(row.id),
      isMe: row.id === meId,
    }));
}

export async function GET(request: Request) {
  const forbidden = requirePermission(request, "use_rider_app");
  if (forbidden) return forbidden;

  const supabase = getSupabaseServerClient();

  // 开关:和开屏/活动卡同一条配置记录。
  const { data: cfgRows } = await supabase
    .from("app_state_records")
    .select("data")
    .eq("collection", "appSplashConfigs")
    .limit(1);
  const config = { ...defaultLeaderboardConfig, ...((cfgRows?.[0] as { data: AppSplashRecord } | undefined)?.data?.leaderboard ?? {}) };
  if (!config.enabled) return Response.json({ data: { enabled: false } });

  // 调用者是谁(用来标出"我"的名次)。
  const session = await sessionFromRequest(request);
  let meId = "";
  if (session) {
    const mine = session.userId
      ? await fetchRows<Rider>("riders", [{ op: "eq", field: "id", value: session.userId }])
      : await fetchRows<Rider>("riders", [{ op: "eq", field: "name", value: session.name }]);
    meId = String(mine[0]?.ninetyNineId ?? "");
  }

  // 池归属:一张总榜混排,PRO 标金。
  const riders = await fetchRows<Rider>("riders");
  const poolMap = new Map(riders.filter((r) => r.ninetyNineId).map((r) => [String(r.ninetyNineId), r.pool === "pro" ? "pro" as const : "standard" as const]));
  const poolOf = (id: string) => poolMap.get(id) ?? "standard";

  const today = spDate(0);
  // 自然周(周一→周日),与考核页共用同一个函数。
  const week = weekWindow(today);

  // 一次把本周的快照拉回来,日榜从中筛当天,省一次往返。
  const { data, error } = await supabase
    .from("rider_status_snapshots")
    .select("rider_ext_id, rider_name, finished_cnt, captured_at")
    .gte("captured_at", `${week.from}T00:00:00-03:00`)
    .order("captured_at", { ascending: false })
    .limit(50_000);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const todayRows = rows.filter((row) => new Date(new Date(row.captured_at).getTime() - 3 * 3600_000).toISOString().slice(0, 10) === today);

  /** 截到 topN,但如果"我"在榜外,把我那一行附在后面。 */
  const cut = (all: Entry[]) => {
    const top = all.slice(0, Math.max(3, Math.min(100, config.topN)));
    const me = all.find((entry) => entry.isMe);
    return { top, me: me && me.rank > top.length ? me : null, total: all.length };
  };

  return Response.json({
    data: {
      enabled: true,
      updatedAt: rows[0]?.captured_at ?? null,
      daily: config.daily ? { date: today, ...cut(rank(todayRows, poolOf, meId)) } : null,
      // to 给的是本周日(周窗口的结束),不是今天 —— 界面上要显示完整周期,
      // 骑手才知道这个榜什么时候结束、还有几天可以追。
      weekly: config.weekly ? { from: week.from, to: week.to, ...cut(rank(rows, poolOf, meId)) } : null,
    },
  });
}
