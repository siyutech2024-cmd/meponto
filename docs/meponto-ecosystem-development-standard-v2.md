# MePonto Ecosystem OS Development Standard v2.0

本文档是 MePonto / PontoSys / PontoMall 从第一天按大型系统建设的开发规范。PontoSys 指操作台、加盟商系统、Leader 工作台、骑手系统以及相关运营、财务、风控、SOP 和分析能力；PontoMall 指商城、积分兑换、库存预留和履约系统。本文档用于约束这些系统及 Partner 后台、供应链后台、宠物养成系统和后续新增模块的架构、代码、数据、权限、测试、上线和多人协作方式。

v2 在 v1 的基础上升级为平台操作系统规范。它不仅定义代码如何写，还定义 MePonto 的核心业务抽象、运营中台、调度域、风控域、组织体系、事件版本、读模型、实时基础设施、巴西本地合规和架构治理机制。

目标不是一开始做复杂微服务，而是在低运维、快速迭代的前提下，建立清晰边界，让新模块可接入、可灰度、可回滚、可审计，并且不破坏总系统。

## 0. v2 升级目标

v1 解决的是“怎么避免模块乱接入”。v2 进一步解决：

- 如何把 MePonto 设计成真正的骑手生态操作系统，而不是多个后台拼接。
- 如何把运营规则、调度、风控、组织、结算、积分、供应链、宠物成长放到统一平台能力中。
- 如何支持巴西本地化运营、LGPD 数据合规、PIX 风控和 In-App Chat 驱动的沟通体系。
- 如何让未来 CTO、技术团队、外包团队、融资尽调和合作伙伴都能理解系统边界。
- 如何在当前低运维架构下，为未来实时调度服务、数据仓库和独立 worker 留出升级路径。

v2 的核心判断：

```txt
MePonto 不是骑手后台。
MePonto 是面向骑手服务网络的 Ecosystem OS。
```

## 1. 总原则

### 1.1 产品定位

MePonto Ecosystem OS 是一个骑手服务生态系统，不是单一后台。系统由统一账号、统一权限、统一数据底座、统一事件机制和多个业务模块组成。

核心应用包括：

- 主后台 Admin Portal
- 加盟商后台 Franchise Portal
- Leader 工作台
- 骑手端 App
- Partner 后台
- 供应链后台
- PontoMall 商城系统
- 宠物养成系统
- 未来新增业务模块

### 1.2 架构原则

- 低运维优先：优先使用 Vercel、Supabase / Neon、Upstash、Sentry、Expo 等托管服务，避免自建云服务器。
- 模块化单体优先：早期不做复杂微服务，先做清晰模块边界。
- 统一身份：所有系统共用一个账号和权限体系，不允许子系统单独登录。
- 统一数据：核心对象必须有全局 ID，例如 User、Rider、Ponto、Franchise、Order、Slot。
- 统一权限：所有权限在服务端校验，前端隐藏按钮不能作为安全边界。
- 统一事件：跨模块通信优先通过事件，不允许随意跨模块直接调用。
- 统一审计：关键操作必须写 AuditLog。
- 流水优先：钱、积分、库存、宠物经验等必须用 ledger，不直接改余额。
- 灰度上线：新模块必须通过 feature flag 灰度，不允许直接全量上线。
- 可回滚：每次上线必须有关闭开关、数据修复方案和回滚方案。

### 1.3 平台核心业务抽象

MePonto 的长期核心不是某一个页面、后台或模块，而是以下业务抽象：

```txt
OrganizationNode   组织节点
Capability         能力
WorkUnit           工作单元
Assignment         分配关系
Availability       可用性
TrustScore         信任分
Ledger             流水
RuleSet            规则集
Event              事件
ReadModel          读模型
```

其中最重要的是 `WorkUnit`。

未来 MePonto 可能不仅管理外卖订单，还可能管理配送、维修、安装、线下服务、供应链履约、骑手培训、Partner 服务任务等。`Order`、`Slot`、`Task`、`Shift` 都可以逐步抽象到 `WorkUnit` 体系下。

```txt
WorkUnit
- id
- type: delivery_order / shift / training / repair_task / supply_task / partner_service
- status
- city_id
- zone_id
- ponto_id
- rider_id
- leader_id
- partner_id
- scheduled_start
- scheduled_end
- actual_start
- actual_end
- ruleset_id
- source_system
- created_at
```

任何新业务如果本质上是“需要人、地点、时间、规则、履约和结果”的任务，都应优先评估是否可以建模为 WorkUnit。

## 2. 推荐技术架构

### 2.1 阶段一架构

当前到中期建议使用：

```txt
Vercel
  - Next.js Web Apps
  - API Routes / Server Actions
  - Cron Jobs

Supabase 或 Neon
  - Postgres
  - Auth 或外接 Clerk/Auth0
  - Storage
  - Migrations

Upstash
  - Redis
  - Queue / QStash
  - Idempotency keys

Expo / EAS
  - Rider App

Sentry
  - Frontend errors
  - API errors
  - Release tracking

PostHog 或同类工具
  - Product analytics
```

