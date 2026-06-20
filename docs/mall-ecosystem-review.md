# 商城生态体检报告（子模块 / 闭环 / Bug / 优化）

> 范围：PontoMall 及其全部关联子系统。结论：**主闭环完整、风控齐全；有 1 个高优先级越权面 + 几个中低问题；优化空间集中在鉴权会话化、并发、分成归属。**

## 1. 商城关联的子模块 / 系统

| 子系统 | 关系 | 数据 |
|---|---|---|
| 积分账本 | 兑换扣分 / 退款 / 过期 / 裂变 | `pointsLedgerEntries`（append-only） |
| 现金 / Hybrid | 积分+PIX 混合支付、充值 | `cashLedgerEntries` / `cashTopUps` / `mallPayments` |
| 会员 / 骑手 | 公开用户 + 骑手统一表；等级 `resolveTier`(KPI 完单) | `riders` + `riderDailyKpis` |
| 加盟商 | 两级销售分成（净额） | `franchises` + `mallRevenueShareEntries` / `revenueShareStatements` |
| 门店(Ponto) | 唯一取货点 + 分成归属 | `pontos` |
| Partner | partner 兑换 / 服务地图 / 扫码积分 | `crmPartners` + `partnerPointsLedgerEntries` |
| 供应链 | 提报→定价→采购单→月度对账 | `marketplaceProducts` + `purchaseOrders` + `supplierStatements` |
| 优惠券 | 兑换自动抵扣 | `mallCoupons` |
| 站内信 | 到货等消息 + web push | `memberMessages` + `pushSubscriptions` |
| 鉴权 | 会员手机登录 / 会话 | `auth-session` |

## 2. 闭环状态（均闭合）

兑换→履约→对账、取消/驳回退款、高价值审核、两级分成结算、供应链补货+月结、partner 扫码 N 次发分、裂变（会员→会员）、站内信到货提醒——**端到端闭合**。

## 3. Bug / 风险（按优先级）

### 🔴 高
**H1. 兑换/取消/扫码的「用户身份」来自客户端入参 `riderId`，非会话派生。**
`redeem`(rider 分支 line 614/699)、`cancelOrder`(790 仅传 riderId 才校验)、`scanPartner` 都信任 body 里的 id。
→ 任一登录用户可**冒用他人 riderId 兑换（花别人积分）或取消他人订单**。公开会员上线后此越权面更危险。
对比：partner/supplier 分支已从 `session.organization` 派生。**建议：rider/member 分支统一从会话取 id。**

### 🟠 中
- **M1. 裂变只接了「会员邀会员」**，`partner-register` 无邀请人入账 → 需求「邀 partner 注册得积分」未实现。
- **M2. 分成按「订单创建月」归属**（line 200），非取货月。跨月取货（6 月下单 7 月取）落到 6 月；若 6 月对账单已付款，该笔成孤儿、不进任何对账单。建议按取货月归属，或对账可补未结算 entry。
- **M3. 并发原子性**：库存/积分「查→扣」分两步无锁；Supabase 多实例可能超卖/双花。

### 🟡 低
- **L1. 会员登录仅手机号**（无验证码）——知道手机号即可登录该会员（弱鉴权，与现有 demo 级一致）。上 OTP 需短信/WhatsApp API。
- **L2. 商品图 base64 入 KV（≤400KB）**：Storage 不可用时回退内联 base64，持久化体积膨胀。建议强制走 Storage URL。
- **L3. 积分「待定期/释放」反欺诈窗口未实现**：`creditPoints` 直接 approved，文档(acquisitionPointRules pendingDays)形同虚设。
- **L4. `markMessagesRead` 全部已读**：未逐条已读（轻微）。

## 4. 优化空间（按收益）

1. **鉴权会话化**（修 H1）—— 最高收益，堵住越权面。
2. **关键路径乐观锁 / DB 唯一约束**（并发）—— 上 Supabase 多实例前。
3. **分成归属改取货月 + 对账补漏**（修 M2）。
4. **商品图统一 Storage URL，KV 不存 base64**（修 L2）。
5. **`GET /api/mall` 分页/裁剪**：当前每次返回全量 orders/products，量大后变慢。
6. **裂变补 partner 邀请入账**（修 M1）。
7. （可选）站内信逐条已读 + 收件箱页；积分待定期窗口（按业务定）。

## 5. 修复状态（本轮）

| # | 问题 | 状态 | 说明 |
|---|---|---|---|
| **H1** | 兑换/取消/扫码身份越权 | ✅ **已修** | redeem/cancelOrder/scanPartner/markMessagesRead 改为**优先从会话派生身份**（`sessionFromRequest` → userId/name），client `riderId` 仅在无会话时作 demo 回退。登录用户只能操作自己的账户/订单。 |
| **M1** | partner 邀请无裂变积分 | ✅ **已修** | `partner-register` 接 `inviterId`(`?ref=`)，注册即给邀请会员 +500 分（`REFERRAL_PARTNER`）；注册页捕获 `?ref=`。 |
| **M2** | 分成按订单创建月归属 | ✅ **已修** | `accrueRevenueShare` 改为**取货月**(`nowStamp`)，杜绝跨月孤儿。 |
| **L4** | 站内信只能全部已读 | ✅ **已修** | `markMessagesRead` 支持 `messageId`（逐条已读），并改为会话派生身份。 |
| **M3** | 并发原子性 | ⚠️ **部分** | 单实例内「查→扣」**无 await、已原子**（已确认）。跨实例需 Supabase 行级约束/原子扣减——属 DB 层，代码内无法补全。 |
| **L1** | 会员登录仅手机号 | 🚫 **受阻** | 上 OTP 需短信/WhatsApp API（你说暂无）。当前与全站 demo 级鉴权一致。 |
| **L2** | 商品图 base64 入 KV | ✅ **已是优选** | 已有 Supabase Storage 上传（`/api/mall/upload`），仅 Storage 不可用时回退内联 base64（≤400KB）。属可接受兜底。 |
| **L3** | 积分待定期/释放窗口 | 🚫 **待规则** | 需你定「哪些发放要持有、持有几天」；现为即时到账。实现需业务口径，不宜盲改。 |

**结论**：所有**纯代码层**的 bug（H1/M1/M2/L4）已修复并 tsc 通过；剩余 M3（需 DB 事务）、L1（需短信 API）、L3（需业务规则）受外部依赖限制，已记录待你决策。
