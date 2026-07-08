# 加盟商采购全链路方案 / Franchise Procurement Full-Chain Plan

> Status: **Implemented（M1+M2+M3 已落码,flag 默认关）** · 见文末"实施与验证记录"
> Module owner: PontoMall / supply chain（Developer C 责任区,见 `docs/module-development-playbook.md §2`）
> 本文按 `docs/module-contract-template.md` 组织,并对照 `CLAUDE.md` 硬规则与 `docs/meponto-points-economy-standard.md` 账本原则设计。

---

## 0. 背景与现状差距（Gap）

当前代码里**不存在**"加盟商选货 → 订货 → 到站点"的链路：

| 现状 | 代码位置 | 差距 |
| --- | --- | --- |
| 补货单（PO）仅总部→供应商 | `app/api/mall/ops/route.ts`（`createPO` ∈ `OFFICE_ACTIONS`） | 加盟商无权下单 |
| PO 无目的地字段 | `app/lib/mall-ops.ts` `PurchaseOrder` | 无法"发到某站点" |
| 入库只加全局库存 | `receivePO` → `marketplaceProducts[].stock` | 无站点级库存 |
| 加盟商后台无订货入口 | `app/lib/portals.ts` franchise modules | 无选货 UI |
| 站点侧只有兑换到货确认 | `/mall/station`（C 端履约） | 无 B 端收货入库 |

已有可复用的地基：加盟商预存余额 `Franchise.depositBalance`（`app/lib/network.ts`，钱包扣款已在用）、版本化事件 outbox（`app/lib/server/events.ts`）、账本样式 `CashLedgerEntry` / `RevenueShareEntry`（`app/lib/mall-ops.ts`）、运营可调配置 `MallConfig`（`app/lib/mall.ts`）、站点到货确认 UI 模式（`app/mall/station`）、供应商门户（`app/mall/supplier`）。

---

## 1. 模块身份 / Module Identity

```txt
Module name:      franchise-procurement（加盟商采购）
Owner:            PontoMall / supply chain
Status:           disabled → beta（按加盟商灰度）→ active
Routes:           /mall/franchise（加盟商选货订货）、/mall/station 扩展收货 Tab、
                  /mall 后台新增"加盟商订货"Tab、/mall/supplier 扩展直发确认
API:              app/api/mall/procurement/route.ts（新路由,不侵入 /api/mall/ops）
Feature flag:     MallConfig.procurementEnabled（默认 false=关闭,商城后台可开）
Business purpose: 加盟商为其站点订货备货,支撑站点自提兑换与本地零售,
                  形成 选货→订货→审批→发货→到站→入库→兑换出库→结算 的闭环。
```

**边界**：模块归属 `app/mall`、`app/api/mall/procurement`（PontoMall 责任区）。对 `app/lib`（共享）只做**增量类型与 i18n key**,不改既有语义;对其他模块（wallet、network）只经其既有 API/内存契约读写,不私读私改。

---

## 2. 角色与权限 / RBAC

复用统一 RBAC（`app/lib/rbac.ts`）+ 门户会话 scope（与 `/api/mall/ops` 相同的 `session.portal` 校验模式）。**不新建登录体系**。

| 动作 | 门户 | 权限 | 说明 |
| --- | --- | --- | --- |
| 浏览可订目录、下订货单、取消未审批单 | franchise | 新增 `manage_procurement` | 授予 Franchise Admin、Super Admin;scope 限本加盟商与本加盟商站点 |
| 审批/驳回、HQ 取消、总仓确认/发货、差异处理、采购配置 | **仅 pontomall**（商城管理后台 `/mall`） | `manage_points` | 写操作单一入口,不给 pontosys 写权限 |
| 供应商确认/发货（直发） | supplier | `manage_supplier_catalog` | 沿用 `confirmPO/shipPO` 的归属校验：只能操作自己的单 |
| 站点收货入库、差异登记 | ponto | `manage_slots` + station scope | 与 `/mall/station` 现有到货确认同门槛 |
| 库存调整/调拨（M3） | 仅 pontomall | `manage_points` | 高敏,审计必录 |
| 全量数据只读（FPO、站点库存、两本账、差异、事件） | pontosys | `view_analytics` / `view_finance` | 总部运营/财务看板与报表,**无任何写动作** |