### 2.2 不建议早期自建内容

早期不建议自建：

- ECS / VPS
- Nginx 集群
- 自管 PostgreSQL
- 自管 Redis
- 自管消息队列
- 自管日志平台
- 自管 Kubernetes

只有当出现高并发实时调度、常驻计算、合规要求或托管成本明显不合理时，再考虑拆出独立服务或云服务器。

### 2.3 Realtime Infrastructure Layer

Next.js 适合 Web、后台、API、Cron 和常规业务流程，但不应承担所有实时调度能力。MePonto 后续会出现：

- 骑手实时位置
- Leader 实时调度台
- 热区和运力缺口
- 在线状态
- 夜班安全定位
- 风控实时拦截
- 派单和任务状态

因此 v2 必须预留实时基础设施层：

```txt
Web Platform
  - Next.js
  - Admin / Franchise / Leader / Partner / Supply

Realtime Core
  - WebSocket / Realtime Gateway
  - Location ingestion
  - Rider availability
  - Dispatch state
  - Risk signal stream

Data Core
  - Postgres
  - Redis / Queue
  - Event Outbox
  - Read Models
```

阶段一可以使用 Supabase Realtime 或托管 WebSocket 能力。阶段二如实时压力增加，可拆出 Node / Go Realtime Core。

拆出 Realtime Core 的触发条件：

- 同时在线骑手超过当前托管方案稳定承载范围
- 位置上报频率高于后台系统可承受范围
- Leader 调度台需要秒级状态同步
- 风控需要实时拦截而不是事后扫描
- Serverless 函数冷启动影响实时体验

## 3. 代码仓库结构

### 3.1 推荐 monorepo

```txt
meponto/
  apps/
    admin-web/
    franchise-web/
    leader-web/
    rider-app/
    partner-web/
    supply-web/
    rewards-web/

  packages/
    auth/
    ui/
    config/
    database/
    api-client/
    permissions/
    domain/
    rules/
    events/
    module-registry/
    integration-gateway/
    i18n/
    types/

  services/
    api/
    worker/
    notification/
    scheduler/

  docs/
    architecture/
    product/
    sop/
    standards/
```

### 3.2 当前 Next.js 项目内的过渡结构

如果暂时仍在一个 Next.js 项目中，必须按以下边界组织：

```txt
app/
  admin/
  franchise/
  leader/
  rider/
  partner/
  supply-chain/
  marketplace/
  pet/

lib/
  auth/
  rbac/
  modules/
  gateway/
  domain/
  repositories/
  rules/
  events/
  ledger/
  audit/
  feature-flags/
  db/
  i18n/

components/
  shared/
  dashboard/
  forms/
  domain/

docs/
  meponto-ecosystem-development-standard-v1.md
```

禁止把所有业务逻辑写在 `page.tsx`。页面只负责组合 UI 和调用服务，业务规则必须进入 `lib/domain`、`lib/rules` 或对应模块 service。

## 4. 模块接入控制层

### 4.1 必须存在的核心层

系统必须有：

```txt
Module Registry + Integration Gateway
```

中文名：模块注册中心 + 集成网关。

任何新模块不得直接接入总系统。必须先注册模块定义，声明：

- 模块 ID
- 名称
- 版本
- 状态
- 路由前缀
- 负责人
- 允许角色
- 权限列表
- 可读数据
- 可写数据
- 禁止访问数据
- 订阅事件
- 发布事件
- feature flag
- health check

### 4.2 模块状态

```txt
disabled    已注册但不可用
beta        内部或灰度
active      正式启用
deprecated 计划下线
```

模块上线流程必须是：

```txt
registered -> disabled -> beta -> active
```

不得跳过 beta。

### 4.3 模块定义示例

```ts
export const marketplaceModule = {
  id: "marketplace",
  name: "PontoMall",
  version: "1.0.0",
  status: "disabled",
  routePrefix: "/marketplace",
  owners: ["product", "tech"],
  roles: [
    "Super Admin",
    "Regional Manager",
    "Franchise Owner",
    "Ponto Manager",
    "Leader",
    "Rider"
  ],
  permissions: [
    "marketplace.read",
    "marketplace.manage_products",
    "marketplace.manage_orders",
    "marketplace.redeem",
    "marketplace.fulfill",
    "marketplace.refund"
  ],
  dataAccess: {
    read: ["riders", "pontos", "franchises", "reward_points"],
    write: ["marketplace_orders", "points_ledger", "inventory_ledger"],
    forbidden: ["settlements", "finance_ledger"]
  },
  events: {
    subscribes: [
      "rider.activated",
      "points.earned",
      "inventory.updated"
    ],
    publishes: [
      "marketplace.order_created",
      "marketplace.order_fulfilled",
      "points.spent",
      "inventory.reserved"
    ]
  },
  featureFlag: "marketplace.enabled",
  healthCheck: "/api/marketplace/health"
};
```

### 4.4 API 必须过网关

所有模块 API 必须执行：

```ts
await requireModuleEnabled("marketplace");
await requirePermission(user, "marketplace.redeem");
```

