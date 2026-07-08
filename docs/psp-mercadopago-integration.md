# Mercado Pago PSP 集成方案（PontoMall 资金流）

> Status: 设计稿（P1-6）· 尚未实施 · 仅文档,不含代码改动。
> Owner: PontoMall(`app/mall`, `app/api/mall`)+ 共享平台(`app/api/psp` 新增,谨慎)。
> 对齐标准:`docs/meponto-points-economy-standard.md`(账本/事件)、`AGENTS.md` 硬规则
> #3(feature flag)、#4(账本)、#6(事件版本化)、#7(三语文案)。

---

## 1. 背景与现状

PontoMall 目前有 **四条人工 PIX 资金流**,全部依赖商城后台人工核销
(见 `app/lib/mall-ops.ts` 与 `app/api/mall/ops/route.ts`):

| # | 资金流 | 方向 | 现状载体 | 现有状态机 | 人工动作 |
| --- | --- | --- | --- | --- | --- |
| A | 骑手混合支付收款(积分 + 现金差价) | 收款(money-in) | `MallPayment` + 订单 `cashDue`/`paymentStatus`(`app/api/mall/route.ts`) | `pending → submitted → confirmed / rejected` | 骑手提交转账凭证号 `submitPaymentRef`,后台 `confirmPayment` / `rejectPayment` |
| B | 骑手现金余额充值 | 收款(money-in) | `CashTopUp` → 确认后写 `CashLedgerEntry(type: "topup")` | `pending → submitted → confirmed / rejected` | 骑手 `requestTopUp` + `submitTopUpRef`,后台 `confirmTopUp` / `rejectTopUp` |
| C | 付供应商货款(月度对账单) | 付款(money-out) | `SupplierStatement`(供应商确认时快照 `pixKey`) | `draft → confirmed → paid` | 后台线下 PIX 转账后 `payStatement` 登记 `receiptNote` |
| D | 付加盟商销售分成 | 付款(money-out) | `RevenueShareStatement`(结算时把 `RevenueShareEntry` 置 `settled`) | `draft → confirmed → paid` | 后台线下 PIX 转账后 `payRevShareStatement` |

现状痛点:到账靠人眼比对凭证号、无法自动对账、`CashLedgerEntry` 由人工确认驱动、
高峰期核销积压(`summary.pendingPayments`)。注:混合支付结账当前已改为**从预付现金余额扣款**
(`cashDue > 0` 时校验 `cashBalanceOf` 并写 `spend` 账本),因此流 B(充值)是现金入口主通道,
流 A 的直付通道为历史/兜底路径,两者一并纳入本方案。

---

## 2. 资金流 × Mercado Pago 产品映射与巴西合规要点

### 2.1 产品映射

| 资金流 | Mercado Pago 产品 | 集成方式 |
| --- | --- | --- |
| A 混合支付收款 | **Payments API — PIX 动态二维码**(`payment_method_id: "pix"`) | 每笔 `MallPayment` 创建一个带金额与过期时间的动态 QR(`point_of_interaction.transaction_data.qr_code` copia-e-cola + `qr_code_base64`),骑手扫码/复制粘贴支付,webhook 回调核销 |
| B 骑手充值 | **Payments API — PIX 动态二维码**(同上) | 每笔 `CashTopUp` 创建动态 QR;`approved` 回调后由服务端写 `CashLedgerEntry` |
| C 付供应商货款 | **Money-out / Transferências(PIX payout)** | 对账单 `confirmed` 后,后台点「发起付款」调用转账 API,按供应商 `pixKey` 出款;webhook/轮询确认后置 `paid` |
| D 付加盟商分成 | **Money-out / Transferências(PIX payout)** | 同 C,收款人为加盟商登记的 PIX key(需在加盟商档案补充 `pixKey` 字段) |

> **付款(money-out)前置条件:** Mercado Pago 的转账/出款能力需要**商务开通**
> (企业账户 + 风控审核),不是默认开放的公开 API。若开通周期长,C/D 两条流保留
> 现有人工付款为主通道,仅先落地「数据模型 + 状态映射 + 凭证留痕」,见 §8 阶段计划。

