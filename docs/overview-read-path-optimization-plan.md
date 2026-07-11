# 总部仪表盘与读路径性能 — 最终优化方案（评审稿）

> 目标：让 `/api/overview` 从"分钟级挂起"变为**毫秒级、成本与数据量解耦、多人共享一次计算**，
> 并给整个读路径（performance / wallet / mall-insights 等同病端点）一条统一的治理路线，
> 最终与 `docs/phase2-transactional-core-migration.md`（迁表治本方案）无缝衔接。
> 本文档整合并升级现有未提交草稿（`overview_stats` RPC + 迁移文件），是其**替代评审稿**。

---

## 0. 现状与瓶颈定位

架构：内存集合 ←镜像→ `app_state_records`（一行一条 JSONB 记录），每个请求
`refreshCollectionsFromDatabase`（TTL 5 秒）全量拉取。

| 瓶颈 | 事实 | 后果 |
| --- | --- | --- |
| 读取 O(全量) | overview 刷 **12 个完整集合** | 传输量随业务线性涨 |
| 账本类只增不减 | `riderDailyKpis` / `riderDailyEarnings` 每骑手每天 +1 行 | 首屏从秒级劣化到分钟级 |
| 每请求重复计算 | 每个仪表盘观看者独立触发全量刷新 | N 个人看 = N 倍成本 |
| 现有草稿的缺口 | RPC 用 `data->>'…'` 过滤但**无表达式索引**；`last_date` CTE 被引用 3+ 次导致同集合重复扫描；每请求仍执行一次 RPC | 比下载好一个数量级，但仍是 O(集合行数)×扫描次数 |

## 1. 三层方案总览

| 层 | 内容 | 生效时间 | 效果 |
| --- | --- | --- | --- |
| **L1 立即** | 表达式索引 + `overview_stats` v2 单遍聚合 + 60 秒快照缓存 | 半天 | 首屏毫秒级，N 人共享 1 次计算 |
| **L2 短期** | 账本类集合"日期窗口刷新"，治理其余慢端点 | 1–2 天 | performance/wallet 等同步受益 |
| **L3 治本** | phase2 迁表（订单/账本/库存进真表） | 按既有草案排期 | 竞态、约束、读成本一次解决 |

L1 不与 L3 冲突：迁表完成后 `overview_stats` 只是把 FROM 换成真表，接口不变。

---

## 2. L1 — 立即方案（替代现有草稿）

### 2.1 表达式索引（新迁移文件，替换原 20260710120000）

只加两条通用索引（服务 date/status 两类过滤，所有集合共享；不要更多——每条索引都是写放大）：

```sql
CREATE INDEX IF NOT EXISTS idx_asr_collection_date
  ON app_state_records (collection, (data->>'date'));
CREATE INDEX IF NOT EXISTS idx_asr_collection_status
  ON app_state_records (collection, (data->>'status'));
```

### 2.2 `overview_stats` v2 — 每个集合只扫一遍

用 `FILTER` 聚合替代草稿里的多子查询；`last_date` 先物化为标量。核心模式：

```sql
-- KPI 块：一次扫描出 riders / completedOrders / lowAr 全部指标
WITH ld AS MATERIALIZED (
  SELECT max(data->>'date') AS d FROM app_state_records
  WHERE collection = 'riderDailyKpis'
)
SELECT jsonb_build_object(
  'date', (SELECT d FROM ld),
  'riders',          count(*),
  'completedOrders', coalesce(sum((data->>'completedOrders')::numeric), 0),
  'lowAr',           count(*) FILTER (WHERE data->>'ar' IS NOT NULL
                                        AND (data->>'ar')::numeric < 95)
)
FROM app_state_records, ld
WHERE collection = 'riderDailyKpis' AND data->>'date' = ld.d;
```

同法改写 dispatch（1 遍出 upcomingShifts+planned、1 遍出两种 signups 计数）、
finance（1 遍 FILTER 出 requested 计数/金额与 paid 金额）、mall（1 遍出 created/arrived）。
network 四个 `count(*)` 走 `(collection, updated_at)` 现有索引，保持不动。
保留：`STABLE`、`SECURITY DEFINER`、`SET search_path = public`、
`REVOKE … FROM anon, authenticated, PUBLIC; GRANT … TO service_role`。

### 2.3 两级快照缓存（路由层）

仪表盘容忍 60 秒延迟，没必要每个观看者跑一次 RPC：

