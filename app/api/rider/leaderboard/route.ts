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
 * ⚠️ 这张页面**故意不使用 `readSession()` / localStorage**(见 page.tsx)。
 *
 * ── 口径:T+1 确认报表(riderDailyKpis),**不是实时抓取快照**
 * 2026-08-07 实测:同一天同一批骑手,快照 MAX 只有确认值的 ~40%,而且比例
 * 不一致 —— 有人快照 10 排在别人快照 9 前面,真实却是 19 vs 23,**名次是反的**。
 * 结论:rider_status_snapshots.finished_cnt 不是当日累计完单(原假设错了),
 * 拿它做榜单排名本身就不成立。
 *
 * 换成 T+1 之后:
 *   · 数字和结算、周考核同源 —— 骑手拿榜单来问工资,查到的是同一份数
 *   · PRO 能上榜(快照 source 至今全是 main,PRO 根本不出现)
 *   · 一周约 1000 行,不是 7 万行
 *
 * 代价:没有"今天"。日榜 = 窗口内**最新有数据的一天**(通常是昨天);
 * 导入晚一天就显示前天,而不是空榜。
 *
 * ── 周的定义
 * 自然周,周一到周日,和考核页共用 lib/assessment 的 weekWindow()。
 *
 * ── 展示规则(业务方定)
 * 一张总榜,PRO 与普通混排、PRO 标金、显示全名;榜长由 topN 控制,
 * 但**调用者自己的名次永远附带**,哪怕排在榜外。
 */


/**
 * ── 缓存
 * 换成 T+1 之后单次查询已经很便宜(一周约 1000 行,走 idx_asr_collection_date),
 * 但数据**一天只变一次**,再重复计算就纯属浪费。5 分钟足够,而且导入完成后
 * 最迟 5 分钟就能看到新榜。
 *
 * 缓存的是**聚合结果**,不是最终响应 —— 响应里带"我的名次",是个性化的。
 * 缓存公共部分、每个请求再标记自己那行,一份缓存所有人能用。
 */
const AGG_TTL_MS = 300_000;
const aggCache = new Map<string, { at: number; rows: Agg[]; week: { from: string; to: string } }>();

/**
 * ── 日榜:当日实时(业务方 2026-08-10 定,"按当日数据统计,每半小时更新")
 * 快照按 (骑手,班段) MAX 相加 = 当日累计(与当日数据页同一算法,聚合在
 * 库内 RPC rider_today_orders 完成)。30 分钟缓存 = 更新节奏本身。
 * 当天还没数据(清晨/收班后导表前)→ 回退 T+1 最新一天,页面照常。
 * 周榜不动:仍是 T+1 确认报表 —— 和结算同源,骑手拿周榜对工资仍然对得上。
 */
const TODAY_TTL_MS = 1_800_000;
let todayCache: { at: number; date: string; rows: TodayAgg[] } | null = null;

type Agg = { rider_ext_id: string; rider_name: string | null; day_orders: number; week_orders: number; ref_day: string | null };
type TodayAgg = { rider_ext_id: string; rider_name: string | null; day_orders: number };
type Entry = { rank: number; name: string; rider99Id: string; orders: number; pool: "standard" | "pro"; isMe: boolean };