敏感动作（审批、扣预存、退款、库存调整）全部走 `appendServerAudit`,risk ≥ Medium。

---

## 3. 数据边界与领域模型 / Data Model

新增集合（进 `COLLECTIONS` 持久化管道与 Supabase 表,遵循 `docs/universal-persistence.md`）：`franchisePurchaseOrders`、`stationStockLedgerEntries`、`franchiseDepositLedgerEntries`、`procurementDiscrepancies`。

### 3.1 商品侧增量（`MarketplaceProduct` 新增可选字段,向后兼容）

```ts
procurementMode?: "off" | "consignment" | "buyout" | "both"; // 默认 off=不可订
franchiseBuyoutPrice?: number; // 买断模式加盟商采购价（R$/件）,HQ 设置
minOrderQty?: number;          // 起订量,默认 1
maxOrderQty?: number;          // 单笔上限,0=不限
```

发货来源自动推导：`product.supplierName` 存在 → 供应商直发（supplier）;否则总仓发货（hq,发货时扣全局 `stock`）。

### 3.2 加盟商订货单 FPO（`FranchisePurchaseOrder`）

```ts
type FpoMode = "consignment" | "buyout";
type FpoStatus =
  | "submitted"   // 加盟商已提交（买断:已扣预存）
  | "approved"    // HQ 审批通过（小额可配自动通过）
  | "confirmed"   // 供应商/总仓确认备货
  | "shipped"     // 已发货（shipNote 物流单号）
  | "arrived"     // 承运到站,待站点清点
  | "received"    // 站点已入库（终态,可带差异）
  | "rejected"    // HQ 驳回（终态,买断自动退款）
  | "cancelled";  // 审批前加盟商撤单/审批后 HQ 取消（终态,买断自动退款）

type FranchisePurchaseOrder = {
  id: string;                    // fpo-xxxx
  franchise: string;             // 下单加盟商（取自 session,不可伪造）
  stationId: string;             // 目的站点（必须属于该加盟商,下单时校验）
  stationName: string;
  supplierName: string;          // 单一供应商;购物车跨供应商时自动拆单。"HQ"=总仓
  source: "supplier" | "hq";
  mode: FpoMode;                 // 单内统一;混合模式商品按 mode 拆单
  items: Array<{ productId: string; name: string; qty: number;
                 unitPrice: number;        // consignment=供货参考价 supplyPrice;buyout=franchiseBuyoutPrice
                 receivedQty?: number }>;  // 收货时回填
  totalBRL: number;              // buyout=应扣金额;consignment=备货参考成本（不产生应付）
  status: FpoStatus;
  note?: string; shipNote?: string;
  createdAt: string; createdBy: string;
  approvedAt?: string; approvedBy?: string;
  confirmedAt?: string; shippedAt?: string; arrivedAt?: string;
  receivedAt?: string; receivedBy?: string;
  cancelReason?: string;
  depositLedgerIds?: string[];   // 关联的预存账本分录（buyout）
};
```

状态机（唯一合法迁移,其余一律 409）：

```txt
submitted ──approve──▶ approved ──confirm──▶ confirmed ──ship──▶ shipped ──arrive──▶ arrived ──receive──▶ received
    │                     │
    ├──reject──▶ rejected（buyout 全额退款分录）
    └──cancel(加盟商)──▶ cancelled          approved/confirmed ──cancel(HQ,需 reason)──▶ cancelled（buyout 全额退款分录）
shipped 之后不可常规取消,只能走收货差异流程;
运输丢失/长期滞留（shipped 超过可配置 N 天）由 HQ 走**异常结单**:生成 writeoff 差异记录 → buyout 全额退款分录 → 单据置 cancelled(reason=exception)。
```

v1 明确不支持:部分发货/分批收货（整单一发一收,短装走差异）、加盟商退货（买断货售出概不退,后续版本再议）。多收（excess）规则:按 orderedQty 入库,超出部分登记 excess 差异待 HQ 处理（补扣款或退货）,**不自动补扣**。

