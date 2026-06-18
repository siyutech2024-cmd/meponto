# PontoMall 闭环审计报告 / Closed-Loop Audit

> 范围 / Scope:`mall.meponto.com/`(门面 store)、`/mall`(商城后台)、`/partner-points`(合作方端)、
> `supplier.meponto.com`(供应链后台 `/mall/supplier`)、`mall.meponto.com/admin`(→ 重定向到 `/mall`)。
> 方法 / Method:逐环阅读真实代码(`app/lib/{mall,mall-ops,points,store}.ts`、`app/api/{mall,mall/ops,marketplace,points,partner,performance}`、五个页面),不改代码,只定位缺口。
> 日期 / Date:2026-06-18。结论先行:**主干闭环已通,问题集中在薄弱环节与一致性。**

---

## 更新记录 / Resolution log(2026-06-18)

分支 `codex/partner-mall-points-ledger`,两个提交闭合了下列缺口(编号对应下方第 2 节缺口清单):

- **`d6b92b0`**
  - **G1 ✅** 合作方闭环:`me` 下发只读积分账本;门面 `/store` 加"积分明细 / Extrato de pontos"抽屉(骑手/合作方共用);`/partner-points` 加余额卡 + 进商城入口。
  - **G2 ✅ / G3 ✅** `/partner-points` 整页转葡语;表格用骑手/合作方名称与葡语品类 label 替原始 ID/枚举。
  - **G5 ✅(代销决策)** 采用代销模型:`/mall`、`/mall/supplier` 补货单标注"备货流转、不产生应付,实付以履约月对账为准",`totalCost` 改"备货参考成本"。
  - **(新增)积分负债报表** 第 4 节 P3 项:`/api/mall` 加 HQ 门禁 `pointsLiability` 聚合;`/mall-insights` 加"积分负债与兑付对账"面板(负债为营销成本,`10 分≈R$1` 仅参考)。
- **`f6f5a6b`**
  - **(新增)事件 outbox** 原"待核实项":`app/lib/server/events.ts` + mall 域 5 类版本化事件(`marketplace.order.created/arrived/fulfilled/cancelled/rejected.v1`),GET 对 HQ 下发 `events`,`/mall-insights` 事件流面板。补齐硬规则 #6 / 标准 §9。

**仍开放**:G4(门面 zh/en —— 已决策维持葡语,面向巴西用户,见第 3.1 节,非缺口)、G6(积分↔现金统一对外折算口径,负债报表已用 `rate=10` 起步)、G7(`purchaseLimit` 服务端强校验待确认)。

验证:`module:guard` 通过、`tsc --noEmit` 退出码 0(完整 `next build` 在本机/CI 跑)。下方原始清单保留以备追溯。

---

## 0. 一句话结论 / TL;DR

**EN.** The core economic loop (supply → price → redeem → fulfill → settle, plus earn → balance → spend)
is **already closed and correctly guarded** — stock is decremented on redeem and restored on cancel/reject,
every points and cash movement is an append-only ledger entry, high-value orders are held for review, and
points expire on a 12-month clock. The remaining work is **not plumbing holes** but four weak links:
the partner portal, tri-lingual coverage, the supplier settlement model, and a few read-model/UX gaps.

**中文.** 核心经济闭环(供货→定价→兑换→履约→结算,以及 赚取→余额→消费)**已经闭合且护栏到位**——
兑换扣库存、取消/驳回回补库存,积分与现金的每一次变动都是只读账本条目,高价值订单挂人工审核,
积分 12 个月过期。剩下的不是"主干漏洞",而是**四个薄弱环节**:合作方端、三语覆盖、供应商结算模型、
若干读模型/交互缺口。

---

## 1. 闭环全景 / The Loop, As Built

```
供应商 Supplier (supplier.meponto.com → /mall/supplier)
   │  supplierAddProduct → status=pending_pricing(供货价、发货周期、受众)
   ▼
商城后台 Mall Office (/mall, admin 重定向至此)
   │  priceProduct → 定积分价/现金补差/毛利 → status=active(仅当有价才上架)
   │  decidePriceChange · createPO/receivePO(收货 stock+) · addCoupon/Banner/Category
   ▼
门面 + 骑手端 Storefront/Rider (mall.meponto.com/ → /store ; app 内 /rider-app/mall)
   │  redeem → 扣积分(spend 账本)+ 扣库存 + PIX 补差 + 自动用券 + 高价值挂审
   ▼
站点 Station (/mall/station)
   │  markArrived → 通知骑手 ; markPickedUp → status=fulfilled
   ▼
结算 Settlement (/mall · supplier)
   │  generateStatement(履约单 × 供货价)→ confirmStatement(供应商)→ payStatement(商城)
   ▼
HQ 可视 Insights (PontoSys /mall-insights, 只读)

赚取侧 Earn:T+1 绩效导入(perOrderPoints×等级倍率)· 合作方服务 · 推荐 · QR 扫码
   → pointsLedgerEntries(earn/approved)→ 余额 → 兑换消费 → 闭合
取消/驳回 Reverse:refund 积分 + refund 现金账本 + stock+1 → 闭合
```