### 2.2 巴西本地合规要点

- **PIX 即时到账、7×24:** PIX 由巴西央行(BCB)运营,到账秒级、全年无休。因此收款流
  不需要"T+1 对账日"的概念——webhook `approved` 即为终态入账信号;但仍须保留每日
  与 Mercado Pago 后台报表的核对(见 §3.3 对账映射)。
- **CNPJ 企业收款账户:** 收款主体必须是 MePonto 的 **Mercado Pago 企业账户(CNPJ)**,
  不得用个人账户收经营款。动态 QR 的收款方名称/CNPJ 会显示在骑手的银行 App 里,
  须与合同主体一致,避免投诉与 MED 争议。
- **付款人身份(CPF/CNPJ):** 创建 PIX 支付时在 `payer.identification` 传骑手 CPF
  (骑手档案已有实名信息),便于对账与反欺诈;供应商/加盟商出款前须校验其 PIX key
  归属的 CPF/CNPJ 与档案一致(key 归属校验,防打错人)。
- **E2E 标识(endToEndId):** 每笔 PIX 都有全网唯一的 E2E id,是法定对账凭证,
  必须落库(见 §3),替代现在人工填写的 `reference`。
- **退款与 MED:** PIX 没有信用卡式 chargeback,但有 **MED(Mecanismo Especial de
  Devolução)** 欺诈退回机制;同时 Mercado Pago 支持 `POST /v1/payments/{id}/refunds`
  主动全额/部分退款。退款处理见 §7.3。
- **手续费:** PIX 收款 Mercado Pago 收取费率(按签约价),入账为净额或全额+月结扣费,
  须在财务对账中把 `transaction_amount` 与 `net_received_amount` 分开记录。
- **LGPD:** 只落库 PSP 的 id/状态/E2E,不存骑手银行账号等敏感数据;webhook 原始报文
  留存脱敏副本用于审计。

---

## 3. 数据模型改动

### 3.1 通用 PSP 字段(四条流的记录各自追加)

在 `app/lib/mall-ops.ts` 的 `MallPayment`、`CashTopUp`、`SupplierStatement`、
`RevenueShareStatement` 上各追加一组可选字段(全部 optional,人工通道记录不受影响):

```ts
// 收款流(MallPayment / CashTopUp)追加:
pspProvider?: "mercadopago";        // 预留多 PSP
pspPaymentId?: string;              // Mercado Pago payment id(幂等主键)
pspStatus?: string;                 // PSP 原始状态快照(pending/approved/rejected/...)
pspStatusDetail?: string;           // MP status_detail,排障用
pspQrCode?: string;                 // PIX copia-e-cola 串(展示给骑手)
pspQrCodeBase64?: string;           // QR 图(可不落库,即取即用)
pspExpiresAt?: string;              // QR 过期时间(建议 30 分钟)
pspEndToEndId?: string;             // PIX E2E id,法定对账凭证
channel?: "manual" | "psp";        // 缺省 undefined 视同 "manual",保证向后兼容

// 付款流(SupplierStatement / RevenueShareStatement)追加:
pspProvider?: "mercadopago";
pspTransferId?: string;             // 出款单 id
pspStatus?: string;                 // processing / approved / rejected / cancelled
pspEndToEndId?: string;
channel?: "manual" | "psp";
```

### 3.2 新集合:`pspTransactions`(对账映射表,append-only)

一张薄的映射/对账表,把 PSP 侧交易与本地业务单一一对应,是日终对账与 webhook
幂等的锚点。加入 ops 路由的 `COLLECTIONS` 并走通用持久化:

