# Eastwind 骑手实时状态 → MePonto 同步方案

更新：2026-06-17 ｜ 状态：方案设计（未实现，待确认后再写代码）

## 一、目标

把 99Food Eastwind「实时看板」里两块数据，每 5 分钟同步进 MePonto（Supabase）：

1. **骑手看板** (`/monitor/riders/list`)：排班时段内骑手实时状态 → **快照**模型。
2. **运单看板** (`/monitor/waybill/list`)：实时运单及配送时间线 → **按运单号 upsert** 模型，
   用于后续「订单 / 加盟商 / 骑手」分析。

注意：这与现有的 Eastwind **T+1 报表导入**（结算/积分）是两套数据。本方案只新增
「实时状态/运单数据」，不动现有资金流/积分流逻辑。

### 建模差异（重要）

- 骑手状态是「连续状态」→ 每 5 分钟存一行快照，看时间序列。
- 运单是「离散事件」→ **不要**每 5 分钟把同一单重存一遍（会爆量）。按运单号 upsert，
  一单一行随进度更新；如需分析「超时如何发生」，再加一张轻量事件日志记录状态变化。

## 二、关键结论（可行性）

抓取已验证，背后接口是：

```
GET https://eastwind.99app.com/gateway
    ?api=vendor.rider.monitor.vendorFeatureInShift
    &country=BR&timezone=America/Sao_Paulo&locale=zh-CN
    &cityID=55000199
    &pageNo=1&pageSize=500&shiftAreaType=1&shopIDs[]=
    &wsgsig=...                ← 反爬签名（每次请求现算）
    &secdd-challenge=...       ← 风控质询（设备风控 SDK）
    &secdd-authentication=...  ← 风控认证
```

**结论：纯服务端直接调接口（Vercel Cron 复刻请求）不可行。**
`wsgsig` / `secdd-*` 是页面里的混淆 JS 每次请求现场生成的反爬/风控签名（99/滴滴系
设备风控），服务器端无法复刻，复制旧签名会失效甚至触发封号。

**采用方案：真实浏览器保活 + 拦截响应体。** 让真正的浏览器加载页面（由它自己生成
合法签名），我们只负责定时触发和接收数据。

运单看板用同一机制，核心接口：

```
GET .../gateway?api=vendor.rider.monitor.delivery
    &cityID=55000199&pageNo=1&pageSize=500   （+ 同样的 wsgsig / secdd-* 签名）
# 另有 vendor.rider.monitor.config（页面配置，可忽略）
```

同一个保活浏览器，每轮多访问一个 `/monitor/waybill/list` 页面、多拦截一个
`vendor.rider.monitor.delivery` 响应即可，不需要额外环境。

## 三、整体架构

```
[常开环境] Playwright 持久化浏览器（保存 Jiang Meiman 登录态）
   每5分钟（仅排班时段）打开/刷新 riders/list
   page.on('response') 拦截 vendorFeatureInShift 的 JSON
        │  HTTPS POST（带共享密钥 X-Ingest-Token）
        ▼
[MePonto] POST /api/eastwind/rider-status  ← 新增接收接口
   校验密钥 → 规整字段 → 批量写入
        ▼
[Supabase] rider_status_snapshots 表（每5分钟一批快照）
        ▼
[MePonto 后台] 实时看板 / 出勤统计页（读快照）
```

为什么不用 Cowork 定时任务 / Vercel Cron 直接抓：它们跑在云端，拿不到用户浏览器的
登录 cookie，也生成不了反爬签名。它们最多只能当“触发器”，仍需真实浏览器执行 → 退化
为本方案。

## 四、数据字段 → 表结构

页面可见字段（每个骑手卡片）：姓名、状态、排班时段、热区、电话、在线时长、完单数量、
休息时长；顶部 KPI：AR、CAA、接单量、Overtime、%TSH、完单数量；地图含经纬度。

