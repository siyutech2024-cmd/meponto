# MePonto Ecosystem OS Development Standard v1.0

本文档是 MePonto / PontoSys / PontoMall 从第一天按大型系统建设的开发规范。它用于约束主后台、加盟商后台、Leader 工作台、骑手端 App、Partner 后台、供应链后台、PontoMall、宠物养成系统及后续新增模块的架构、代码、数据、权限、测试、上线和多人协作方式。

目标不是一开始做复杂微服务，而是在低运维、快速迭代的前提下，建立清晰边界，让新模块可接入、可灰度、可回滚、可审计，并且不破坏总系统。

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
- PontoMall
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

MePonto 不应该从一个小后台自然膨胀成混乱系统，而应该从第一天就以 Ecosystem OS 的方式建设。当前阶段不需要复杂微服务，但必须有模块边界、权限边界、数据边界、事件边界和上线边界。

本规范是所有开发者、外包团队、产品经理和运营人员共同遵守的基础规则。任何新增系统、页面、API、数据库表或业务规则，都必须符合本文档标准。
