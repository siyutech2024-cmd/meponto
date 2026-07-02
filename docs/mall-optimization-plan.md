# PontoMall 供应商→商城→加盟商链路 · 完整优化方案与任务规划

> 日期:2026-07-01 · 范围:PontoMall 商城域(供应链 / 履约 / 结算 / 各角色界面)+ 新模块「加盟商直采」
> 依据:代码审查结论(`api/mall`、`api/mall/ops`、`api/supplier`、`api/marketplace/orders`、`lib/mall-ops.ts`、`lib/points.ts` 及各端页面)
> 工作方式:遵循 `CLAUDE.md` / `AGENTS.md` — 一支一模块(`codex/<task>`)、feature flag、账本式记录、统一 RBAC、三语、`npm run codex:preflight` 全绿才算完成。

## 执行状态(2026-07-02)

**全部任务已实施**,按批次提交(叠层分支,基于 `main`):

| 批次 | 分支 / 提交 | 覆盖任务 |
| --- | --- | --- |
| 批次1 | `codex/mall-batch1-closure-and-ui` · `7f1d323` | P0-1~P0-4、P1-3、P2-1/3/4/5/6/9、库存账本 |
| 批次2 | `codex/mall-batch2-automation` · `f6b50a8` | P1-1/2/4/5/7、P2-2/7/8、P1-6(方案文档 `docs/psp-mercadopago-integration.md`) |
| 批次3 | `codex/mall-batch3-franchise-procurement` · `f43fbd6` + 异议通道补丁 | P3 全部(契约 `docs/franchise-procurement-contract.md`,flag `franchiseProcurementEnabled` 默认关) |

沙箱验证:`module:guard` + `tsc --noEmit` 全绿。**待本机终验**:`npm run codex:preflight:full`(next build 与 check 冒烟需 macOS 本机环境)。已知例外:总部 `/mall` 控制台文案按仓库现有惯例为中文单语(契约文档 §9 已登记);P1-6 PSP 为方案文档,代码集成待商户凭证后单独立项。

---

## 阶段总览

| 阶段 | 主题 | 性质 | 建议节奏 |
| --- | --- | --- | --- |
| **P0** | 闭环缺口修复 | 修 bug / 对账正确性,**必须最先做** | 第 1 周 |
| **P1** | 流程自动化 | 把"人手动推"改成"事件自动推" | 第 2–3 周 |
| **P2** | 界面与体验 | 各角色后台可用性,可与 P1 并行 | 第 2–4 周 |
| **P3** | 加盟商直采分销 | 新模块,依赖 P0 完成 | 第 4 周起 |

依赖关系:P0-1/P0-2 → P3(直采会放大对账与库存问题);P1-5 涉及积分账本语义,单独一支谨慎做;P1-6(PSP)独立立项,不阻塞其他任务。

---

## P0 · 闭环缺口修复(高优先,均为小改动)

### P0-1 Partner 兑换纳入供应商对账单
- **问题**:`generateStatement`(`api/mall/ops/route.ts:424`)只统计 `accountType === "rider"`,而 HQ 应付汇总(`api/mall/route.ts:277`)不区分账户类型 → Partner 兑换了供应商商品,月度对账单漏结,欠供应商钱。
- **改动**:对账单生成去掉 rider 限定;两处口径统一(fulfilled + arrived)。
- **分支**:`codex/mall-statement-partner-orders`
- **验收**:同月含 Partner 兑换时,对账单合计 = HQ 应付汇总;已确认/已付账单不受重生成影响。

### P0-2 库存账本(InventoryLedger)
- **问题**:`stock` 就地加减(PO 入库 +、兑换 −、取消 +、后台手改),违反硬规则 #4(库存变动须账本式记录),无法追溯。
- **改动**:新增 append-only `InventoryLedgerEntry`(type: `po_receive` / `redeem` / `cancel_restock` / `review_reject_restock` / `manual_adjust`,含 sourceId、balanceAfter、操作人);所有改 stock 的路径同步写账本;后台手改库存必填原因。
- **分支**:`codex/mall-inventory-ledger`
- **验收**:任一商品当前库存 = 账本重放结果;`verify:persistence` 通过。
- **备注**:P3 直采的前置。

### P0-3 跨月晚核销漏结
- **问题**:供应商对账单按订单 `createdAt` 归月,且确认后不可重生成 → 上月订单本月才到货/核销,若上月账单已付款则永远漏结。
- **改动**:对账归属月改为**核销月**(与 revshare 的 pickup-month 做法一致),或已结月份的晚核销自动进下月补差行。
- **分支**:`codex/mall-statement-fulfil-month`
- **验收**:构造跨月核销用例,金额不丢失、不重复。

