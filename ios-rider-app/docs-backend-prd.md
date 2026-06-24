# MePonto 骑手端 · 后端补齐 产品需求说明（PRD）

> 版本 v1 · 面向后端 + 产品。目标：把骑手端 App（iOS/Android）当前**乐观更新/前端兜底**的能力，落成**真实、可回滚、可对账**的后端接口。
> 遵循 MePonto 工程规范：经济类改动走**账本(append-only)**、权限走**统一 RBAC**、事件**版本化**、新能力先上 **feature flag**、用户文案**三语(zh/en/pt)**。
> 基址：`https://mall.meponto.com/api/`。会话 cookie：`meponto_session`。

---

## 0. 现状与差距

App 已接入的**读**路径基本可用：`member-login`、`wallet`、`points`、`marketplace/catalog`、`slots(GET)`、`slots(POST 报名)`。
**写**路径目前后端未开放骑手侧 mutation，App 先做**乐观更新**，存在对账与一致性风险：

| 能力 | 现状 | 需求 |
|---|---|---|
| 取消报名 | 前端本地取消 | 提供取消接口 + 名额回收 |
| 积分兑换 | 前端扣减 | 库存预留 + 积分账本扣减 + 订单 |
| 提现申请 | 前端置为处理中 | 提现单 + 资金账本 + PIX + 风控 |
| 站点签到 | 前端 +50 | 站点码校验 + 防作弊 + 积分入账 |
| 个人信息(CPF/PIX) | 前端编辑 | 读取 + 更新 + 校验 |
| 商户折扣核销 | 仅展示 | 扫码核销 + 冷却/上限 + 记录 |
| 开屏配置 | 默认值 | 主后台可配 + 下发接口 |
| 任务/活动 | mock | 后台配置 + 进度计算 |
| 推送 | 无 | 设备注册 + 关键事件通知 |

---

## 1. 范围与优先级

- **P0（上线必备 · 资金与一致性）**：个人信息读写、提现申请、积分兑换、取消报名、签到。
- **P1（体验闭环）**：商户折扣核销、开屏配置、任务/活动、推送（报名结果/提现到账/积分变动）。
- **P2（增强）**：会话续期/多端登出、风控可配阈值、活动 A/B、消息中心。

---

## 2. 通用约定（所有接口适用）

- **鉴权**：除 `member-login`、`app/rider/splash` 外，均需有效 `meponto_session`；无效返回 `401 { error:"unauthorized" }`。骑手只能操作**本人/本网点**资源（RBAC scope=rider，越权返回 `403`）。
- **响应信封**：`{ "data": <T>|null, "error": <string>|null }`。成功 `error=null`。
- **错误码**：HTTP 状态 + `error` 机器码（如 `insufficient_points`、`slot_full`、`profile_incomplete`、`tier_too_low`、`cooldown_active`、`out_of_stock`）。文案由前端按机器码三语本地化。
- **幂等**：所有**写**接口接受 `Idempotency-Key` 头（UUID），重复提交返回首次结果，避免重复扣款/重复报名。
- **账本**：积分/资金/库存的每次变化都写 append-only 账本条目（含 `id, riderId, type, amount, balanceAfter, sourceType, reasonCode, refId, createdAt`）；接口返回应带变更后余额，便于端上对账。
- **事件（版本化）**：状态变更发领域事件，如 `marketplace.order.created.v1`、`payout.requested.v1`、`slot.signup.cancelled.v1`、`rider.checkin.recorded.v1`。
- **i18n**：服务端返回稳定机器码而非本地化文案；如需服务端文案，提供 `zh/en/pt` 三语。
- **可观测**：每个写操作留审计日志（who/when/what/ip）；关键指标埋点。
- **Feature flag**：每个新写接口挂 flag，灰度可控、可一键回滚。

---

## 3. 详细需求（逐接口）

### 3.1 个人信息（P0）

**GET `/rider/profile`** — 返回本人资料。
- 响应 `data`: `{ riderId, name, cpf, phone, pix, ponto, leader, ninetyNineId, tierScore, isComplete }`。
- `isComplete = cpf && pix && phone 均非空`。