### 3.3 站点库存账本（append-only,Hard Rule #4）

余额**永不直接改字段**,一律由分录投影（对齐积分经济标准 §2 “Ledger first”）：

```ts
type StationStockLedgerEntry = {
  id: string;
  stationId: string;
  productId: string; productName: string;
  /** 货权池:代销/买断分开记账 —— 结算防双计的关键（见 §3.6/§9-1） */
  mode: "consignment" | "buyout";
  type: "inbound"        // FPO 收货入库（qty>0）
      | "outbound"       // 兑换订单站点履约出库（qty<0,M3）
      | "reserve" | "release"  // 兑换下单预留/取消释放（M3,防超卖时间窗）
      | "adjust"         // 盘点调整（HQ,双向,reason 必填）
      | "transfer_out" | "transfer_in";  // 站点间调拨（M3,成对生成,同池）
  qty: number;
  sourceType: "fpo" | "mall_order" | "manual" | "transfer";
  sourceId: string;      // 幂等键:同 (sourceType,sourceId,productId,type) 只允许一条
  balanceAfter: number;  // 该站点该商品该池分录后余额,不允许为负
  note?: string; createdBy: string; createdAt: string;
};
```

读模型 `stationStock`（stationId × productId × mode → { qty, reserved }）由分录投影,可售 = qty − reserved,站点/加盟商/HQ 各看各的 scope。兑换出库默认**先扣代销池**（产生供应商对账行）,代销池不足再扣买断池（**不产生**对账行,货已按 FPO 结算）。

### 3.4 加盟商预存账本（buyout 资金流,append-only）

现状 `Franchise.depositBalance` 被 `/api/wallet`、`/api/network` 直接加减、无分录。本模块补齐账本,并**只经新增的记账函数**变更余额（分录先落,余额随后同步,余额不足则 409 拒单）：

```ts
type FranchiseDepositLedgerEntry = {
  id: string;
  franchise: string;
  type: "topup" | "order_debit" | "order_refund" | "adjust";
  amountBRL: number;      // debit 为负,refund/topup 为正
  sourceType: "fpo" | "manual" | "network";
  sourceId: string;       // 幂等键
  balanceAfter: number;
  note?: string; createdBy: string; createdAt: string;
};
```

> 迁移注：`/api/wallet`、`/api/network` 中既有的 depositBalance 直改点,M2 收敛到同一记账函数（属共享代码改动,单独小 PR + 责任区评审）。

### 3.5 收货差异（`ProcurementDiscrepancy`）

```ts
{ id, fpoId, stationId, productId, orderedQty, receivedQty, kind: "short" | "damage" | "excess",
  resolution: "pending" | "refunded" | "reship" | "writeoff", note, createdAt, resolvedAt?, resolvedBy? }
```

收货时按 `receivedQty` 入库;差额自动生成差异记录。buyout 短装默认按差额自动生成 `order_refund` 分录;consignment 只影响入库数量与供应商月度对账口径。

### 3.6 结算口径

- **consignment（代销）**：与现有供应商代销一致——FPO 不产生应付;供应商货款仍按"履约订单 × 供货价"月度对账（复用 `SupplierStatement`,M3 把统计口径从全局改为含站点库存履约的订单,口径不变只是来源标注）。
- **buyout（买断）**：加盟商下单即从预存扣款（分录),货权归加盟商;供应商侧若为直发,HQ 与供应商仍走月度对账（新增"买断 FPO 行"进 `SupplierStatement.lines`,按 supplyPrice 结算,HQ 赚差价 `franchiseBuyoutPrice − supplyPrice`）。

---

## 4. API / `app/api/mall/procurement/route.ts`

统一 `POST {action}` + `GET` 快照,风格与 `/api/mall/ops` 一致;所有写动作先 `refreshCollectionsFromDatabase`,后按 3.3/3.4 幂等键防重。

下文"office"一律指 **portal === "pontomall"**（商城管理后台）;pontosys 会话只允许 GET。