```ts
// app/api/overview/route.ts — 模块级缓存(每个 warm 实例一份)
let snapshot: { at: number; body: unknown } | null = null;
const SNAPSHOT_TTL_MS = 60_000;

async function overviewFromDatabase(): Promise<Response | null> {
  if (process.env.OVERVIEW_DB_AGGREGATE === "false") return null;   // 总开关(保留)
  if (process.env.USE_SUPABASE !== "true") return null;
  if (snapshot && Date.now() - snapshot.at < SNAPSHOT_TTL_MS) {
    return jsonResponse({ data: snapshot.body });                    // O(1) 命中
  }
  try {
    const { data, error } = await supabase.rpc("overview_stats", { p_today: today() });
    if (error) throw new Error(error.message);
    const body = { generatedAt: generatedAt(), ...data };
    snapshot = { at: Date.now(), body };
    return jsonResponse({ data: body });
  } catch (e) {
    console.warn(`[overview] RPC unavailable, in-memory rollup. (${(e as Error).message})`);
    return null;                                                     // 降级到旧路径(保留)
  }
}
```

说明：实例内存缓存已足够（冷实例首请求跑一次 RPC，v2 之后是毫秒级）；
**不需要**跨实例 DB 快照行——那是给昂贵计算准备的，v2 之后计算已不昂贵，别加复杂度。

### 2.4 上线顺序与回滚

1. Supabase 执行新迁移（索引 + RPC v2）——**先库后码**；
2. 提交路由代码（快照缓存版），`npm run codex:preflight` 绿后 push；
3. 回滚开关：Vercel 设 `OVERVIEW_DB_AGGREGATE=false` 即回旧路径，无需回滚代码。

### 2.5 验证清单

- [ ] `EXPLAIN (ANALYZE, BUFFERS) SELECT overview_stats('YYYY-MM-DD')` — 确认走
      `idx_asr_collection_date/status`，无 Seq Scan on 大集合；
- [ ] 生产 `curl -w '%{time_total}' https://…/api/overview`：首请求 < 500ms，60 秒内重复请求 < 100ms；
- [ ] RPC 结果与旧路径逐字段对拍一次（临时开关切换对比）；
- [ ] `npm run codex:preflight` 全绿。

---

## 3. L2 — 读路径通用治理（短期）

同样的病根还在拖慢 performance、wallet 结算、mall-insights：它们也 refresh 全量账本集合。

1. `refreshCollectionsFromDatabase` 增加可选窗口参数：
   `refreshCollectionsFromDatabase(["riderDailyKpis"], { dateFrom: <本周一> })`
   ——账本类集合只刷最近 N 天；历史汇总一律走 RPC（复用 2.2 的模式按需增加函数）。
2. 排查清单（按访问频率排序）：`/api/performance`（周窗口即可）、`/api/wallet`
   （结算只需选定周 ±1 周）、`/api/mall-insights`。
3. 与既有分页修复（PostgREST 1000 行翻页，commit 5062248）兼容：窗口过滤发生在
   查询侧，翻页逻辑不变。

## 4. L3 — 治本（指向 phase2 草案）

`docs/phase2-transactional-core-migration.md` 已给出目标表结构（订单幂等键、append-only
账本 + 余额快照表、站点库存池）。本方案只补排期建议：

1. **先 `points_ledger` + `points_balances`**（双花风险最高、读最频繁）；
2. 再 `marketplace_orders`（幂等键消重复下单）；
3. 最后 `station_stock`（事务扣减消超卖）。

每模块一支、双写过渡、影子读对拍一周再切换。迁完后 L1 的 RPC 把 FROM 换成真表即可，
接口与缓存层零改动。

## 5. 明确不做的事

- ❌ 给 `app_state_records` 加两条以上表达式索引（写放大，收益递减）；
- ❌ 跨实例 DB 快照行 / Redis（v2 计算已毫秒级，纯增复杂度）；
- ❌ pg_cron 定时物化（同上；且多一个基础设施依赖）；
- ❌ 在 L1 阶段动集合镜像机制本身（那是 L3 的事，别把续命改成半吊子手术）。

## 6. 决策与待办

- [ ] 评审通过本方案（替代现有未提交草稿）；
- [ ] 重写迁移文件（索引 + RPC v2）并在 Supabase 执行；
- [ ] 更新 `app/api/overview/route.ts`（快照缓存版）；
- [ ] 按 2.5 验证后提交上线；
- [ ] L2 排期（1–2 天）；L3 按 phase2 草案评审排期。