> 字段英文名以首次 Playwright 拦截到的真实 JSON 为准（下面是按 UI 推断的结构，
> 第一次跑通后据实微调）。

```sql
-- 单骑手状态快照（每5分钟每骑手一行）
create table if not exists rider_status_snapshots (
  id            bigint generated always as identity primary key,
  captured_at   timestamptz not null,            -- 抓取批次时间（对齐到5分钟）
  city_id       text,                            -- 55000199
  rider_ext_id  text,                            -- Eastwind 骑手ID（关联MePonto骑手）
  rider_name    text,
  phone         text,
  status        text,                            -- 原始状态：未履约/不在区域内/不及预期/...
  status_code   text,                            -- 若JSON有枚举码则存码
  shift_start   text,                            -- 11:00
  shift_end     text,                            -- 14:00
  hot_zone      text,                            -- Santo Amaro
  online_mins   integer,                         -- 在线时长(分)
  rest_mins     integer,                         -- 休息时长(分)
  finished_cnt  integer,                         -- 完单数量
  lat           double precision,
  lng           double precision,
  raw           jsonb,                           -- 原始记录留底
  created_at    timestamptz not null default now()
);
create index on rider_status_snapshots (captured_at);
create index on rider_status_snapshots (rider_ext_id, captured_at);

-- 批次级 KPI 快照（每5分钟一行）
create table if not exists rider_kpi_snapshots (
  id           bigint generated always as identity primary key,
  captured_at  timestamptz not null,
  city_id      text,
  ar           numeric,    -- 78.6 (%)
  caa          numeric,    -- 9.1 (%)
  accept_cnt   integer,    -- 接单量 11
  overtime     numeric,    -- 0.0 (%)
  tsh          numeric,    -- %TSH 5.1
  finished_cnt integer,    -- 完单数量 1
  raw          jsonb,
  created_at   timestamptz not null default now()
);
```

运单表（按运单号 upsert，一单一行）：

```sql
create table if not exists eastwind_deliveries (
  order_no        text primary key,                -- 运单号 #656001
  tracking_id     text,                            -- 长追踪ID 57646750495255...
  city_id         text,
  merchant_name   text,                            -- 商家/加盟商
  rider_ext_id    text,                            -- 骑手ID
  rider_name      text,
  vehicle         text,                            -- 自行车/...
  status          text,                            -- 已超时/即将超时/正常/...
  -- 配送时间线（预计 DETA vs 实际）
  t_assign        timestamptz,                     -- 派单
  t_arrive_shop_eta   timestamptz, t_arrive_shop_act   timestamptz,  -- 到店
  t_pickup_eta        timestamptz, t_pickup_act        timestamptz,  -- 取餐
  t_arrive_user_eta   timestamptz, t_arrive_user_act   timestamptz,  -- 到达用户
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  raw             jsonb,
  updated_at      timestamptz not null default now()
);
create index on eastwind_deliveries (rider_ext_id);
create index on eastwind_deliveries (merchant_name);
create index on eastwind_deliveries (last_seen_at);

-- 可选：运单状态变化事件日志（做超时溯源时再启用）
-- create table eastwind_delivery_events(order_no text, status text, captured_at timestamptz, raw jsonb);
```

关联 MePonto 骑手：用 `rider_ext_id`（或电话）匹配现有骑手表，建一张映射或直接 join。
加盟商分析按 `merchant_name`（或后续映射到加盟商ID）聚合。

## 五、抓取器（Playwright，伪代码）

