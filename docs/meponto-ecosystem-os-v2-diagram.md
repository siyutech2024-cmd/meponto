# MePonto Ecosystem OS v2 图示

## 1. 总体架构图

```mermaid
flowchart TB
  subgraph Apps["应用入口层"]
    Admin["主后台 Admin Portal"]
    Franchise["加盟商后台 Franchise Portal"]
    Leader["Leader 工作台"]
    Rider["骑手端 App"]
    Partner["Partner 后台"]
    Supply["供应链后台"]
    Market["积分商城"]
    Pet["宠物养成"]
  end

  subgraph Gateway["平台控制层"]
    Auth["统一 Auth / SSO"]
    RBAC["RBAC + Scope 权限"]
    Registry["Module Registry 模块注册中心"]
    Integration["Integration Gateway 集成网关"]
    Flags["Feature Flags / 灰度"]
    Audit["AuditLog 审计"]
  end

  subgraph Core["核心业务域"]
    Org["Organization Domain\n组织 / 区域 / 加盟商 / 站点"]
    RiderD["Rider Domain\n骑手生命周期"]
    Ponto["Ponto Domain\n站点运营"]
    Dispatch["Dispatch Domain\n排班 / 调度 / 运力"]
    WorkUnit["WorkUnit System\n订单 / 任务 / 班次 / 服务"]
    Finance["Finance & Settlement\n定价 / 结算 / 分佣"]
    Rule["Rule Engine\nKPI / 补贴 / 奖励 / 风控规则"]
    Risk["Risk Domain\n风控 / TrustScore"]
  end

  subgraph Business["可插拔业务模块"]
    Marketplace["Marketplace\n积分商城"]
    Rewards["Rewards\n积分账户"]
    PetDomain["Pet Domain\n成长 / 等级 / 道具"]
    SupplyChain["Supply Chain\n库存 / 物料 / 调拨"]
    PartnerDomain["Partner Domain\n维修 / 租车 / 服务商"]
    Training["Training / SOP\n培训 / 考试 / 巡查"]
    Comms["Communication\nWhatsApp / Push / 站内信"]
  end

  subgraph Data["数据与基础设施"]
    DB["Postgres\nSource of Truth"]
    Ledger["Ledger Tables\n钱 / 积分 / 库存 / 经验"]
    Outbox["Event Outbox"]
    Queue["Queue / Redis / QStash"]
    ReadModel["Read Models / CQRS"]
    Storage["Object Storage\n合同 / 图片 / 文件"]
    Sentry["Sentry / Logs / Monitoring"]
  end

  Apps --> Auth
  Apps --> RBAC
  Apps --> Registry
  Registry --> Integration
  Integration --> Flags
  Integration --> Audit

  Integration --> Core
  Core --> Business

  Core --> DB
  Business --> DB
  Finance --> Ledger
  Marketplace --> Ledger
  Rewards --> Ledger
  SupplyChain --> Ledger
  PetDomain --> Ledger

  Core --> Outbox
  Business --> Outbox
  Outbox --> Queue
  Queue --> ReadModel
  DB --> ReadModel

  Apps --> ReadModel
  Apps --> Storage
  Gateway --> Sentry
  Core --> Sentry
  Business --> Sentry
```

## 2. 新模块接入流程图

```mermaid
flowchart LR
  A["提出新模块需求"] --> B["定义模块边界"]
  B --> C["提交 ModuleDefinition"]
  C --> D{"Registry 是否通过"}
  D -- 否 --> C
  D -- 是 --> E["声明权限 / Scope"]
  E --> F["声明数据访问边界"]
  F --> G["声明事件发布与订阅"]
  G --> H["设计 Ledger / Audit / Migration"]
  H --> I["Feature Flag 默认关闭"]
  I --> J["开发 API + UI"]
  J --> K["Preview 环境验证"]
  K --> L["Beta 灰度：指定站点 / 用户"]
  L --> M{"健康检查和指标是否正常"}
  M -- 否 --> N["关闭 Feature Flag / 修复"]
  N --> K
  M -- 是 --> O["Active 正式启用"]
```