```ts
export type PspTransaction = {
  id: string;                        // psp-<n>
  provider: "mercadopago";
  direction: "in" | "out";
  flow: "mall_payment" | "cash_topup" | "supplier_statement" | "revshare_statement";
  localId: string;                   // MallPayment.id / CashTopUp.id / Statement.id
  pspPaymentId: string;              // MP payment/transfer id(唯一索引)
  amountBRL: number;                 // 应收/应付金额
  feeBRL?: number;                   // PSP 手续费
  netBRL?: number;                   // 净额
  status: string;                    // PSP 原始状态(最新)
  endToEndId?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 3.3 现金账本(CashLedgerEntry)由 webhook 驱动

`CashLedgerEntry` 结构**不变**(硬规则 #4:账本 append-only),变化只在**写入者与触发点**:

| 场景 | 现在 | PSP 通道 |
| --- | --- | --- |
| 充值入账 | `confirmTopUp` 人工确认后写 `type:"topup"` | webhook `payment.approved` → 服务端写 `type:"topup"`,`createdBy: "PSP:mercadopago"`,`note: "PIX E2E <endToEndId>"`,`sourceId: topUp.id` |
| 混合支付直付(流 A) | `confirmPayment` 后订单 `paymentStatus:"paid"` | webhook `approved` → 订单置 `paid`;不动余额账本(直付不经过预付余额) |
| 退款 | `adjustCash` 人工 `type:"refund"` | 退款 webhook → 写 `type:"refund"`,`sourceId` 指向原 topUp/order |

幂等规则:写账本前按 `sourceId + type` 查重——同一 `topUp.id` 只允许一条 `topup` 账本;
`pspTransactions` 里 `pspPaymentId` 唯一。人工通道与 PSP 通道互斥:`channel === "psp"`
的记录禁止走 `confirmTopUp`/`confirmPayment` 人工核销(API 返回 409),反之 webhook
对 `channel === "manual"` 的单不生效,防双重入账。

对账映射(日终跑批或后台页汇总):

```txt
Mercado Pago 报表(payment id / E2E / 金额 / 手续费)
  ⇄ pspTransactions(pspPaymentId 唯一)
  ⇄ 业务单(MallPayment / CashTopUp / Statement 上的 pspPaymentId)
  ⇄ CashLedgerEntry(sourceId = 业务单 id)
差异三类:PSP 有而本地无(漏单,人工补挂)、本地 confirmed 而 PSP 非 approved(告警冻结)、
金额不一致(告警,禁止自动入账)。
```

---

## 4. Webhook 端点设计与状态机

### 4.1 端点:`POST /api/psp/webhook`

新建 `app/api/psp/webhook/route.ts`。**注意:`app/api` 属共享平台代码,按 CLAUDE.md §4
需最小改动并在 PR 说明理由**——本端点只做「验签 → 幂等 → 分发到 mall 域处理函数」,
业务写入逻辑放在 mall 域内(如 `app/lib/server/psp.ts`),不在共享层堆业务。

处理流程:

```txt
1. 验签:读取 `x-signature` 头(格式 ts=...,v1=...)与 `x-request-id`,
   按 Mercado Pago 规范拼 manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
   用 MP_WEBHOOK_SECRET 做 HMAC-SHA256,与 v1 比对;并校验 ts 与当前时间偏差(如 ≤5 分钟,防重放)。
   验签失败 → 401,不进入业务逻辑,记审计(risk: High)。
2. 快速 200:通过验签后先返回 2xx(Mercado Pago 要求 22 秒内响应,超时/非 2xx 会按
   退避策略重试),业务处理同步完成但保持轻量;失败时返回 5xx 让 MP 重试。
3. 反查为准:webhook 报文只当"铃声"用——拿 `data.id` 反查
   `GET /v1/payments/{id}`(带 access token),以 API 返回的状态为唯一事实来源,
   天然解决乱序、重放与伪造报文残余风险。
4. 幂等:pspTransactions 按 pspPaymentId 定位;状态未变化 → 直接 200 no-op;
   已是终态(approved/rejected/cancelled/refunded)再收到同态通知 → no-op。