| Method | action | 门户/权限 | 说明 |
| --- | --- | --- | --- |
| GET | — | franchise/ponto/office/supplier 各按 scope;**pontosys 全量只读** | 目录（可订商品+价格+起订量）、我的 FPO、站点库存、差异、审批队列 |
| POST | `createFPO` | franchise + `manage_procurement` | 校验 flag、站点归属、mode、起订/上限、buyout 余额;跨供应商/跨 mode 自动拆单;buyout 落扣款分录 |
| POST | `cancelFPO` | franchise（submitted）/ office（approved/confirmed,需 reason） | buyout 自动退款分录 |
| POST | `approveFPO` / `rejectFPO` | office | `totalBRL ≤ procurementAutoApproveBRL` 时 createFPO 直接置 approved（审计标注 auto） |
| POST | `confirmFPO` / `shipFPO` | supplier（直发,校验本供应商）或 office（总仓;ship 时扣全局 stock,不足 409） |  |
| POST | `arriveFPO` | office 或 supplier | 承运到站登记 |
| POST | `receiveFPO` | ponto + station scope | 按 receivedQty 入库→站点库存 inbound 分录→自动差异记录→buyout 差额退款 |
| POST | `adjustStationStock` | office | 盘点调整,reason 必填,审计 Medium |
| POST | `setProcurementConfig` | office | flag、autoApprove 阈值、商品 procurementMode/买断价/起订量 |

错误文案全部走 i18n key（三语）,不写死中文。

## 5. 事件 / Versioned Events（`app/lib/server/events.ts` 新增常量组）

| Outbound event | 触发 |
| --- | --- |
| `procurement.fpo.created.v1` / `approved.v1` / `rejected.v1` / `confirmed.v1` / `shipped.v1` / `arrived.v1` / `received.v1` / `cancelled.v1` | FPO 状态机每次迁移 |
| `station.stock.inbound.v1` / `outbound.v1` / `adjusted.v1` / `transferred.v1` | 站点库存分录 |
| `franchise.deposit.debited.v1` / `refunded.v1` | 预存账本分录 |

Payload 含 id、franchise、stationId、mode、totalBRL/qty、actor。消费方（现阶段）：HQ 事件检查页、后续 relay。

Inbound：`marketplace.order.fulfilled.v1` →（M3,flag 开时）生成站点库存 `outbound` 分录。

## 6. 前端页面

| 页面 | 内容 |
| --- | --- |
| `/mall/franchise`（新,加盟商门户挂 `portals.ts` 模块项"订货备货"） | 选货目录（按分类/供应商,显示两种模式价格与库存）、购物车（自动按供应商+mode 拆单预览）、目的站点选择（仅本加盟商站点）、余额卡片（buyout）、我的订货单列表+状态时间线、差异记录 |
| `/mall/station` 扩展"收货入库"Tab | 待收 FPO 列表→逐行填 receivedQty→确认入库;本站库存表（读模型） |
| `/mall` 后台新增"加盟商订货"Tab（**唯一写操作入口**） | 审批队列、全网 FPO、站点库存总览、差异处理、采购配置（flag/阈值/商品模式与买断价） |
| `/mall/supplier` 扩展 | 直发 FPO 的确认/发货（复用现有补货单交互),月度对账单含买断行 |
| PontoSys 侧（只读） | 在 `/reports` 或 systems 看板挂"采购与站点库存"只读视图:全网订单、库存、资金账本、差异;不提供任何操作按钮 |

UI 全量走 `t()` 三语 key;空态/加载/错误态齐全;遵循 `docs/design-system.md` tokens。

## 7. 护栏对照 / Hard-Rule Checklist