## 3. 模块网关控制逻辑

```mermaid
sequenceDiagram
  participant U as User / App
  participant API as Module API
  participant G as Integration Gateway
  participant R as Module Registry
  participant P as Permission Service
  participant F as Feature Flag
  participant S as Domain Service
  participant A as AuditLog

  U->>API: Request
  API->>G: requireModuleEnabled(moduleId)
  G->>R: check registered + status
  R-->>G: active / beta / disabled
  G->>F: check rollout scope
  F-->>G: allowed / denied
  API->>P: requirePermission(user, action, resource)
  P-->>API: allowed / forbidden
  API->>S: execute business action
  S->>A: write audit log
  S-->>API: result
  API-->>U: response
```

## 4. 事件与数据流图

```mermaid
flowchart TB
  Action["业务动作\n例如骑手兑换商品"] --> Tx["数据库事务"]
  Tx --> Order["marketplace_order"]
  Tx --> Points["points_ledger\nspend"]
  Tx --> Inventory["inventory_ledger\nreserve"]
  Tx --> Audit["audit_logs"]
  Tx --> Event["event_outbox\nmarketplace.order_created.v1"]

  Event --> Worker["Event Worker"]
  Worker --> Rewards["Rewards Projection"]
  Worker --> Pet["Pet Exp Handler"]
  Worker --> Risk["Risk Event Handler"]
  Worker --> Analytics["Analytics / Read Model"]

  Rewards --> Read1["rider_points_read_model"]
  Pet --> Read2["pet_profile_read_model"]
  Risk --> Read3["trust_score_read_model"]
  Analytics --> Read4["franchise_dashboard_read_model"]
```

## 5. 核心业务抽象图

```mermaid
erDiagram
  ORGANIZATION_NODE ||--o{ PONTO : owns
  ORGANIZATION_NODE ||--o{ FRANCHISE : contains
  FRANCHISE ||--o{ PONTO : operates
  PONTO ||--o{ TEAM : has
  TEAM ||--o{ LEADER : manages
  PONTO ||--o{ RIDER : serves

  RIDER ||--o{ AVAILABILITY : reports
  RIDER ||--o{ ASSIGNMENT : receives
  WORK_UNIT ||--o{ ASSIGNMENT : assigned_by
  WORK_UNIT ||--o{ EVENT : emits

  RIDER ||--o{ LEDGER_ENTRY : affects
  PONTO ||--o{ READ_MODEL : aggregates
  FRANCHISE ||--o{ SETTLEMENT : receives
  RULE_SET ||--o{ WORK_UNIT : evaluates
  RISK_EVENT ||--o{ TRUST_SCORE : updates
```

## 6. 部署与低运维架构图

```mermaid
flowchart TB
  Dev["GitHub PR / Feature Branch"] --> Preview["Vercel Preview"]
  Preview --> QA["Product + QA 验证"]
  QA --> Prod["Vercel Production"]

  Prod --> Web["Next.js Web + API"]
  Web --> DB["Supabase / Neon Postgres"]
  Web --> Storage["Supabase Storage / R2"]
  Web --> Queue["Upstash Redis / QStash"]
  Web --> Cron["Vercel Cron"]

  Cron --> Worker["Background Jobs"]
  Queue --> Worker
  Worker --> DB
  Worker --> Outbox["Event Outbox"]
  Outbox --> Projections["Read Models"]

  Web --> Sentry["Sentry"]
  Worker --> Sentry
  Web --> Analytics["PostHog / Analytics"]
```

## 7. 一句话版

```txt
所有应用统一入口，所有模块先注册再接入，
所有跨模块动作走事件，所有钱/积分/库存走流水，
所有新功能先灰度，所有关键操作可审计。
```