```js
// scraper/eastwind-rider-status.js  —— 跑在常开环境
const { chromium } = require('playwright');

const URL = 'https://eastwind.99app.com/monitor/riders/list';
const INGEST = process.env.MEPONTO_INGEST_URL;       // https://sys.meponto.com/api/eastwind/rider-status
const TOKEN  = process.env.MEPONTO_INGEST_TOKEN;     // 共享密钥
const TZ = 'America/Sao_Paulo';

(async () => {
  // 持久化上下文：保存登录态，过期才需人工重登一次
  const ctx = await chromium.launchPersistentContext('./.eastwind-profile', { headless: true });
  const page = await ctx.newPage();

  // 抓某个页面里指定接口的响应体
  async function grab(url, apiName) {
    const wait = page.waitForResponse(r => r.url().includes(apiName), { timeout: 30000 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return (await wait).json();
  }

  async function pull() {
    if (!inShiftWindow()) return;                    // 排班时段外跳过
    const capturedAt = new Date().toISOString();
    const riders   = await grab('https://eastwind.99app.com/monitor/riders/list',  'vendorFeatureInShift');
    const delivery = await grab('https://eastwind.99app.com/monitor/waybill/list', 'vendor.rider.monitor.delivery');
    await fetch(INGEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': TOKEN },
      body: JSON.stringify({ capturedAt, riders, delivery }),
    });
  }

  // 5分钟一轮；登录态失效时落日志/告警，人工重登
  await pull();
  setInterval(() => pull().catch(console.error), 5 * 60 * 1000);
})();

function inShiftWindow() { /* 按圣保罗时间判断当前是否排班时段，默认全天 */ return true; }
```

部署选项：常开的小服务器 / 一台常开电脑 / 轻量容器（Dockerfile 已有，可加一个 worker）。

## 六、MePonto 接收接口（新增）

```
POST /api/eastwind/rider-status
Header: X-Ingest-Token: <共享密钥>
Body:   { capturedAt, riders, delivery }   // 两个 Eastwind 原始 JSON
逻辑：   校验密钥 →
        riders   → 规整后 insert 到 rider_status_snapshots + rider_kpi_snapshots（按批次快照）
        delivery → 规整后按 order_no upsert 到 eastwind_deliveries（更新节点时间/状态/last_seen_at）
        captured_at 对齐到最近的5分钟
        幂等：快照按 captured_at 批次先删后插；运单按 order_no upsert
```

鉴权沿用现状的轻量模式即可（业务逻辑文档里提到 API 目前按 header 鉴权、属演示级）；
这个接收接口用独立共享密钥，跟前台用户鉴权隔离。

## 七、调度与时段

- 抓取频率：5 分钟/次。
- 排班时段：默认按圣保罗时间全天跑；确认正常后收窄到营业窗口（如 08:00–24:00）以省资源。
  时段配置放环境变量或一张配置表。

## 八、风险 / 维护点

1. **登录态过期**（唯一人工维护点）：cookie 失效需人工重新登录一次。
   可加：失效时告警（邮件/站内），并提供半自动重登脚本。
2. **页面/接口变更**：Eastwind 改版可能改字段或签名机制 → 抓取器需跟进。建议字段解析
   做容错（缺字段不报错、原始 JSON 全量留底在 `raw`）。
3. **风控**：用真实浏览器 + 正常频率（5 分钟）+ 单一会话，风险低；不要并发/高频。
4. **数据量**：每 5 分钟一批，单城每天约 288 批。注意定期归档/清理历史快照（如保留 90 天）。

## 九、工作量估计（确认后）

| 模块 | 说明 | 量级 |
|---|---|---|
| Supabase 建表 | 2 张表 + 索引 | 小 |
| 接收接口 | `/api/eastwind/rider-status` | 小 |
| Playwright 抓取器 | 拦截+POST+时段+登录态保活 | 中 |
| 部署常开环境 | 服务器/容器 + 登录态初始化 | 中 |
| 后台展示页 | 实时看板/出勤统计（可后置） | 中 |

## 十、待确认

1. 抓取器跑在哪：常开服务器 / 常开电脑 / 容器？
2. 排班时段与时区（默认圣保罗全天）。
3. 字段范围是否就按上面这套（含经纬度）。
4. 登录态过期时的告警方式。
5. 历史快照保留时长。