| # | 硬规则 | 本方案落点 |
| --- | --- | --- |
| 1 | Module Registry first | 按契约模板登记本文件;初始 Status=disabled |
| 2 | 不跨读私有数据 | 只经 `/api/mall/procurement` 契约;wallet/network 的余额直改点由 M2 专项 PR 收敛,不在本模块私改 |
| 3 | Feature flag | `MallConfig.procurementEnabled` 默认关;M3 兑换扣库存另设 `stationStockEnforcement` 独立开关 |
| 4 | 账本式记录 | 站点库存、预存资金全部 append-only 分录+balanceAfter+幂等键;余额只由分录投影 |
| 5 | 统一 RBAC | 新 permission `manage_procurement` 进 `rbac.ts`;其余复用既有权限与门户 scope;无新登录 |
| 6 | 事件版本化 | §5 全部 `.v1` |
| 7 | 三语 | 全部文案/错误/状态标签走 i18n(zh/en/pt);PR 前跑三语完整性检查 |
| 8 | 不改名 | 沿用 MePonto/PontoSys/PontoMall |

风控补充：单笔金额与件数上限（config）、审批阈值、shipped 后禁常规撤单、库存不得为负、全动作审计、同幂等键重放返回原结果。

### 7.1 生产就绪核查（正式环境必须满足,逐条验收）

| # | 风险/漏洞 | 修补方案 | 落点 |
| --- | --- | --- | --- |
| 1 | **结算双计**:买断货兑换履约再进供应商对账=付两次钱 | 库存按货权分池（entry.mode）,出库先代销后买断;仅代销出库生成对账行;`generateStatement` 按池过滤 | §3.3/§3.6,M1 起 |
| 2 | **并发资金安全**:并发下单可把预存扣负、双击重复扣款 | 分录表幂等键上 **DB 唯一约束**（`sourceType+sourceId+type`）;扣款经 Supabase RPC/事务原子执行"校验余额+插分录+更余额",余额 CHECK ≥ 0;内存校验只作快速失败 | §3.4,M2 红线 |
| 3 | **并发库存安全**:同秒双收货/双出库 | 同 #2:分录唯一约束+余额 CHECK ≥ 0 落 DB;状态机迁移带前置状态条件（compare-and-set,状态不符 409） | §3.3,M1 |
| 4 | **兑换超卖时间窗**:校验有货→履约之间库存被抢 | `reserve/release` 分录:兑换下单即预留,取消/驳回释放,fulfilled 转 outbound;可售=qty−reserved | §3.3,M3 |
| 5 | **价格漂移**:在途期间供货价被改价流程更新 | FPO items 下单即快照 unitPrice,全链路（含对账买断行）只用快照,不回读商品当前价 | §3.2,M1 |
| 6 | **在途异常无出口**:货丢/滞留永远挂 shipped | 超时（N 天,config）异常结单:writeoff 差异+退款+cancelled(exception);后台滞留单看板+超时提醒 | §3.2,M1 |
| 7 | **关 flag 困死在途单** | flag 只禁新单,存量走完;紧急冻结另设 `procurementFrozen` | §8,M1 |
| 8 | **对账不变量**:账实是否相符无人巡检 | 新增 `procurement:verify` 脚本进 `npm run check`:①每笔 rejected/cancelled 买断单存在等额退款分录 ②Σ分录=余额（资金+每站每品每池） ③received 单必有等量 inbound ④无负余额;CI 与后台"对账"页共用 | M1/M2 |
| 9 | **通知缺失**:状态变了没人知道 | 状态机每次迁移向相关方（加盟商/供应商/站点/HQ）发站内通知,三语模板,复用 memberMessages 通知管道 | M1 |
| 10 | **金额精度** | 全链路 round2 一致规则:行金额=round2(qty×unitPrice),totalBRL=round2(Σ行);对账/退款均引用已存金额,不重算 | M1 |
| 11 | **预存充值闭环**:买断没钱可扣 | 加盟商门户自助充值:PIX 转账提交凭证→HQ 核销入账（topup 分录）,复用 cashTopUps 交互模式;低余额预警 | M2 |
| 12 | **站点/商品中途失效** | 下单校验站点属该加盟商且启用、商品 active 且 procurementMode 开;在途期间站点停用→HQ 可改同加盟商内目的站点（审计）或异常结单 | M1 |
| 13 | **DB 层约束缺失** | 现行持久化为 `app_state_records` 通用 JSONB 镜像（见 `docs/universal-persistence.md`）,无法建列级约束;约束在**记账函数层**强制执行（`postFranchiseDeposit`/`postStationStock`:幂等键查重、余额≥0、状态机 CAS）+ 冒烟不变量巡检。待表结构归一化后再落 DDL | M1（已按此实现） |
| 14 | **端到端回归缺失** | 新增 `procurement:smoke`:代销/买断全链正向 + 红线（余额不足、重复提交、越权、flag 关、负库存、双收货）,纳入 `npm run check` | 每期 DoD |

