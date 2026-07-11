# Phase 2 — 交易核心迁表方案（草案 / Draft for Review）

> 目标：把**订单、积分账本、站点库存**从 `app_state_records`（JSONB 镜像）迁到真正的
> Postgres 表，用数据库事务消灭多实例竞态（超卖 / 积分双花），并让读取成本与数据量解耦。
> 本文档是评审草案，**未创建任何迁移文件**；评审通过后再落 `supabase/migrations/`。

## 1. 为什么必须做

当前 `refreshCollectionsFromDatabase` + 内存读改写的架构有三个不可调参解决的问题：

1. **竞态**：兑换扣库存/扣积分是"内存读 → 内存改 → 异步回刷"，两个 serverless 实例
   并发处理同一商品/同一骑手时，互相看不见对方的扣减，理论上可超卖、可双花。
2. **读取 O(全量)**：每个请求拉全集合，耗时随业务量线性增长（账本类只增不减）。
3. **无约束**：JSONB 里没有外键、唯一约束、CHECK，数据质量靠应用层自觉。

## 2. 目标表结构（SQL 草案）

```sql
-- ============ 订单 ============
CREATE TABLE marketplace_orders (
  id            text PRIMARY KEY,
  account_type  text NOT NULL CHECK (account_type IN ('rider','partner')),
  rider_id      text,
  partner_id    text,
  product_id    text NOT NULL,
  points_spent  integer NOT NULL CHECK (points_spent >= 0),
  cash_due      numeric(10,2),
  status        text NOT NULL DEFAULT 'created'
                CHECK (status IN ('created','arrived','fulfilled','cancelled')),
  payment_status text CHECK (payment_status IN ('pending','submitted','paid')),
  review_status  text CHECK (review_status IN ('pending','approved','rejected')),
  coupon_id     text,
  coupon_discount integer,
  pickup_store_id text,
  station       text,
  franchise     text,
  -- 幂等键：客户端生成，防止重复提交产生双订单
  idempotency_key text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  arrived_at    timestamptz,
  picked_up_at  timestamptz,
  extra         jsonb NOT NULL DEFAULT '{}'::jsonb  -- 低频字段兜底，避免频繁加列
);
CREATE INDEX idx_orders_rider    ON marketplace_orders (rider_id, created_at DESC);
CREATE INDEX idx_orders_station  ON marketplace_orders (station, created_at DESC);
CREATE INDEX idx_orders_status   ON marketplace_orders (status) WHERE status IN ('created','arrived');

-- ============ 积分账本（append-only）============
CREATE TABLE points_ledger (
  id            text PRIMARY KEY,
  rider_id      text NOT NULL,
  type          text NOT NULL,          -- earn / spend / expire / adjust ...
  points        integer NOT NULL,
  status        text NOT NULL,
  source_type   text NOT NULL,
  source_id     text NOT NULL,
  order_id      text REFERENCES marketplace_orders(id),
  balance_after integer NOT NULL,
  reason_code   text NOT NULL DEFAULT '',
  note          text NOT NULL DEFAULT '',
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz
);
CREATE INDEX idx_ledger_rider ON points_ledger (rider_id, created_at DESC);
-- 账本只增：禁止 UPDATE/DELETE（服务角色也拦，防误操作）
CREATE RULE points_ledger_no_update AS ON UPDATE TO points_ledger DO INSTEAD NOTHING;
CREATE RULE points_ledger_no_delete AS ON DELETE TO points_ledger DO INSTEAD NOTHING;

-- ============ 余额快照（消灭全量求和）============
CREATE TABLE points_balances (
  rider_id   text PRIMARY KEY,
  available  integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 站点库存池 ============
CREATE TABLE station_stock (
  station_id text NOT NULL,
  product_id text NOT NULL,
  mode       text NOT NULL DEFAULT 'standard',   -- FpoMode: consignment 优先
  qty        integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  reserved   integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, product_id, mode)
);
```

## 3. 原子兑换 RPC（核心）