**POST `/rider/profile`** — 更新可编辑字段。
- 请求：`{ name, cpf, phone, pix }`。
- 规则与校验：
  - `cpf`：合法巴西 CPF（11 位 + 校验位）；非法 → `400 invalid_cpf`。
  - `pix`：类型枚举（CPF/手机/邮箱/随机键）格式校验；非法 → `400 invalid_pix`。
  - `phone`：E.164 或本地号校验。
  - 敏感字段变更（CPF/PIX）写审计日志；如触发风控，置 `pix_review` 待审而非立即生效。
- 响应：更新后的 profile。
- **验收**：缺 CPF/PIX 时 `isComplete=false`；补全后提现可用（见 3.2）。

### 3.2 提现申请（P0 · 资金）

**POST `/rider/payout`** — 发起提现。
- 前置：`isComplete=true`，否则 `409 profile_incomplete`；`available > 0`，否则 `409 no_balance`。
- 请求：`{ amount? }`（缺省=全部可用）+ `Idempotency-Key`。
- 处理：创建提现单 `status=processing`；资金账本记 `-amount`（available→held）；走 PIX 出款（异步），到账后 `status=paid` 并发 `payout.paid.v1`；失败 `status=failed` 并回滚 held→available。
- 响应：`{ payoutId, status, amount, walletAfter:{available,held} }`。
- 风控：单日次数/金额上限、PIX 与 CPF 一致性校验、异常冻结。
- **验收**：余额 = 历史账本求和；重复提交同 Idempotency-Key 不重复出款。

> 安全：App 端不经手任何资金转账动作，仅发起申请单；实际出款由后端 + 支付通道完成。

### 3.3 积分兑换（P0）

**POST `/marketplace/redeem`** — 兑换商品。
- 请求：`{ productId, qty=1 }` + `Idempotency-Key`。
- 处理：校验上架/库存 → **库存预留** → 积分账本扣减（`spend`）→ 生成订单 `marketplace.order.created.v1`；缺货 `409 out_of_stock`，积分不足 `409 insufficient_points`。
- 响应：`{ orderId, pointsSpent, pointsBalanceAfter, fulfillment:{type,code?} }`（如券码）。
- **验收**：并发兑换不超卖；失败不扣分。

### 3.4 取消报名（P0）

**DELETE `/slots/{slotId}/signup`**（或 `POST /slots/cancel {slotId}`）。
- 规则：仅可取消本人 `submitted/approved` 的报名；释放名额 `enrolled-1`；超过截止时间 `409 cancel_closed`。
- 事件：`slot.signup.cancelled.v1`。
- 响应：`{ slotId, status:"none", enrolled }`。

### 3.5 站点签到（P0）

**POST `/rider/checkin`** — 扫站点码签到得积分。
- 请求：`{ pontoCode, lat?, lng? }` + `Idempotency-Key`。
- 防作弊：
  - `pontoCode` 必须属于骑手绑定网点；否则 `403 wrong_ponto`。
  - 地理围栏：定位距站点 > 阈值 → `409 too_far`。
  - 时间窗 + 冷却：每日/每班限一次，重复 `409 cooldown_active`。
- 处理：积分账本 `earn(+N)`（N 由后台配置，当前默认 50）；事件 `rider.checkin.recorded.v1`。
- 响应：`{ points, pointsBalanceAfter, checkinId }`。

### 3.6 商户折扣核销（P1）

**POST `/partner/redeem`** — 骑手扫商户码核销服务折扣。
- 请求：`{ partnerCode, category }` + `Idempotency-Key`。
- 规则：折扣金额按类别固定（fuel 5 / phone_data 5 / maintenance 20 / equipment 20 / vehicle_service 30，单位 R$）；校验**骑手冷却天数**与**商户每日上限**，超限 `409 cooldown_active`/`409 partner_cap_reached`。
- 处理：记录核销（骑手得折扣，商户得积分）；事件 `partner.benefit.redeemed.v1`。
- 响应：`{ redeemId, riderDiscountBrl, partnerPoints, nextEligibleAt }`。

### 3.7 开屏/广告配置（P1）

**GET `/app/rider/splash`**（免登录）→ 当前生效配置。
- 响应：`{ enabled, headline, tagline, durationMs, backgroundHex, accentHex, imageURL, linkURL }`（缺省回退端内默认）。
- **主后台 CRUD**：运营在 PontoSys 配置开屏（开关/标语/时长/广告图/跳转/生效时间段/受众），支持灰度与排期。文案三语。