模块未启用时，API 返回：

```json
{
  "error": "MODULE_DISABLED"
}
```

权限不足时，API 返回：

```json
{
  "error": "FORBIDDEN"
}
```

## 5. 权限与身份规范

### 5.1 统一账号

所有端共用统一账号体系。禁止出现：

- 加盟商后台单独账号系统
- Partner 后台单独账号系统
- 骑手 App 单独身份系统

允许一个用户拥有多个角色，但必须有清晰 scope。

### 5.2 基础角色

```txt
Super Admin
HQ Ops
Regional Manager
Franchise Owner
Site Manager
Ponto Manager
Leader
Rider
Partner
Supplier
Finance
Support
Auditor
```

### 5.3 权限格式

权限命名必须遵守：

```txt
module.action
```

示例：

```txt
rider.read
rider.write
rider.reveal_sensitive
franchise.manage
marketplace.redeem
marketplace.fulfill
supply.inventory_adjust
pet.manage_rules
finance.settle
audit.read
```

### 5.4 Scope 规则

权限必须同时校验角色和资源范围：

```txt
Super Admin       全局
Regional Manager  所属区域
Franchise Owner   所属加盟商
Ponto Manager     所属站点
Leader            所属站点/班组
Rider             仅本人
Partner           仅自己合作服务
Supplier          仅自己供应链数据
```

禁止只判断角色不判断资源归属。

## 6. 数据边界规范

### 6.1 核心对象

全系统核心对象包括：

```txt
User
Rider
Franchise
Ponto
Leader
Partner
Supplier
Order
Slot
Task
Incident
Settlement
LedgerEntry
RewardPoint
InventoryItem
MarketplaceOrder
PetProfile
AuditLog
```

### 6.2 全局 ID

每个核心对象必须有全局唯一 ID。禁止不同模块自己生成不兼容的 Rider ID、Ponto ID、Franchise ID。

建议格式：

```txt
rider_xxx
ponto_xxx
franchise_xxx
partner_xxx
order_xxx
slot_xxx
```

### 6.3 Repository 边界

模块不得直接读写其他模块核心表。必须通过 repository 或 service：

允许：

```ts
await riderPublicRepository.findById(riderId);
await marketplaceRepository.createOrder(input);
```

禁止：

```ts
await db.query("select * from finance_ledger");
await db.query("update riders set points = points - 100");
```

### 6.4 重要数据必须 append-only

以下数据必须使用 append-only 或状态流转，不允许直接覆盖或删除：

- `audit_logs`
- `finance_ledger`
- `points_ledger`
- `inventory_ledger`
- `settlement_ledger`
- `event_outbox`

需要修正时使用补偿记录，不直接改历史。

## 6A. 组织模型 Organization Domain

加盟体系扩大后，权限问题首先会出现在组织模型上。MePonto 必须明确组织层级，而不是只依赖角色名称。

### 6A.1 组织层级

```txt
MePonto HQ
  -> Country
    -> State
      -> City
        -> Region
          -> Cluster
            -> Franchise
              -> Ponto
                -> Team
                  -> Crew
```

### 6A.2 组织节点

```txt
organization_nodes
- id
- type: hq / country / state / city / region / cluster / franchise / ponto / team / crew
- parent_id
- name
- status
- metadata
- created_at
```

### 6A.3 组织成员关系

```txt
organization_memberships
- id
- user_id
- organization_node_id
- role
- scope
- starts_at
- ends_at
- status
```

### 6A.4 审批和升级关系

系统必须支持：

- reporting line
- approval flow
- escalation owner
- delegated permissions
- temporary assignment

示例：

```txt
Leader -> Ponto Manager -> Franchise Owner -> Regional Manager -> HQ Ops
```

任何资源权限判断都必须结合 organization scope。禁止只用 `role = Leader` 判断可访问范围。

## 6B. Read Model / CQRS 规范

运营后台、Leader 工作台、加盟商 dashboard、KPI、结算、热力图和宠物成长都需要聚合读模型。不能长期依赖复杂 join 实时计算所有页面。

### 6B.1 写模型与读模型分离

写模型负责真实业务事实：

```txt
orders
slots
work_units
ledger_entries
events
audit_logs
```

读模型负责页面查询：

```txt
rider_dashboard_read_model
leader_daily_ops_read_model
franchise_kpi_read_model
ponto_capacity_read_model
settlement_summary_read_model
marketplace_order_read_model
pet_profile_read_model
```

### 6B.2 Projection Worker

读模型由事件或定时任务更新：

```txt
event_outbox -> projection_worker -> read_model
```

读模型可以重建。任何读模型不得成为唯一事实来源。

### 6B.3 使用场景

必须优先使用 read model 的页面：

- Dashboard
- Realtime overview
- Franchise KPI
- Leader daily ops
- Settlement summary
- Hotzone analytics
- PontoMall order list
- Pet profile

### 6B.4 物化视图

早期可以使用 Postgres view / materialized view。数据量增加后再拆 projection worker 和 analytics store。

## 7. Ledger 规范

### 7.1 适用范围