| 期 | 范围 | 验收 |
| --- | --- | --- |
| **M1 代销链路+站点库存**（最小闭环） | FPO 状态机全链、代销模式、站点收货入库、站点库存账本+读模型、四端 UI、事件、审计、三语 | 演示账号走通 选货→订→批→发→到站→入库;`npm run codex:preflight` 绿;`verify:persistence` 绿 |
| **M2 买断资金流** | 预存账本、下单扣款/驳回退款、差异退款、SupplierStatement 买断行、wallet/network 余额直改点收敛（独立小 PR） | 资金分录与余额对平;红线用例（余额不足/重复提交/取消退款）通过 |
| **M3 兑换联动+调拨** | `stationStockEnforcement` 开关:兑换 fulfilled 扣站点库存、下单校验站点有货;站点间调拨、盘点 | 冒烟 `npm run check`;库存不为负穿透测试 |

回滚：`procurementEnabled=off` 只**禁止新建 FPO 与新配置**,存量在途单据仍可继续走完（否则货困在路上）;紧急全停另设 `procurementFrozen` 开关（连收货也冻结,仅极端事故用）。数据为 append-only,无需回滚数据;每期一支 `codex/mall-procurement-mX` 分支,`main` 始终可部署。

## 9. 开放问题（评审时定,均为商务口径,不阻塞 M1 开发）

1. buyout 扣款时点:当前定“提交即扣”（简单、可退款）;是否改为“审批通过再扣”？
2. 总仓发货是否需要拣货/波次等仓内环节,还是 confirm→ship 两步即可（v1 取两步）？
3. 代销货到站后的货损归属（供应商/加盟商/平台）需商务口径,影响差异 resolution 默认值。
4. 站点本地零售（非兑换出库）是否纳入 M3 outbound 类型（预留 `sourceType:"manual"`）。
5. 买断池货的兑换履约是否仍计提 `franchiseShareBRL` 销售分成（货本就是加盟商的,建议不计提或另设费率,需商务确认）。
6. 出库扣池顺序“先代销后买断”为平台利益最大化默认值,加盟商侧是否要可配置。

---

## 10. 实施与验证记录（2026-07-07）

**已落码文件**：`app/lib/procurement.ts`（领域模型+状态机+库存投影）· `app/lib/server/franchise-deposit.ts` / `station-stock.ts`（唯一记账入口,幂等+余额守护）· `app/api/mall/procurement/route.ts`（全部 action）· `app/api/mall/route.ts`（M3 预留/释放/出库,flag 门控）· `app/api/mall/ops/route.ts`（对账买断行+买断池排除）· `app/api/wallet|network/route.ts`（depositBalance 直改点收敛到账本）· 四端 UI（`/mall/franchise` 新页、`/mall/station` 收货 Tab、`/mall` 加盟商订货 Tab、`/mall/supplier` 直发区块）· `app/lib/rbac.ts`（`manage_procurement`）· `app/lib/i18n.ts`（zh/en/pt 全量 key）· `scripts/procurement-smoke.mjs`（并入 `npm run check`）。

**验证结果**：`tsc --noEmit` 全绿;`npm run module:guard` 通过;进程内全链路 harness **46/46 通过**——覆盖 flag/冻结门控、代销全链（含短装差异）、买断扣款/驳回退款/短装差额退款、异常结单全额退款、越权与非法状态迁移红线、负库存/超预留拒绝、调拨、对账买断行与买断池排除、账本三条不变量（Σ分录=余额、退款平价、无负池）。

**发布前待办（需在开发机执行,沙箱缺 linux/arm64 SWC 二进制无法跑 next build）**：`npm run codex:preflight:full`（build + lint + check,check 已含 procurement:smoke）→ 全绿后按 §8 分期开 flag。

---