### 3.8 任务/活动（P1）

**GET `/rider/missions`** → 骑手当前任务列表 + 进度。
- 响应：`[{ id, title{zh,en,pt}, rewardType, rewardValue, period, target, current, progress, expiresAt }]`。
- 规则：任务由运营后台按**目标 + 奖励 + 周期**配置；进度由后端按业务事件实时/准实时计算；达成发奖走积分/资金账本。

### 3.9 推送（P1）

- **POST `/rider/devices`**：注册设备 `{ apnsToken|fcmToken, platform, locale }`。
- 触发场景：报名审核结果(approved/rejected)、提现到账、积分变动、任务达成、开屏/活动公告。
- 多语言按设备 `locale`；退出登录解绑设备。

### 3.10 会话（P0 加固）

- **登录加固**：`member-login` 建议加**短信验证码**或密码，避免仅手机号即可登录（当前为骨架）。
- **会话校验/续期**：`GET /me` 返回当前会话有效性与基本身份；过期统一 `401`，端上回到游客态。
- **登出**：`POST /logout` 使服务端会话失效（端上已清 cookie）。

---

## 4. 数据模型变更（建议）

- `rider`：补 `cpf, pix, pixType, phone` 字段及校验状态（`pix_status: ok|review`）。
- 新表/账本：`points_ledger`、`wallet_ledger`、`marketplace_order`、`payout`、`checkin_log`、`partner_redeem_log`、`rider_device`、`splash_config`、`mission` + `mission_progress`。
- 所有经济类表 append-only + 余额快照可由账本重算。

---

## 5. 非功能需求

- **安全/合规**：PIX 出款符合本地合规；CPF/PIX 加密存储、最小化展示（端上仅本人可见全量）；敏感操作审计。
- **一致性**：写接口幂等 + 事务；余额以账本为准。
- **性能**：bootstrap 聚合读 P95 < 800ms；写接口 P95 < 1s。
- **可用性**：读接口可降级（端上已做 best-effort 回退）；写接口失败返回明确机器码，端上提示并允许重试。
- **灰度/回滚**：每能力独立 flag，可单独关停。

---

## 6. 验收标准（关键）

1. 资金/积分**任意时刻**余额 == 对应账本求和；重复提交不双花。
2. 个人信息缺 CPF/PIX → 提现被拒 `profile_incomplete`；补全后成功。
3. 报名/取消并发下名额不超卖、不负数；状态机仅允许合法跃迁。
4. 签到受网点+地理+冷却约束，异常被拒并有机器码。
5. 开屏/任务可由运营后台改动并在端上生效（含三语）。
6. 所有写接口在 flag 关闭时安全降级，不影响读浏览。

---

## 7. 里程碑

- **M1（P0，约 1–2 迭代）**：个人信息读写 + 提现 + 兑换 + 取消报名 + 签到 + 会话加固。→ 可上线核心闭环。
- **M2（P1）**：商户核销 + 开屏配置 + 任务 + 推送。→ 体验闭环。
- **M3（P2）**：风控可配、活动 A/B、消息中心。

---

## 附：接口清单（新增/变更）

| 优先级 | 方法 路径 | 说明 |
|---|---|---|
| P0 | `GET /rider/profile` | 读本人资料 |
| P0 | `POST /rider/profile` | 改 姓名/CPF/手机/PIX |
| P0 | `POST /rider/payout` | 提现申请(资金账本+PIX) |
| P0 | `POST /marketplace/redeem` | 积分兑换(库存+积分账本) |
| P0 | `DELETE /slots/{id}/signup` | 取消报名 |
| P0 | `POST /rider/checkin` | 站点签到得积分 |
| P0 | `GET /me` · `POST /logout` | 会话校验/登出 |
| P1 | `POST /partner/redeem` | 商户折扣核销 |
| P1 | `GET /app/rider/splash` + 后台 CRUD | 开屏配置 |
| P1 | `GET /rider/missions` | 任务/进度 |
| P1 | `POST /rider/devices` | 推送设备注册 |

> 端侧已按 `RiderAPI` 协议抽象，后端补齐后仅需在 `LiveRiderAPI`/`APIClient` 把对应写方法从"乐观/空实现"切到真实调用，UI 不变。