### P0-4 分成 Entry 结清状态联动
- **问题**:`RevenueShareEntry.status` 有 `settled` 值,需核实分成对账单 `paid` 后是否翻转;不翻转则"未结分成"口径永远虚高。
- **改动**:`payRevShareStatement` 时将该月该加盟商的 entries 批量置 `settled`。
- **分支**:`codex/mall-revshare-settle-flag`
- **验收**:付款后加盟商端"未结分成"清零。

---

## P1 · 流程自动化

### P1-1 对账单定时自动生成
- 月初 cron 自动生成供应商对账单 + 分成对账单的 draft(draft 本可安全重生成),运营只做确认与付款;生成结果发站内通知。
- **分支**:`codex/mall-auto-statements` · **验收**:关闭 flag 时行为不变;开启后每月 1 日自动出全部 draft。

### P1-2 低库存自动补货草稿
- 商品加 `restockThreshold`(默认 3,可配);兑换后库存 ≤ 阈值时自动生成 draft PO,建议量 = 近 30 天兑换速率 × `deliveryCycleDays` × 安全系数;运营一键确认下达。
- **分支**:`codex/mall-auto-replenish` · **验收**:阈值触发生成一次(幂等,不重复开单)。

### P1-3 站点批量到货确认
- 站点/总部端支持按 PO 或按供应商批量 `markArrived`,批量触发骑手站内信。
- **分支**:`codex/mall-batch-arrival` · **验收**:一次操作 N 单全部到站 + N 条通知。

### P1-4 对账单争议通道
- `SupplierStatement` / `RevenueShareStatement` 增加 `disputed` 状态 + 争议备注;争议单退回 draft 可重生成;审计留痕。
- **分支**:`codex/mall-statement-dispute` · **验收**:供应商/加盟商可发起争议,总部处理后重出账单。

### P1-5 高额兑换改「冻结」语义(谨慎,单独一支)
- 现状:≥8000 分先扣(spend)后审,拒绝再 refund,骑手体验是"钱先没了"。
- 改动:积分账本增加 `hold` / `release` 类型;下单冻结,审核通过转 spend,拒绝 release。同步修改可用余额计算(`getAvailablePoints` 需扣除 hold)。
- **分支**:`codex/points-hold-release` · **验收**:全链路(通过/拒绝/取消)余额与账本一致;`check` 冒烟通过。

### P1-6 Mercado Pago PSP 集成(独立立项,大)
- 替换四条人工 PIX 核销流(混合支付、充值、付供应商、付加盟商)为 webhook 自动核销,人只处理异常。代码注释中已有此计划。
- **分支**:`codex/mall-psp-mercadopago` · 需先出集成方案文档(`docs/integrations.md` 补章)。

### P1-7 待办老化提醒
- 待定价商品、调价审批、待核销凭证超 48h 在总览高亮 + 站内提醒。
- **分支**:`codex/mall-aging-alerts` · **验收**:老化项在总览可见并可点击直达。

---

## P2 · 界面与体验(可并行)

### P2-1 列表搜索 + 分页 ⭐最高性价比
- `/mall` 商品页、订单页目前全量渲染;订单只有状态筛选。加关键字搜索(商品/骑手/站点/订单号)、日期范围、分页或虚拟滚动。
- **分支**:`codex/mall-list-search-pagination`

### P2-2 原生弹窗换统一 Modal ⭐
- 全站 `prompt()` / `confirm()`(付款备注、驳回原因、拒绝退分、发货备注等)换成站内 Modal:可校验、走 i18n 三语、移动端可用。发货备注顺带结构化出「物流单号」字段,为对接物流留数据。
- **分支**:`codex/mall-modal-cleanup`

### P2-3 定价面板毛利上下文
- 定价输入时实时显示:积分价折合 R$(按积分经济汇率)、毛利额、毛利率;低于供货价时警示。
- **分支**:`codex/mall-pricing-context`

### P2-4 加盟商分成入口 + 账单明细 ⭐
- 加盟商后台(`/franchise`)目前完全没有商城分成入口,确认对账单藏在 `/wallet`。加「本月商城分成 R$ X · N 张待确认」卡片直达;分成对账单增加订单级明细(现在是盲签)。
- **分支**:`codex/franchise-revshare-visibility`

### P2-5 站点履约工作台
- `/mall/station` 仅 110 行,是最薄的一环却是履约现场。加:今日待取货清单、按骑手核对视图、取货码/扫码核销(复用 `/scan` 能力)、批量到货(联动 P1-3)。
- **分支**:`codex/mall-station-workbench`

### P2-6 供应商门户增强
- 概览加「本月预计回款」(实时口径:本月已核销 × 供货价);订单与账单支持 CSV 导出。
- **分支**:`codex/supplier-portal-receivables`