以下业务必须使用 ledger：

- 钱
- 积分
- 库存
- 优惠券
- 宠物经验
- Partner 分佣
- 加盟商结算

积分规则的全系统唯一标准是：

```txt
docs/meponto-points-economy-standard.md
```

骑手端、Partner、PontoMall、后台审核、风控、财务、分析、游戏化任务都必须遵守同一套积分账本、限制、防刷、过期、兑换和退款规则。任何模块不得单独定义另一套积分余额或积分消费规则。

### 7.2 积分流水示例

```txt
points_ledger
- id
- rider_id
- type: earn / spend / refund / adjust
- points
- source_type
- source_id
- balance_after
- created_by
- created_at
```

### 7.3 库存流水示例

```txt
inventory_ledger
- id
- stock_item_id
- type: reserve / deduct / release / restock / adjust
- quantity
- source_type
- source_id
- created_by
- created_at
```

### 7.4 金额流水示例

```txt
finance_ledger
- id
- account_type
- account_id
- type: receivable / payable / adjustment / penalty / payout
- amount
- currency
- source_type
- source_id
- status
- created_at
```

## 8. 事件机制规范

### 8.1 事件命名

事件命名必须使用：

```txt
domain.action_past_tense
```

示例：

```txt
rider.created
rider.bound_to_ponto
slot.completed
order.completed
kpi.calculated
points.earned
marketplace.order_created
marketplace.order_fulfilled
inventory.reserved
pet.level_up
settlement.ready
```

### 8.1A 事件版本

所有正式事件必须有版本。早期代码中可以用字段 `version`，长期应进入 schema registry。

推荐格式：

```txt
event_name: marketplace.order_created
version: 1
```

禁止用破坏性方式直接修改已发布事件 payload。需要变更时：

```txt
marketplace.order_created v1
marketplace.order_created v2
```

旧 consumer 继续消费 v1，新 consumer 切换到 v2。v1 下线必须经过 deprecation 周期。

### 8.1B 事件 Schema Registry

每个事件必须登记 schema：

```txt
event_schemas
- id
- event_name
- version
- schema_json
- owner_module
- status: active / deprecated
- created_at
```

事件 payload 必须包含：

```txt
event_id
event_name
version
occurred_at
producer_module
correlation_id
idempotency_key
payload
```

任何模块订阅事件前，必须确认对应 schema 版本。

### 8.2 Outbox 表

所有跨模块事件先写入 `event_outbox`：

```txt
event_outbox
- id
- module_id
- event_name
- payload
- status: pending / processing / done / failed
- retry_count
- error
- created_at
- processed_at
```

### 8.3 发布事件必须校验

模块只能发布自己声明过的事件。

```ts
await publishEvent("marketplace", "marketplace.order_created", payload);
```

如果事件未声明，必须抛错：

```txt
EVENT_NOT_ALLOWED
```

### 8.4 事件处理必须幂等

事件 handler 必须支持重复执行，不允许重复扣积分、重复扣库存、重复发奖励。

每个 handler 必须记录：

```txt
event_id
handler_name
status
processed_at
```

## 9. 业务规则层规范

业务规则不得散落在页面、组件和 API handler 中。必须放入 `rules` 或对应 domain service。

建议目录：

```txt
lib/rules/
  kpi.ts
  settlement.ts
  rewards.ts
  marketplace.ts
  inventory.ts
  pet-growth.ts
  franchise-pricing.ts
```

示例：

```ts
calculateMarketplaceRedeemability(input);
calculateKpiScore(input);
calculatePetExp(input);
calculateFranchisePrice(input);
```

规则函数必须可单元测试。

## 10. Feature Flag 与灰度规范

### 10.1 所有新模块必须有 feature flag

示例：

```json
{
  "marketplace.enabled": true,
  "marketplace.rollout": {
    "type": "ponto",
    "ids": ["ponto_001"]
  }
}
```

### 10.2 支持的灰度范围

必须支持至少以下灰度方式：

- 全部关闭
- 仅 Super Admin
- 指定区域
- 指定加盟商
- 指定站点
- 指定用户
- 百分比灰度

### 10.3 出事故时的第一动作

新模块出事故时，第一动作是：

```txt
关闭 feature flag
```

而不是回滚整站。

## 11. API 设计规范

### 11.1 API 必须分层

API handler 只做：

- 解析请求
- 获取用户
- 模块启用检查
- 权限检查
- 调用 service
- 返回响应

业务逻辑必须在 service / domain / rules。

### 11.2 响应格式

成功：

```json
{
  "data": {}
}
```

列表：

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