一次兑换 = 扣余额 + 记账本 + 预留库存 + 建订单，放进**一个事务**：

```sql
CREATE OR REPLACE FUNCTION redeem_order(
  p_order_id text, p_rider_id text, p_product_id text,
  p_points integer, p_station_id text, p_mode text,
  p_idempotency_key text
) RETURNS marketplace_orders LANGUAGE plpgsql AS $$
DECLARE v_order marketplace_orders;
BEGIN
  -- 幂等：同 key 直接返回已有订单（客户端重试安全）
  SELECT * INTO v_order FROM marketplace_orders WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_order; END IF;

  -- 1. 原子扣余额（行锁 + CHECK(available>=0) 双保险，杜绝双花）
  UPDATE points_balances SET available = available - p_points, updated_at = now()
   WHERE rider_id = p_rider_id AND available >= p_points;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_POINTS'; END IF;

  -- 2. 原子预留库存（杜绝超卖）
  UPDATE station_stock SET reserved = reserved + 1, updated_at = now()
   WHERE station_id = p_station_id AND product_id = p_product_id
     AND mode = p_mode AND qty - reserved >= 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'OUT_OF_STOCK'; END IF;

  -- 3. 账本 + 订单
  INSERT INTO points_ledger (id, rider_id, type, points, status, source_type,
    source_id, order_id, balance_after, created_by)
  VALUES (p_order_id || ':spend', p_rider_id, 'spend', -p_points, 'confirmed',
    'marketplace_order', p_order_id, p_order_id,
    (SELECT available FROM points_balances WHERE rider_id = p_rider_id), 'redeem_order');

  INSERT INTO marketplace_orders (id, account_type, rider_id, product_id,
    points_spent, station, idempotency_key)
  VALUES (p_order_id, 'rider', p_rider_id, p_product_id, p_points,
    p_station_id, p_idempotency_key)
  RETURNING * INTO v_order;

  RETURN v_order;
END $$;
```

取消/审核拒绝走对称的 `release_order` RPC（退余额 + 释放 reserved + 记冲正账本）。

## 4. 迁移与回滚策略（关键在"可回滚"）

**Feature flag：`transactionalCoreEnabled`（默认 off，符合 CLAUDE.md 护栏 #3）**

| 步骤 | 内容 | 回滚方式 |
| --- | --- | --- |
| M1 | 建表 + RPC 上线（无人调用，零风险） | drop 即可 |
| M2 | **双写**：兑换/取消同时写旧集合与新表，读仍走旧路径 | 关 flag |
| M3 | 一次性回填脚本：`app_state_records` → 新表；跑对账脚本（订单数、余额、库存三方核对） | 重跑回填 |
| M4 | **读切换**：兑换与余额读走新表（flag 灰度：先 1 个站点） | 关 flag 回旧读 |
| M5 | 停写旧集合，旧数据只读归档；从各路由 COLLECTIONS 删除已迁集合 | 保留 M2 双写代码一个版本期 |

对账脚本（M3/M4 期间每日跑）：
- `sum(points_ledger.points) per rider == points_balances.available`
- 新旧订单集合 diff 为空
- `station_stock.reserved == count(created/arrived 订单 per station/product)`

## 5. 事件与契约（护栏 #6）

- 订单创建发 `marketplace.order.created.v2`（v1 保留至旧路径下线）。
- API 契约不变（`/api/mall` 响应结构不动），先换实现再瘦身接口，两步分开发版。

## 6. 明确不做的事

- 不迁 riders / franchises / SOP 等低频集合（收益低，Phase 3 之后再议）。
- 不在本阶段改前端；不改 RBAC；不动 i18n。
- 不删除 `app_state_records` 表（归档保留）。

## 7. 验收（Definition of Done 对齐）

- [ ] flag 默认 off，PR 说明灰度计划
- [ ] 并发压测：同一骑手/同一商品 50 并发兑换，无双花无超卖
- [ ] 对账脚本三项全绿连续 7 天
- [ ] `npm run codex:preflight:full` 通过
- [ ] `docs/api.md` / 事件契约更新