5. 状态落库 + 驱动业务(见 4.2 状态机),写审计与版本化事件(§5)。
```

重试与容错:MP 侧对非 2xx 自动重试;本地处理失败(如 DB 暂不可用)返回 503 借用其重试;
连续失败超过阈值进入后台「PSP 异常队列」页人工介入。另提供每日兜底轮询
(查 `pending` 超过 QR 有效期的本地单,反查 PSP 后关单或补账)。

### 4.2 状态机映射(收款流 A/B)

Mercado Pago 支付状态:`pending / in_process / approved / rejected / cancelled /
refunded / charged_back`。映射到现有四态,**不扩展枚举**,保证 UI 与既有筛选兼容:

| PSP 状态 | MallPayment / CashTopUp | 订单 paymentStatus(流 A) | 附带动作 |
| --- | --- | --- | --- |
| (QR 已创建)pending / in_process | `pending`(`channel:"psp"`,展示 QR) | `pending` | — |
| approved | `confirmed`(`decidedBy: "PSP:mercadopago"`) | `paid` | 流 B 写 topup 账本;发 `*.confirmed.v1` 事件;审计 |
| rejected / cancelled / QR 过期 | `rejected`(note 记 status_detail) | `pending`(允许重新发起) | 审计;骑手端提示可重试 |
| refunded / charged_back(MED) | 状态保持 `confirmed`,追记 `pspStatus:"refunded"` | `pending` + 审计告警 | 写 `refund` 账本 / 冻结订单交付(见 §7.3) |

`submitted` 态在 PSP 通道**不使用**(不再需要骑手手填凭证号),仅保留给人工通道。
**人工核销通道整体保留为 fallback**:flag 关闭、PSP 故障或骑手用不了 App 内支付时,
`requestTopUp → submitTopUpRef → confirmTopUp` 原路径不变。

### 4.3 状态机映射(付款流 C/D)

| PSP 出款状态 | Statement 状态 | 说明 |
| --- | --- | --- |
| 发起成功(processing) | 保持 `confirmed`,`pspStatus:"processing"` | UI 显示「付款处理中」,禁止重复发起 |
| approved | `paid`(`paidBy: "PSP:mercadopago"`,E2E 落 `pspEndToEndId`) | 流 D 同步把当月 `RevenueShareEntry` 置 `settled`(沿用 `payRevShareStatement` 逻辑) |
| rejected / cancelled | 回到 `confirmed`,`pspStatus` 记失败原因 | 审计 High;可人工改走线下付款(`channel:"manual"`) |

出款发起必须带 **X-Idempotency-Key**(用 `statement.id`),防止重复点击双重付款;
同一 statement 存在非终态 `pspTransferId` 时 API 拒绝再次发起(409)。

---

## 5. 事件版本化与审计

沿用 `app/lib/server/events.ts` 的 outbox 模式,新增 `PSP_EVENTS` 常量组
(硬规则 #6,与 `MARKETPLACE_EVENTS` 并列):

| 事件 | 触发点 | 消费方 |
| --- | --- | --- |
| `mall.payment.confirmed.v1` | 流 A `approved`(PSP 或人工,payload 带 `channel`) | 订单交付、analytics、通知 |
| `mall.payment.rejected.v1` | 流 A 失败/过期 | 骑手端提示、风控 |
| `mall.topup.confirmed.v1` | 流 B `approved` 且账本写入成功 | 骑手余额读模型、analytics |
| `mall.topup.refunded.v1` | 流 B 退款/MED | 财务、风控 |
| `mall.statement.paid.v1` | 流 C `paid` | 供应商门户、财务 |
| `mall.revshare.paid.v1` | 流 D `paid` | 加盟商门户、财务 |
| `psp.webhook.received.v1` | 每次验签通过的 webhook(payload 脱敏) | 审计、排障 |

payload 统一含:`localId`、`pspPaymentId`、`amountBRL`、`endToEndId`、`channel`、
`occurredAt`。人工通道触发同名事件(`channel:"manual"`),下游消费方无需区分来源。

审计:所有 PSP 驱动的状态变更走 `appendServerAudit`,actor 固定 `"PSP:mercadopago"`,
risk 等级——入账 `Medium`、验签失败/金额不符/MED `High`。与现有
`MALL_PAYMENT_CONFIRMED` / `MALL_TOPUP_CONFIRMED` 审计动作保持同名,追加
`via PSP, E2E <id>` detail。

---

## 6. Feature Flag 灰度方案

默认全关(硬规则 #3),按资金流逐条开,人工通道永远可用:

| Flag | 控制范围 | 建议灰度顺序 |
| --- | --- | --- |
| `psp.mercadopago.enabled` | 总开关:webhook 端点激活、凭证加载 | 1(sandbox 即开) |
| `psp.mercadopago.topup.enabled` | 流 B:充值页展示 PIX QR(替代静态 pixKey + 手填凭证) | 2(首个生产灰度,金额小、频次高、可白名单骑手) |
| `psp.mercadopago.mall_payment.enabled` | 流 A:混合支付直付 QR | 3 |
| `psp.mercadopago.supplier_payout.enabled` | 流 C:对账单 API 出款按钮 | 4(依赖 money-out 商务开通) |
| `psp.mercadopago.revshare_payout.enabled` | 流 D:分成单 API 出款按钮 | 5 |

灰度维度:flag 值支持 `off / beta(白名单 riderId 列表) / on`。flag 关闭时 UI 自动
退回人工通道文案,已创建的 `channel:"psp"` 单据继续由 webhook 收尾(只影响新单)。
回滚 = 关 flag,零数据迁移(所有 PSP 字段皆 optional)。

---

## 7. 凭证、环境、失败与退款

### 7.1 凭证与环境变量

对齐 `docs/integrations.md` 的 provider readiness 模式,在 `app/lib/integrations.ts`
注册 provider `mercadopago`:

| 环境变量 | 必需 | 说明 |
| --- | --- | --- |
| `MP_ACCESS_TOKEN` | 是 | 服务端私钥,仅存 Vercel/部署环境变量,**永不入库、不进前端、不进日志** |
| `MP_WEBHOOK_SECRET` | 是 | webhook 验签密钥(MP 后台生成) |
| `MP_PUBLIC_KEY` | 否 | 仅前端 SDK 场景需要(本方案 QR 由服务端生成,可不配) |
| `MP_BASE_URL` | 否 | 缺省 `https://api.mercadopago.com` |