/** 圣保罗当地日期(YYYY-MM-DD)。榜单是给骑手看的,必须用他们的日历。 */
function spDate(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * ⚠️ 没有"退回前端聚合"的兜底了。
 * 一周的 KPI 行数(约 1000)正好卡在 PostgREST 的 1000 行返回上限上 ——
 * 用 PostgREST 拉回来自己算,随时可能悄悄少一批人,又是一次"接口 200、
 * 数据是错的"。迁移没跑就明确报错,让人去跑迁移,不给错数据。
 */
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

  const today = spDate();
  // 可选 ?week=YYYY-MM-DD(取该日期所在自然周)——活动期切换历史周用。
  // 显式指定的周为空时**不做**上周回退:骑手主动看某一期,空就是还没开始/没数据。
  const weekParam = new URL(request.url).searchParams.get("week");
  const explicitWeek = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekWindow(weekParam) : null;
  let week = explicitWeek ?? weekWindow(today); // 自然周,周一→周日

  const fetchWeek = async (win: { from: string; to: string }): Promise<Agg[] | null> => {
    const { data: rpcRows, error: rpcError } = await supabase.rpc("rider_order_ranking", {
      p_from: win.from,
      p_to: win.to,
    });
    if (rpcError) return null;
    return (rpcRows ?? []) as Agg[];
  };

  // 库内聚合(带 5 分钟缓存)。缓存 key 带上实际使用的窗口。
  let rows: Agg[] = [];
  let cacheKey = `${week.from}|${week.to}`;
  const cached = aggCache.get(cacheKey);
  if (cached && Date.now() - cached.at < AGG_TTL_MS) {
    rows = cached.rows;
    week = cached.week;
  } else {
    const thisWeek = await fetchWeek(week);
    if (thisWeek === null) {
      // 迁移没跑 = 明确失败。见上面的注释:不做前端聚合兜底。
      return Response.json({ error: "排行榜聚合函数不可用(迁移是否已应用?)" }, { status: 500 });
    }
    rows = thisWeek;
    // ⚠️ 周一(以及周日数据还没导入的周一整天)本周窗口必然为空:
    // T+1 报表天然滞后一天,而周日(8-09)的数据属于**上一周**的窗口。
    // 空榜会让骑手以为功能坏了 —— 回退显示上周完整榜。页面本来就把
    // from–to 日期区间显示出来,骑手看得出这是上周,不会误导。
    // 本周第一笔数据(周二导入周一的报表)一进来,缓存过期后自动切回本周。
    if (rows.length === 0 && !explicitWeek) {
      const prevDate = new Date(new Date(`${today}T12:00:00Z`).getTime() - 7 * 864e5).toISOString().slice(0, 10);
      const prevWeek = weekWindow(prevDate);
      const prev = await fetchWeek(prevWeek);
      if (prev && prev.length > 0) {
        rows = prev;
        week = prevWeek;
      }
    }
    // 活动期会在两个窗口之间来回切,保留少量条目;超限一起清,不让 Map 无限长大。
    if (aggCache.size >= 4) aggCache.clear();
    aggCache.set(cacheKey, { at: Date.now(), rows, week });
  }
  // 日榜那天 = 报表里最新有数据的一天(通常是昨天)—— 仅作实时空档的回退。
  const refDay = rows[0]?.ref_day ?? null;

  // 当日实时榜(30 分钟缓存;失败或为空都回退 T+1,不让日榜消失)。
  let todayRows: TodayAgg[] = [];
  if (todayCache && todayCache.date === today && Date.now() - todayCache.at < TODAY_TTL_MS) {
    todayRows = todayCache.rows;
  } else {
    const { data: liveRows, error: liveErr } = await supabase.rpc("rider_today_orders");
    if (!liveErr && liveRows) {
      todayRows = liveRows as TodayAgg[];
      todayCache = { at: Date.now(), date: today, rows: todayRows };
    }
  }

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

  const rankList = <T extends { rider_ext_id: string; rider_name: string | null }>(list: T[], pick: (row: T) => number): Entry[] =>
    list
      .filter((row) => pick(row) > 0)
      .sort((a, b) => pick(b) - pick(a) || (a.rider_name ?? "").localeCompare(b.rider_name ?? ""))
      .map((row, index) => ({
        rank: index + 1,
        name: row.rider_name || `99 ${row.rider_ext_id}`,
        rider99Id: row.rider_ext_id,
        orders: pick(row),
        pool: poolMap.get(row.rider_ext_id) ?? "standard",
        isMe: row.rider_ext_id === meId,
      }));
  const rank = (pick: (row: Agg) => number): Entry[] => rankList(rows, pick);

  /** 截到 topN,但如果"我"在榜外,把我那一行附在后面。 */
  const cut = (all: Entry[]) => {
    const top = all.slice(0, Math.max(3, Math.min(100, config.topN)));
    const me = all.find((entry) => entry.isMe);
    return { top, me: me && me.rank > top.length ? me : null, total: all.length };
  };

  return Response.json({
    data: {
      enabled: true,
      // 报表最新一天 —— 页面上要显示"这是哪天的榜",否则骑手会以为是今天的。
      updatedAt: refDay,
      // 当天有实时数据 → 今日实时榜(live 标记,页面显示"今天·半小时更新");
      // 否则回退 T+1 最新一天,行为与旧版完全一致。
      daily: config.daily
        ? todayRows.length > 0
          ? { date: today, live: true, ...cut(rankList(todayRows, (row) => row.day_orders)) }
          : { date: refDay ?? "", live: false, ...cut(rank((row) => row.day_orders)) }
        : null,
      // to 给的是本周日,不是今天 —— 界面要显示完整周期,骑手才知道还有几天可以追。
      weekly: config.weekly ? { from: week.from, to: week.to, ...cut(rank((row) => row.week_orders)) } : null,
    },
  }, {
    // private:响应含"我的名次",绝不能进共享/CDN 缓存。
    // 30 秒足够挡住下拉刷新连点,又不会让人觉得数字卡住不动。
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