已验证闭合的关键环 / Verified-closed critical links:

- **库存 Stock**:`redeem` 扣减(`route.ts:518/655`),`cancelOrder` 与 `reviewOrder` 驳回均 `stock+1`(`726/859`)。无悬挂库存。
- **积分账本 Points ledger**:`spend` / `refund` 全部 append-only,`balanceAfter` 逐条记录,符合账本硬规则。
- **现金 Cash**:PIX 补差走 `cashLedgerEntries`(topup/spend/refund/adjust),人工核销,有审计。
- **绩效入账 Earn**:`api/performance/route.ts:59` 按 `completedOrders × perOrderPoints × tier.pointsMultiplier` 写 earn 条目——赚取侧确实接通,不是空规则。
- **定价闸门 Pricing gate**:`priceProduct` 仅在 `pointsPrice>0 或 cash>0` 时置 `active`,否则回落 `pending_pricing`;门面 catalog 只取 `active`——未定价商品不会泄漏到门面。
- **对账不可变 Statement immutability**:`generateStatement` 仅在 `draft` 时可重算,`confirmed/paid` 冻结。

---

## 2. 缺口清单(按严重度)/ Gap Register (by severity)

| # | 面 / Surface | 缺口 / Gap | 严重度 | 类型 | 状态 |
|---|---|---|---|---|---|
| G1 | partner-points | 合作方能赚积分却**看不到余额、无账本、无兑换入口**,赚→存→花在前端断裂 | 🔴 高 | 闭环 | ✅ `d6b92b0` |
| G2 | partner-points | **整页英文**,违反硬规则 #7(zh/en/pt) | 🔴 高 | 合规 | ✅ `d6b92b0`(转葡语) |
| G3 | partner-points | 表格显示原始 ID(`r-1002`/`crm-001`)与原始枚举品类,无名称/双语 label | 🟡 中 | 读模型 | ✅ `d6b92b0` |
| G4 | store 门面 | **纯葡语,无语言切换**;面向骑手的公开面缺 zh/en | 🟡 中 | 合规 | ⏸ 维持葡语(产品决策,巴西用户) |
| G5 | supplier / mall | **双结算模型未对齐**:补货单(买断口径,有 `totalCost`)无付款路径,月对账(代销口径,履约×供货价)才是实付——模型语义不一致 | 🟡 中 | 经济/产品 | ✅ `d6b92b0`(定为代销) |
| G6 | 全局 | 积分↔现金缺**统一对外口径**(`pointsPerBrlReference=10` 仅风控用);GMV 用积分与现金两套,无折算总额 | 🟢 低 | 一致性 | ◻ 开放(负债表已用 rate=10 起步) |
| G7 | mall / store | 商品 `purchaseLimit` 月限购在 redeem 时**是否强校验**需确认(规则存在于 `redemptionLimitRules`,UI 有字段) | 🟢 低 | 待验证 | ◻ 待验证 |
| — | mall 域 | 缺版本化事件 outbox(`marketplace.order.created.v1` 未发),违反硬规则 #6 / 标准 §9 | 🟡 中 | 架构 | ✅ `f6f5a6b` |

---

## 3. 逐面诊断 / Per-Surface Findings

### 3.1 `mall.meponto.com/` 门面 store(751 行)
**状态:功能完整。** 含售罄(esgotado)、积分+PIX 混合支付、自动用券、等级折扣、虚拟商品即时发码与复制、兑换时才跳 `app.meponto.com/rider-login` 登录。
**唯一缺口 G4:** 无 `useVentoStore`/i18n,文案硬编码葡语。骑手面建议接入既有 i18n(zh/en/pt),与门面气质一致即可,不需大改结构。

### 3.2 `/mall` 商城后台(642 行;admin 重定向至此)
**状态:完整且组织良好。** 标签:overview / products / 商品 / orders / payments(带待办红点)/ supply / settings。中文后台,作为内部运营面可接受(硬规则允许内部技术标签用本地语言)。
**关联缺口 G5/G7** 见下。本身无明显断点。

### 3.3 `/partner-points` 合作方端(106 行)—— **最弱环**
这是 partner 门户的**唯一模块**(见 `portals.ts` partner.modules),却只做"服务核销录入 + 列表"。
- **G1 闭环断裂**:`partnerPointsLedgerEntries`、partner 受众商品(`mkt-004`)、`redeem(accountType:"partner")`、GET 的 partner 订单分支**后端全有**,但本页不展示积分余额、不展示账本、无兑换入口。合作方赚了积分无处可见、无处可用。
- **G2 合规**:`PageTitle title="Partner Points"`、`Services/Confirmed/Submit`、表头全英文。
- **G3 读模型**:表格直接渲染 `service.riderId`/`service.partnerId` 原始 ID,品类用 `fuel`/`maintenance` 原始枚举(`partnerServiceBenefitRules[x].label` 有现成双语名未用)。