### 7.2 sandbox → 生产切换

```txt
1. Sandbox:用测试凭证(TEST- 前缀 token)+ 测试买家账号,webhook 指向预览环境;
   跑通四类用例:approved / rejected / QR 过期 / 退款。
2. 生产预检:换正式 CNPJ 账户凭证;webhook URL 换生产域名并在 MP 后台重新配置、
   重签 secret;`npm run codex:preflight:full`(高风险改动,走 full)。
3. 切换只改环境变量,不改代码;测试/生产凭证禁止混用(token 前缀校验兜底)。
```

### 7.3 失败与退款处理

| 场景 | 处理 |
| --- | --- |
| QR 过期未付 | 本地单置 `rejected`(note: expired);骑手可重新发起,生成新 payment |
| 支付被拒(rejected) | 同上,展示三语失败提示与重试入口 |
| webhook 丢失 | 每日兜底轮询反查 `pending` 超时单(§4.1);后台「PSP 异常队列」可手动触发反查 |
| 金额不一致 | **禁止自动入账**,进异常队列 + High 审计,人工裁决 |
| 主动退款 | 后台发起 `POST /v1/payments/{id}/refunds`;成功回调后写 `refund` 账本(流 B)或订单退款处理(流 A,复用现有 cancelOrder 退款路径) |
| MED 欺诈退回 | webhook `charged_back` → 冻结相关订单交付、余额扣回(账本 `adjust`,余额不足则挂负债工单)、riderId 进风控审查 |
| 出款失败(C/D) | Statement 回 `confirmed` + 失败原因;可重试或改人工线下付款 |
| PSP 整体故障 | 关对应 flag,全量回退人工通道;`channel:"psp"` 未决单据由兜底轮询收尾 |

---

## 8. 分阶段实施计划