## 11. 直采毛利显式账本（ProcurementMarginEntry,2026-07-08 自 batch3 模型移植）

**问题**：直采利润原为隐式差价（买断 = `franchiseBuyoutPrice − supplyPrice`;代销 = 兑换定价差),财务不可见、不可对账。

**方案**：新增 append-only 集合 `procurementMarginEntries`（`app/lib/procurement.ts` `ProcurementMarginEntry`,记账入口 `app/lib/server/procurement-margin.ts`,Hard Rule #4）。字段：`fpoId / franchise / supplierName / kind / goodsCostTotal / chargedTotal / marginTotal / month / status(accrued|settled) / sourceId(幂等键)`。

| 类型 | 计提时点（以资金实际发生为准） | 口径 |
| --- | --- | --- |
| `buyout_spread` | `createFPO` 全部拆单腿扣款成功之后（预存扣款即资金发生;放在循环后使 split-rollback 永不需冲销） | 快照价:`totalBRL − Σ qty×supplyPrice`,不回读现价 |
| `consignment_spread` | 兑换出库消耗**代销池**时（`markPickedUp` M3 outbound,即供应商应付发生时点） | **V1 简化口径**:兑换经济价值 = `pointsPrice / pointsPerBrlReference + cashPriceBRL`,毛利 = 价值 − 当前 `supplyPrice`（池无逐件价格快照,注释已写明） |

**冲销（append-only,负分录,镜像押金账本补偿模式）**：cancel / reject / exception 全额冲销;`receiveFPO` 短装按 `shortQty×(unitPrice−supplyPrice)` 部分冲销。幂等键 `fpo:{id}:accrue` / `fpo:{id}:reverse:{reason}` / `order:{id}:consign`。

**settled 联动**：`/api/mall/ops` `payStatement` 付款时,把该对账单行 `orderId`（买断 FPO id / 代销兑换单 id）命中且同供应商的 accrued 分录翻 `settled`（同 batch3 `ProcurementFeeEntry` 联动写法）。HQ 总仓腿无供应商应付,计提即 `settled`。

**事件**：`procurement.margin.accrued.v1`（冲销复用同事件,金额为负）。**UI**：`/mall` 加盟商订货 Tab「直采毛利账本」表（月份/加盟商/供应商/类型/成本/实收/毛利/状态,按月小计）。

## 12. 供应商分销 opt-in 审批流（procurementConsent,2026-07-08 自 batch3 模型移植）

**问题**：`setProductProcurement` 为办公室单方配置,供应商对自己的货被买断/代销无同意权。

**方案**：`MarketplaceProduct` 增 `procurementConsent?: "none"|"pending"|"approved"` 与 `suggestedBuyoutPrice?`（供应商建议价,仅参考;**买断价仍以总部 `franchiseBuyoutPrice` 为准**）。

- 供应商门户（`/mall/supplier` 商品卡）：「开放直采」+ 可选建议分销价 → `setProcurementConsent { productId, consent, suggestedPrice? }`（supplier 会话,仅自己的商品);**任何修改重置 pending**,关闭 → `none` 立即阻断新单。
- 总部审批：`reviewProcurementConsent { productId, approve }`（pontomall 会话,`/mall` Tab「直采开放审批」队列）。
- **强制点清单**：① `createFPO` 每行商品 `consent==="approved"` 否则 409 `fpErrConsentRequired`（三语）;② `setProductProcurement` 开启非 off 模式前同校验（把商品加入可采目录的路径);③ `catalogProducts()` 加盟商可选目录只列 approved。
- **存量兼容（迁移语义）**：consent 字段缺省且 `procurementMode !== "off"` 的存量商品按 **approved** 处理（grandfathered,上线不断流);HQ 自有商品（无 supplierName)无需同意。
- **事件**：`supplier.procurement.consent.v1` / `supplier.procurement.consent.approved.v1`;审计 `SUPPLIER_PROCUREMENT_CONSENT` / `PROCUREMENT_CONSENT_APPROVED|REJECTED`。

*Ledger first · Flag 默认关 · 三语齐全 · 事件 .v1 · 小步可回滚。*