### P2-7 交互性能
- 状态流转(到站/交付/核销)后做乐观更新或局部刷新,替代整页双接口 reload。
- **分支**:`codex/mall-optimistic-updates`

### P2-8 设计令牌收敛
- 散落的硬编码色值(`#c4423b`、`#9a7400`、`#1d7a3e` 等)收敛到 `docs/design-system.md` 定义的 CSS 变量;暗色主题验证。
- **分支**:`codex/mall-design-tokens`

### P2-9 危险操作二次确认
- 上架、删除商品、标记付款等高影响操作,确认框展示影响摘要(金额/库存/对象);手改库存必填原因(联动 P0-2)。
- **分支**:并入 P2-2 分支实施。

---

## P3 · 加盟商直采分销(新模块 franchise-procurement)

> 前置:P0-1、P0-2 完成。V1 边界:**只做加盟商采购自用/线下售卖**,货一出库即离开平台库存体系;不做加盟商在 PontoMall 二次上架分销(多级库存/分成,复杂度陡增)。

### P3-0 模块契约与注册(先行)
- 按 `docs/module-contract-template.md` 写契约:边界、事件、API、账本、RBAC scope;走 Module Registry 注册;feature flag `mall.franchise_procurement` 默认关闭。
- **分支**:`codex/franchise-procurement-contract`

### P3-1 数据模型
- `MarketplaceProduct` + `distributable: boolean`、`wholesalePrice`(分销价,供应商设置);
- `PurchaseOrder` + `buyerType: "hq" | "franchise"`、`franchise` 字段(状态机 ordered→confirmed→shipped→received 原样复用);
- 新增平台佣金账本 `ProcurementFeeEntry`(append-only,按订单计提 `platformFeePct`)。
- **分支**:`codex/franchise-procurement-model`

### P3-2 供应商端
- 商品与报价页加「可分销」开关 + 分销价;直采订单进现有订单/物流 Tab(按 buyerType 标识)。
- **分支**:`codex/supplier-distributable-catalog`

### P3-3 加盟商端
- 加盟商后台新增「分销采购」页(flag 后):可分销目录、下单、订单跟踪(直发加盟商,复用 shipped/shipNote + P2-2 的物流单号)。
- **分支**:`codex/franchise-procurement-ui`

### P3-4 结算(平台代收)
- V1 资金流:加盟商付平台 → 平台月度与供应商结算(复用 `SupplierStatement` 模式出 `FranchisePurchaseStatement`)→ 平台留佣金。防飞单靠:结算便利 + 低佣金 + 账期留在平台。
- **分支**:`codex/franchise-procurement-settlement`

### P3-5 事件(版本化)
- `franchise.po.created.v1` / `franchise.po.confirmed.v1` / `franchise.po.shipped.v1` / `franchise.po.received.v1` / `franchise.po.settled.v1`,记入 `docs/api.md`。
- 并入 P3-1/P3-4 分支实施。

### P3-6 风控与准入
- 供应商准入校验(CNPJ 已有字段);加盟商预付或信用额度(HQ 配置);分销价调整复用 `PriceChangeRequest` 审批流。
- **分支**:`codex/franchise-procurement-risk`

### 待产品决策(开工前定)
1. 平台佣金比例与计费口径(按订单金额 %,建议 V1 固定一档);
2. 预付 vs 信用额度,额度默认值;
3. 物流:V1 供应商直发加盟商(推荐),总部仓中转留 V2;
4. 分销价由供应商定 + 总部审,还是总部统一加价。

---

## 通用完成定义(每个任务)

- [ ] 模块边界不越界(`npm run module:guard`)
- [ ] 新能力挂 feature flag,默认关闭
- [ ] 经济类改动(积分/资金/库存/佣金)走 append-only 账本
- [ ] 统一 RBAC/scope,不新建登录
- [ ] 用户可见文案 `zh` / `en` / `pt` 三语齐全
- [ ] 事件带版本号并记录契约
- [ ] `npm run codex:preflight` 通过(发版/高风险任务跑 `:full`)
- [ ] `docs/pr-checklist.md` 完成;仅暂存相关文件,开发者要求才提交

## 建议排期(4 周)

| 周 | 任务 |
| --- | --- |
| 第 1 周 | P0-1 ~ P0-4(全部)+ P2-1 |
| 第 2 周 | P1-1、P1-2、P1-7 + P2-2/P2-9、P2-4 |
| 第 3 周 | P1-3、P1-4、P1-5 + P2-3、P2-5、P2-6 |
| 第 4 周 | P3-0 ~ P3-2 启动;P2-7、P2-8 收尾;P1-6(PSP)出集成方案 |