> 每阶段一条分支(`codex/psp-<phase>`),独立可回滚,`npm run codex:preflight` 全绿才算完成;
> 涉及资金,发版一律 `codex:preflight:full`。

| 阶段 | 范围 | 交付物 | 出口条件 |
| --- | --- | --- | --- |
| **P0 地基** | provider 注册、env readiness、`pspTransactions` 集合、`app/api/psp/webhook` 骨架(验签+幂等+审计,不驱动业务)、`PSP_EVENTS`、全部 flag(默认 off) | webhook 在 sandbox 收到通知并验签通过 | module:guard 通过;webhook 对无关通知安全 no-op |
| **P1 骑手收款先行 — 充值(流 B)** | 充值页 PIX 动态 QR(三语)、`approved` → topup 账本、状态机、异常队列页 | sandbox 全用例 + 生产白名单骑手灰度 | 账本与 pspTransactions 对账 0 差异;人工通道回退验证通过 |
| **P2 骑手收款 — 混合支付直付(流 A)** | 订单直付 QR、`paymentStatus` 驱动、退款接现有 cancelOrder 路径 | 流 A 灰度 | 同上;交付闸门(`未核销不能交付`)在 PSP 通道下验证 |
| **P3 付款流(流 C → 流 D)** | money-out 商务开通;出款发起 + 幂等键;PIX key 归属校验;加盟商档案补 `pixKey` | 先供应商货款(对手方少、单笔大),再分成 | 双人复核(发起人 ≠ 确认人)上线;失败回退人工验证通过 |
| **P4 收尾** | 日终自动对账报表、退款/MED 自动化、逐步收窄人工通道入口(保留但默认折叠) | 财务对账页 | 连续 2 个自然月对账 0 人工调整 |

### 验收清单(每阶段通用,对齐 Definition of Done)

- [ ] 模块边界:业务逻辑在 mall 域,`app/api/psp` 仅验签分发;`npm run module:guard` 通过。
- [ ] 权限:后台出款/异常队列操作走统一 RBAC(`manage_points` 同级门槛),webhook 无会话但强制验签。
- [ ] 三语:骑手可见的支付/充值/失败/重试文案 `zh` + `en` + `pt` 齐全(pt 为主要用户语言)。
- [ ] 账本:所有余额变动仅经 `CashLedgerEntry`,webhook 写入幂等(sourceId 查重)。
- [ ] 事件:§5 事件带 `.v1` 后缀并登记到本表;payload 含 `channel` 与 `endToEndId`。
- [ ] Flag:新能力默认 off;关 flag 可即时回退人工通道且不产生数据迁移。
- [ ] 幂等:重复 webhook、重复点击出款、重复导入均无副作用(测试用例覆盖)。
- [ ] 对账:`pspTransactions` ⇄ 业务单 ⇄ 账本三向对得上;金额不符走异常队列而非自动入账。
- [ ] 凭证:`MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` 只在环境变量;日志与审计不含 token/敏感数据。
- [ ] `npm run codex:preflight` 通过(发版/资金改动跑 `:full`);`docs/pr-checklist.md` 完成。

---

## 附:与现有代码的对应关系速查

| 现有位置 | 本方案改动点 |
| --- | --- |
| `app/lib/mall-ops.ts` | 四个类型追加 §3.1 PSP 可选字段;新增 `PspTransaction` 类型 |
| `app/api/mall/ops/route.ts` | `confirmTopUp`/`confirmPayment` 对 `channel:"psp"` 返回 409;`payStatement`/`payRevShareStatement` 增加 PSP 出款分支(flag 后) |
| `app/api/mall/route.ts` | 混合支付结账在流 A flag 开启时生成直付 QR 单;`pixKey` 静态展示逻辑保留为 fallback |
| `app/lib/server/events.ts` | 新增 `PSP_EVENTS` 常量组(§5) |
| `app/lib/integrations.ts` + `docs/integrations.md` | 注册 `mercadopago` provider 与 env readiness |
| `app/api/psp/webhook/route.ts`(新增) | §4.1 验签/幂等/分发,业务处理委托 mall 域 |