### 3.4 `supplier.meponto.com`(`/mall/supplier`,393 行)
**状态:完整。** 标签:catalog / 调价申请 / 补货单 / 对账单 / 数据看板;含图片上传、PIX 收款 key。中文为主、少量 pt 提示。
**关联缺口 G5:** 补货单 `PurchaseOrder.totalCost` 计算了买断成本,但 ops 路由**只有** `confirmPO/shipPO/receivePO/cancelPO`,**没有 payPO**;实际付款只走月对账(履约口径)。即:要么是纯代销模型(补货单仅作备货流转、不付款),要么买断成本从未结算。**这是语义问题,需产品拍板**是"代销(consignação)"还是"买断(compra firme)",再把另一条路径补全或在 UI 标注清楚,避免运营误解为可双payload付。

### 3.5 `mall.meponto.com/admin`
**状态:已正确处理。** `proxy.ts` 将 `/admin` 301 到 `/mall`(登录门禁)。`mall-insights` 的"打开商城后台"也指向 `/admin`。无独立 admin 代码——符合"不另起登录"的硬规则。无需改动。

### 3.6 `/mall-insights`(PontoSys 只读,132 行)
**状态:完整。** 实时拉 `/api/mall` 与 `/api/mall/ops`:兑换单数、积分/现金 GMV、待核销、在售/待定价、待付供应商、合作方兑换、近 30 天柱状、热销 Top5、供应商应付表。仅读模型,操作都在独立后台。无断点。

---

## 4. 修复优先级与建议 / Recommended Fix Order

按 harness 手册:**一支一模块、小步可回滚、预检全绿**。建议顺序:

1. **P0 — `app/partner-points`(修 G1+G2+G3,单模块)**
   重构为合作方完整工作台:顶部加"可用积分 / 待释放积分"卡 → 接 `getPartnerPointsAccount`;
   新增"积分账本"与"可兑换(partner 受众)商品 + 兑换"区 → 复用 `redeem(accountType:"partner")`;
   服务表用名称与双语品类 label;全页文案接 i18n(zh/en/pt)。
   验收:`module:guard` → `build` → `codex:preflight`;合作方登录后能看余额、能兑换、退回能回冲。

2. **P1 — `app/store` 三语(修 G4,单模块)**
   接入既有 i18n,补 zh/en;默认仍按 host/Accept-Language。不动结算逻辑。

3. **P1(产品决策)— 结算模型(修 G5)**
   产品先定"代销 vs 买断";据此补 `payPO` 或在补货单 UI 明确"备货流转,不产生应付,实付以月对账为准"。涉及经济口径,改动需 Finance/Risk 评审、`codex:preflight:full`。

4. **P2 — 口径一致性(G6/G7)**
   对外统一积分↔BRL 折算口径用于 GMV 汇总;确认 `purchaseLimit` 在 `redeem` 服务端强校验(若仅前端则补服务端)。

---

## 5. 验收点 / Verification Checklist(改动落地时逐项跑)

- [ ] `npm run module:guard` 通过——未越界读其他模块私有 state。
- [ ] `npm run build` 通过(类型 + 编译)。
- [ ] `npm run codex:preflight`(P1/P2);结算类改动跑 `:full`。
- [ ] 经济类改动全部走 `pointsLedgerEntries` / `cashLedgerEntries` / `supplierStatements` 账本,无直接改余额。
- [ ] 新增/改动文案 zh/en/pt 三语齐全,单标签不混语言。
- [ ] 合作方兑换走统一 `redeem` 与 RBAC(`manage_partner_services`),不另起逻辑。
- [ ] 退款/驳回路径:积分回冲 + 现金回冲 + 库存回补 三者一致(对照 `route.ts` cancel/review 分支)。
- [ ] `docs/pr-checklist.md` 完成。

---

## 6. 附:关键代码坐标 / Code Map

- 域模型:`app/lib/mall.ts`(等级/累积)、`app/lib/mall-ops.ts`(品类/券/调价/补货/对账/收款/现金账本)、`app/lib/points.ts`(积分账本/规则/合作方服务)。
- 服务端真源:`app/lib/server/memory.ts`、`app/api/mall/route.ts`(兑换/退款/到货/审核/扫码,967 行)、`app/api/mall/ops/route.ts`(运营/采购/对账/收款,559 行)。
- 赚取:`app/api/performance/route.ts`(绩效→积分)、`app/api/points/earn-requests/route.ts`(运营手动入账)、`app/api/partner/services/route.ts`。
- 页面:`app/store/page.tsx`、`app/mall/page.tsx`、`app/mall/station/page.tsx`、`app/mall/supplier/page.tsx`、`app/partner-points/page.tsx`、`app/mall-insights/page.tsx`。
- 路由门禁:`proxy.ts`(host 隔离、`/admin`→`/mall`、`/` →`/store`)、`app/lib/portals.ts`(门户与 homePath)。

*— 报告完。建议从 P0 `partner-points` 开刀,我可直接按上述方案改并跑预检。*