错误：

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Permission denied"
  }
}
```

### 11.3 幂等

以下操作必须支持 idempotency key：

- 创建兑换订单
- 扣积分
- 扣库存
- 创建结算
- 发放奖励
- 发起付款
- 创建外部服务订单

## 12. 前端开发规范

### 12.1 页面职责

页面只负责：

- 获取数据
- 展示数据
- 调用 action / API
- 管理局部 UI 状态

页面禁止：

- 写复杂业务规则
- 直接拼接权限逻辑
- 直接计算结算
- 直接改 ledger
- 直接跨模块取数据

### 12.2 组件分层

```txt
components/shared      通用 UI
components/domain      业务组件
components/forms       表单组件
components/tables      表格组件
components/charts      图表组件
```

### 12.3 国际化

中 / 英 / 葡必须从模块创建时支持。

重要页面必须使用模块自己的本地化 copy，不依赖全局文本扫描。

```txt
module.copy.zh
module.copy.en
module.copy.pt
```

## 13. 移动端规范

骑手端 App 必须与总系统共用：

- Auth
- User ID
- Rider ID
- Permission / Scope
- API client
- Event rules
- i18n copy

移动端不允许单独实现积分、宠物、PontoMall、排班、收入等核心规则。

移动端只展示服务端计算结果，关键动作必须走服务端 API。

## 14. 测试规范

### 14.1 每个模块必须有测试清单

新增模块必须包含：

- Unit tests
- API tests
- Permission tests
- Data consistency tests
- Workflow smoke tests
- Manual QA checklist

### 14.2 必测内容

必须测试：

- 模块关闭时 API 拒绝
- 权限不足时 API 拒绝
- 资源越权访问被拒绝
- ledger 不出现负数或重复扣减
- 事件重复执行不产生重复结果
- 灰度外用户看不到入口
- 关键操作写 audit log
- 失败后可以重试或回滚

### 14.3 上线前命令

当前项目上线前至少运行：

```bash
npm run build
npm run check
```

新增稳定页面或 API 必须加入 smoke manifest。

## 15. 上线规范

### 15.1 分支策略

```txt
main       线上稳定版本
develop    集成测试版本
feature/*  功能分支
hotfix/*   紧急修复
release/*  发布分支
```

### 15.2 PR 必填信息

每个 PR 必须说明：

- 改了什么
- 影响哪些模块
- 影响哪些角色
- 是否新增权限
- 是否新增数据库 migration
- 是否新增事件
- 是否影响 ledger
- 是否影响结算、积分、库存或宠物成长
- 测试结果
- 回滚方案

### 15.3 发布流程

```txt
feature branch
  -> PR
  -> build/check
  -> preview URL
  -> product QA
  -> develop
  -> staging
  -> production
```

新模块必须：

```txt
disabled -> beta -> active
```

### 15.4 回滚策略

每次上线必须有至少一个回滚方式：

- 关闭 feature flag
- 回滚 Vercel deployment
- 停止事件 consumer
- 执行补偿 ledger
- 禁用模块入口

## 16. 数据库 Migration 规范

### 16.1 禁止手动改生产库

所有 schema 变化必须通过 migration。

### 16.2 Migration 必须说明

- 新增表
- 修改字段
- 是否 backfill
- 是否影响线上数据
- 是否可逆
- 是否需要停机
- 回滚方式

### 16.3 高风险变更

以下变更必须单独评审：

- 删除字段
- 修改字段类型
- 修改金额、积分、库存相关表
- 修改权限表
- 修改核心 ID
- 大规模 backfill

## 17. 审计规范

### 17.1 必须审计的操作

- 登录和敏感数据查看
- 创建 / 修改 / 删除 Rider
- 修改 Ponto / Franchise
- 修改权限
- 创建或调整结算
- 积分发放、扣减、退款
- 库存调整
- 商品上下架
- 订单履约
- 宠物经验规则修改
- Partner 分佣调整
- 手动数据修复

### 17.2 AuditLog 字段

```txt
audit_logs
- id
- actor_id
- actor_role
- action
- target_type
- target_id
- before
- after
- ip
- user_agent
- created_at
```

## 18. 模块健康检查

每个正式模块必须提供：

```txt
GET /api/{module}/health
```

返回：

```json
{
  "module": "marketplace",
  "status": "ok",
  "checks": {
    "database": "ok",
    "eventOutbox": "ok",
    "ledger": "ok"
  }
}
```

health check 失败时：

- Sentry 告警
- 后台模块管理页提示
- 可暂停事件消费
- 可关闭模块 feature flag

## 19. 多人协作规范

### 19.1 模块负责人

每个模块必须有：

- Product owner
- Tech owner
- QA owner

### 19.2 禁止事项

禁止：

- 多人直接改 main
- 无 PR 上线
- 无 migration 改数据库
- 无权限声明新增 API
- 无事件声明跨模块通信
- 无 feature flag 上线新模块
- 无 audit 修改钱、积分、库存、权限
- 每个模块自己定义 Rider / Ponto / Order 类型

### 19.3 每日同步

团队每日同步必须包含：

- 今日改哪些模块
- 是否有 migration
- 是否有权限变化
- 是否有事件变化
- 是否影响上线
- 是否有冲突文件

## 20. 新模块接入流程

新增模块必须按以下流程执行：

1. 编写模块需求说明
2. 定义模块边界
3. 提交 ModuleDefinition
4. 定义权限矩阵
5. 定义数据访问范围
6. 定义事件发布和订阅
7. 定义数据库 migration
8. 定义 ledger 和 audit 规则
9. 定义 feature flag 和灰度范围
10. 开发 API 和 UI
11. 编写测试
12. Preview 环境验证
13. beta 灰度
14. 观察错误和指标
15. active 正式启用

任何步骤缺失，不允许上线。

## 20A. 运营规则引擎

MePonto 是重运营系统，不能只依赖写死在代码里的规则函数。v2 必须引入运营规则引擎，作为 KPI、补贴、定价、积分、宠物成长、加盟商奖励、Partner 分佣、风控动作的统一规则底座。

### 20A.1 Rule Engine 目标

规则引擎必须支持：

- 城市级规则
- 区域级规则
- 加盟商级规则
- 站点级规则
- 骑手等级规则
- 时间段规则
- 天气/节假日/活动规则
- AB Test
- 生效时间和失效时间
- 优先级
- 审批和审计
- 回滚

### 20A.2 规则对象

```txt
rule_sets
- id
- domain: kpi / settlement / rewards / pet / risk / dispatch / franchise_pricing
- name
- version
- scope_type: global / country / city / region / franchise / ponto / rider_segment
- scope_id
- priority
- status: draft / active / archived
- effective_from
- effective_to
- created_by
- approved_by
- created_at
```

```txt
rules
- id
- rule_set_id
- condition_json
- action_json
- priority
- status
```

### 20A.3 禁止事项

禁止把以下规则长期写死在页面或 API 中：

- KPI 权重
- 雨天补贴
- 夜班补贴
- 高峰奖励
- 加盟商价格浮动
- 积分发放
- 宠物经验
- Partner 分佣
- 风控处罚
- 供应链库存预警

早期可以用 TypeScript rule functions 实现，但必须以 `RuleSet` 的形式组织，并保留迁移到配置化规则引擎的路径。

## 20B. 调度域 Dispatch Domain

调度是 MePonto 的核心业务域之一，不得只散落在 rider、slot、task 页面里。

### 20B.1 调度域职责

```txt
dispatch/
  availability       骑手可用性
  capacity           区域运力容量
  assignment         骑手和工作单元分配
  shift-planning     排班计划
  hotzone            热区和时段策略
  rebalancing        运力再平衡
  exceptions         调度异常
```

### 20B.2 核心对象

```txt
rider_availability
- rider_id
- status: available / busy / offline / restricted
- location
- ponto_id
- slot_id
- updated_at
```

```txt
dispatch_assignments
- id
- work_unit_id
- rider_id
- leader_id
- status: proposed / accepted / rejected / completed / cancelled
- assigned_at
- accepted_at
- completed_at
```

```txt
capacity_snapshots
- id
- city_id
- zone_id
- ponto_id
- time_bucket
- active_riders
- required_riders
- gap
- source
```

调度域后续可以从 Next.js 模块化单体拆为独立 Realtime Core，但早期必须先有清晰 domain 边界。

## 20C. 风控域 Risk Domain

巴西本地运营必须从第一天建设风控意识。风控不是后期补丁。

### 20C.1 风控风险

必须防范：

- 假骑手
- 假 GPS
- 多账号
- 套补贴
- 假库存
- 假兑换
- 内部串通
- Leader 刷奖励
- Partner 套现
- PIX fraud
- 异常退款
- 站点虚假履约

### 20C.2 风控对象

```txt
risk_events
- id
- actor_type
- actor_id
- event_type
- severity
- payload
- source_module
- created_at
```

```txt
risk_rules
- id
- name
- domain
- condition_json
- action_json
- status
```

```txt
trust_scores
- entity_type: rider / leader / franchise / partner / supplier
- entity_id
- score
- reason
- updated_at
```

```txt
risk_actions
- id
- target_type
- target_id
- action: warn / hold_settlement / block_redeem / require_review / suspend
- reason
- status
- created_at
```

### 20C.3 风控接入要求

以下模块必须向 Risk Domain 发布事件：

- finance
- settlement
- marketplace
- rewards
- pet
- supply-chain
- partner
- dispatch
- rider
- franchise

风控动作不能只停留在报表，必须能影响：

- 是否允许兑换
- 是否允许结算
- 是否允许接任务
- 是否需要人工复核
- 是否冻结账号或站点

## 21. PontoMall 模块接入示例

PontoMall 上线时必须满足：

- 注册 `marketplace` 模块
- 新增 `marketplace.*` 权限
- 新增商品、SKU、兑换订单表
- 积分扣减走 `points_ledger`
- 库存扣减走 `inventory_ledger`
- 兑换成功发布 `marketplace.order_created`
- 履约完成发布 `marketplace.order_fulfilled`
- 宠物模块通过事件监听，不直接由 PontoMall 调用
- 使用 feature flag 先给一个站点灰度
- 所有后台操作写 audit log
- 支持取消、退款、库存释放

## 22. 宠物模块接入示例

宠物模块必须通过事件获得经验：

```txt
order.completed
shift.completed
points.earned
marketplace.order_fulfilled
training.completed
```

宠物模块不得直接读取完整订单表计算奖励，必须通过事件或受控 read model。

宠物经验必须走 ledger：

```txt
pet_exp_ledger
```

## 23. 供应链模块接入示例

供应链模块必须管理：

- 商品
- 物料
- 入库
- 出库
- 调拨
- 站点库存
- 盘点

库存变化必须进入 `inventory_ledger`。PontoMall 只能 reserve / deduct，不允许直接改库存余额。

## 24. Partner 模块接入示例

Partner 模块管理：

- 维修店
- 租车服务
- 装备供应商
- 手机卡 / 加油卡 / 金融服务
- 服务订单
- 骑手评价
- 分佣

Partner 分佣必须进入 finance ledger 或 partner commission ledger，不允许只存在页面计算。

## 25. 运营后台模块管理页

系统应建设：

```txt
/system/modules
```

展示：

- 模块名称
- 状态
- 版本
- 负责人
- 启用范围
- 权限数量
- 事件数量
- 健康状态
- 最近错误
- 最后部署时间

Super Admin 可：

- 开启 / 关闭模块
- 调整灰度范围
- 查看模块健康
- 查看事件失败
- 查看权限声明
- 查看审计日志

## 25A. 运营中台能力

MePonto 是重运营平台，必须建设运营中台，而不是只建设后台页面。

运营中台包含：

```txt
operations-center/
  rule-sets
  dispatch-control
  risk-review
  incident-center
  franchise-performance
  rider-lifecycle
  communication-center
  training-center
  audit-review
```

### 25A.1 运营中台核心能力

- 查看城市、区域、加盟商、站点、Leader、骑手的运营状态。
- 配置规则集和灰度策略。
- 查看调度缺口、hotzone 和运力容量。
- 处理风险事件和人工复核。
- 管理 In-App Chat / Push / 站内信模板。
- 查看加盟商 KPI、结算状态和整改事项。
- 查看骑手生命周期、培训、留存和淘汰。
- 查看事件失败、数据缺口和审计异常。

### 25A.2 运营动作必须可追踪

运营人员在后台做的动作必须形成：

```txt
operator_action
  -> audit_log
  -> event
  -> affected_entity
```

例如：

```txt
调整站点 KPI 规则
  -> audit_log
  -> rule_set.updated
  -> franchise_kpi_read_model rebuild
```

运营中台是 MePonto 的指挥系统，不是普通 CRUD 后台。

## 26. 监控与告警

必须监控：

- API 500 错误
- 权限拒绝异常升高
- 事件失败
- ledger 负数
- 库存超卖
- 积分重复扣减
- 结算异常
- 登录异常
- 上传失败
- 外部 webhook 失败

推荐使用：

- Sentry：错误监控
- Vercel logs：部署和 API 日志
- Supabase / Neon：数据库监控
- PostHog：产品行为
- Slack / In-App Chat：关键告警

## 27. 安全规范

### 27.1 敏感数据

以下数据必须受保护：

- CPF
- PIX
- 银行信息
- 电话
- 地址
- 身份证件
- 合同
- 财务结算

敏感数据读取必须：

- 服务端权限校验
- 最小字段返回
- 默认脱敏
- reveal 操作写 audit log

### 27.2 外部接口

所有外部 webhook 必须：

- 验签
- 幂等
- 限流
- 日志
- 可重试

## 27A. 巴西本地合规与运营基础设施

MePonto 的核心市场在巴西，系统设计必须考虑巴西本地合规、支付、沟通和运营习惯。

### 27A.1 LGPD 数据合规

系统必须支持 LGPD 相关能力：

- 用户授权 consent 记录
- 数据使用目的 purpose
- 数据保留期限 retention
- 数据删除请求
- 数据导出请求
- 账号删除或匿名化
- 敏感数据访问审计
- 第三方数据共享记录

建议数据表：

```txt
privacy_consents
- id
- user_id
- purpose
- status
- consented_at
- revoked_at
```

```txt
privacy_requests
- id
- user_id
- type: export / delete / anonymize / correction
- status
- requested_at
- completed_at
```

任何涉及 CPF、PIX、地址、电话、位置、银行账户的数据处理，都必须有访问权限和审计。

### 27A.2 PIX 与金融风控

涉及 PIX、分佣、提现、结算、退款时，必须进入金融风控：

- PIX key 变更要审计
- 新 PIX key 首次使用可进入冷却期
- 大额 payout 需人工复核
- 高频变更收款账户需触发 risk event
- 结算异常不得自动放款
- 退款必须生成补偿 ledger

### 27A.3 PontoSys 应用内聊天作为核心通信基础设施

在巴西，应用内聊天不是普通通知渠道，而是 PontoSys 原生的核心运营基础设施。禁止把聊天能力实现为任何第三方聊天平台的必要依赖。

Communication Domain 必须支持：

```txt
communication/
  chat_rooms
  chat_messages
  chat_memberships
  chat_moderation
  push
  email
  sms
  templates
  delivery_status
  consent
```

应用内聊天必须具备：

- 模板管理
- 发送审计
- 失败重试
- 房间消息和个人消息区分
- 已读状态
- 权限控制
- 内容审核和举报处理
- 消息留存规则
- 关键运营消息留痕
- 与 Incident / Rider / Ponto 关联
- 推送通知授权状态

禁止把应用内聊天当作散落在页面里的发送按钮，或绕过 PontoSys 审计的外部群聊链接。

## 28. 文档规范

每个模块必须有文档：

```txt
docs/modules/{module}.md
```

内容包括：

- 模块目标
- 角色和权限
- 数据表
- API
- 事件
- 业务规则
- 测试清单
- 上线清单
- 回滚方案
- 运营 SOP

## 28A. 架构治理规范

随着团队扩大，不能只靠口头沟通决定架构。MePonto 必须建立轻量但正式的架构治理流程。

### 28A.1 RFC 流程

以下事项必须提交 RFC：

- 新增一级模块
- 新增核心 domain
- 新增 ledger 类型
- 新增事件大类
- 修改权限模型
- 修改组织模型
- 修改结算规则
- 引入新的基础设施
- 拆分独立服务
- 大规模数据迁移

RFC 文件位置：

```txt
docs/rfcs/
  0001-marketplace-module.md
  0002-realtime-core.md
```

RFC 必须包含：

- 背景
- 目标
- 非目标
- 方案
- 数据影响
- 权限影响
- 事件影响
- 迁移计划
- 风险
- 回滚方案

### 28A.2 ADR 决策记录

架构决策必须写 ADR：

```txt
docs/adrs/
  0001-use-vercel-supabase-upstash.md
  0002-use-event-outbox.md
  0003-ledger-for-points-inventory-finance.md
```

ADR 必须说明：

- 决策
- 背景
- 替代方案
- 为什么选择
- 后果
- 复盘时间

### 28A.3 技术债管理

技术债不得只存在脑子里。必须记录：

```txt
docs/technical-debt.md
```

每条技术债包含：

- 描述
- 风险等级
- 影响模块
- 临时方案
- 计划解决时间
- 负责人

### 28A.4 架构评审委员会

早期可以由 2-3 人承担：

- Product owner
- Tech owner
- Ops owner

中期扩展为：

- CTO / Tech Lead
- Backend owner
- Frontend owner
- Data owner
- Security owner
- Operations owner

任何高风险模块必须评审后进入 beta。

## 29. 版本规则

模块版本使用：

```txt
major.minor.patch
```

示例：

```txt
marketplace v1.0.0
pet v0.1.0
supply-chain v0.2.0
```

规则：

- patch：bug fix
- minor：新增兼容功能
- major：破坏性改动

## 30. 最终上线门禁

任何模块上线前必须满足：

```txt
[ ] ModuleDefinition 已注册
[ ] Feature flag 已配置
[ ] 权限矩阵已确认
[ ] 数据访问边界已确认
[ ] Migration 已审核
[ ] Ledger 规则已实现
[ ] AuditLog 已实现
[ ] 事件已声明
[ ] API 服务端权限已校验
[ ] 测试通过
[ ] Preview 验证通过
[ ] 灰度范围明确
[ ] Sentry 监控可用
[ ] 回滚方案明确
[ ] 运营 SOP 已准备
```

## 31. 结论

MePonto 不应该从一个小后台自然膨胀成混乱系统，而应该从第一天就以 Ecosystem OS 的方式建设。当前阶段不需要复杂微服务，但必须有模块边界、权限边界、数据边界、事件边界、运营边界、组织边界和上线边界。

本规范是所有开发者、外包团队、产品经理和运营人员共同遵守的基础规则。任何新增系统、页面、API、数据库表或业务规则，都必须符合本文档标准。

## 32. v1 到 v2 的升级摘要

v2 相比 v1 的核心升级：

- 新增平台核心业务抽象：WorkUnit、Capability、Assignment、Availability、TrustScore、RuleSet、ReadModel。
- 新增运营规则引擎，避免所有运营策略写死在代码里。
- 新增 Dispatch Domain，把 slot、task、availability、capacity、hotzone 统一到调度域。
- 新增 Risk Domain，覆盖假骑手、假 GPS、套补贴、库存、积分、PIX、Partner 套现等风险。
- 新增 Organization Domain，支持 HQ、Country、City、Region、Cluster、Franchise、Ponto、Team、Crew。
- 新增 Read Model / CQRS 规范，避免 dashboard、KPI、结算、热力图长期依赖复杂 join。
- 新增 Event Versioning 和 Event Schema Registry，避免事件 payload 变化导致 consumer 爆炸。
- 新增 Realtime Infrastructure Layer，为骑手定位、Leader 调度台、在线状态和实时风控预留拆分路径。
- 新增巴西本地化合规：LGPD、PIX 风控、In-App Chat 作为核心通信基础设施。
- 新增运营中台能力，把系统从“技术后台”升级为“运营指挥系统”。
- 新增 RFC、ADR、技术债和架构评审机制，支撑未来 CTO 和技术团队扩张。

v2 的最终目标：

```txt
让 MePonto 可以持续增加业务模块，
但不会因为模块增加而失控。
```
