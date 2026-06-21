# 后端补齐 PRD — 骑手端写路径 / Rider-App Backend Completion PRD

> 面向**后端 + 产品评审**。配套阅读:`docs/docs-android-sync.md`(端侧对齐说明)、`docs/api.md`(契约)、`AGENTS.md`/`CLAUDE.md`(硬规则)。
> 范围:把骑手端(iOS/Android/Web PWA)目前**乐观更新**的写操作,落成**真实后端接口**,消除对账风险。
> 规范要求(全篇遵循):账本 **append-only**、统一 **RBAC/scope**、事件 **版本化**、新能力 **feature flag**、用户可见文案 **三语(zh/en/pt)**、改动 **可回滚**。

文档版本:v1.1 · 负责人:平台/骑手端 · 状态:P0 已实现,待评审 P1/P2

> **实现进度(本次已落地,tsc + module:guard 全绿):**
> - ✅ `GET/POST /api/rider/profile`(个人信息读写 + `isComplete`,会话派生,CPF/PIX/手机校验,事件 `rider.profile.updated.v1`)
> - ✅ `POST /api/slots {action:"cancelEnrollment"}`(骑手取消本人待审报名 + 名额回补,事件 `slot.enrollment.cancelled.v1`)
> - ✅ `POST /api/checkin`(站点签到 +50 积分/天/站,earn 账本,事件 `ponto.checkin.recorded.v1`)
> - ✅ `POST /api/wallet {requestWithdrawal}` 补强:缺 CPF/PIX → `422 profile_incomplete`
> - ✅ `POST /api/member-login {request-otp|verify-otp}`(OTP 加固,限频+有效期+尝试次数;`MEMBER_LOGIN_OTP=1` 强制,`sendOtp` 待接 SMS 通道;旧手机号登录默认保留兼容)
> - ✅ `GET/POST /api/tasks`(任务体系:HQ 配置目标/奖励/周期 + 骑手按真实指标算进度 + 达标领取入积分账本,事件 `task.created.v1`/`task.reward.granted.v1`;主后台「App 配置/推送」页含任务配置)
> - ✅ `GET /api/points?riderId=` 隐私修复:按 riderId 过滤账本(不再返回全网)
> - ✅ `wallet.me` 补 `cpf/phone/isComplete`;`requestWithdrawal` 身份改**会话派生**(堵 IDOR)
> - 🔶 待办(下一轮):机器错误码全量回填(老接口)、写操作幂等键、积分/库存乐观锁(上 Supabase 多实例)、积分待定期/释放窗口、OTP 短信通道接入、商户折扣规则可配(P1)。

---

## 0. 背景与核心思路 / Context

端侧已采用 `RiderAPI`(iOS)/ Repository(Android) 协议把取数抽象:游客用 Mock,会员登录后切真实接口,**UI 零改动**。**读路径已基本打通**(钱包、积分、商城、排班、开屏)。问题集中在**写路径**:端上先做乐观更新(本地改了、后端没落),存在**资金与一致性风险**(提现、兑换、积分)。

本 PRD 把这些写操作落成契约化接口。落地后,端侧只需把 `LiveRiderAPI` 对应的空实现切到真实调用,**UI 不变**。

**重要纠偏(以代码现状为准):** 部分写接口**已存在**,不需重建,只需补强(幂等/校验/事件)。下表区分「已具备」与「待新增」,避免重复造轮子。

---

## 1. 现状与差距表 / Capability Gap Matrix

| # | 能力 | 端侧现状 | 后端现状(代码核实) | 差距 / 需求 | 优先级 |
|---|---|---|---|---|---|
| 1 | 个人信息 读/写(姓名/CPF/手机/PIX) | 乐观本地更新 | 读:`GET /api/wallet` 的 `me` 可含 `cpf/pix/phone`;**写:无 `/api/rider/profile`** | **新增** `POST /api/rider/profile`;补 `isComplete` 派生 | **P0** |
| 2 | 提现申请 | 乐观更新 | **已具备** `POST /api/wallet {action:requestWithdrawal}`(写 `WITHDRAWAL_REQUESTED` 审计) | **补强**:`profile_incomplete` 拦截、PIX/金额校验、幂等键、冻结口径 | **P0** |
| 3 | 积分兑换 | 乐观更新 | **已具备** `POST /api/mall {action:redeem}`(扣分账本+扣库存+风控) | **补强**:幂等键、错误码标准化、券/混合付款回执 | **P0** |
| 4 | 取消报名 | 乐观更新 | 报名 `POST /api/slots {slotId}` 已具备;**骑手取消:无** | **新增** 骑手取消自己 `submitted` 报名;名额回补 | **P0** |
| 5 | 签到得积分(扫站点码) | 乐观 +50 | **无** ponto 签到入账动作 | **新增** 签到接口:每日每站 1 次、+N 积分入账、可选地理围栏 | **P0/P1** |
| 6 | 商户核销 / 扫码折扣 | 乐观更新 | **已具备** `POST /api/mall {action:scanPartner}`(冷却+每日上限+账本) | **补强**:类别固定折扣规则可配、错误码、回执 | **P1** |
| 7 | 开屏(启动页)配置 | 读缓存+回退 | **已完成** `GET/POST /api/app/rider/splash`(版本号+审计) | 已交付;P2 可加 A/B + 投放时段 | ✅ 完成 |
| 8 | 任务(目标+奖励+周期) | 写死/展示 | **无** 任务配置与进度接口 | **新增** 后台配置任务 + 骑手进度只读 | **P1** |
| 9 | 推送通知 | 已订阅+SW | **已完成** `GET/POST /api/push`(Web Push + VAPID + SW 后台收) | 已交付;需骑手先授权 | ✅ 完成 |
| 10 | 会话加固(登录) | 手机号登录 | `POST /api/member-login` **仅手机号、无验证码/密码**(骨架) | **新增** 短信/WhatsApp OTP 或密码;限频 | **P0** |

---

## 2. 优先级与里程碑 / Priorities

- **P0 — 资金与一致性闭环(M1 即可上线):** 个人信息读写、提现补强、兑换补强、取消报名、签到、会话加固。
- **P1 — 生态体验:** 商户核销规则可配、任务配置与进度、(开屏/推送已完成)。
- **P2 — 运营增强:** 风控参数可配、开屏/任务 A/B、统一消息中心(站内信)。

里程碑:
- **M1(P0):** 骑手端核心资金/一致性闭环可上线。
- **M2(P1):** 商户折扣可配 + 任务体系 + 全量推送运营。
- **M3(P2):** 风控可视化配置 + A/B + 消息中心。

---

## 3. 通用约定 / Conventions(全接口适用)

### 3.1 鉴权与会话
- 会话 cookie:`meponto_session`(签名,作用域 `.meponto.com`);端侧 `CookieJar`/URLSession 持久化。
- 身份**一律服务端会话派生**(`sessionFromRequest`),骑手写操作**不得**信任客户端入参 `riderId`(已修 H1,后续接口保持)。
- 未登录 → **401** `{ "error": "...", "code": "unauthenticated" }`;无权限 → **403** `{ "code": "forbidden" }`。

### 3.2 响应信封 / Envelope
- 成功:`{ "data": <payload> }`(HTTP 200/201)。
- 失败:`{ "error": "<人类可读,葡语优先>", "code": "<machine_code>" }` + 对应 HTTP 码。
- **本 PRD 要求新增 `code` 机器码**(现状多数仅返回 `error` 文案);端侧按 `code` 分支,文案按 `Accept-Language` 三语。

### 3.3 机器错误码表 / Error Codes
| code | HTTP | 含义 |
|---|---|---|
| `unauthenticated` | 401 | 未登录 |
| `forbidden` | 403 | 无权限 / 越权 |
| `profile_incomplete` | 422 | 缺 CPF/PIX,无法提现 |
| `invalid_cpf` / `invalid_pix` | 422 | 格式不合法 |
| `insufficient_points` | 409 | 积分不足 |
| `insufficient_balance` | 409 | 现金余额不足(混合付款) |
| `out_of_stock` | 409 | 库存不足 |
| `slot_full` | 409 | 名额已满 |
| `slot_not_open` | 409 | 非本周开放 / 未到报名窗口 |
| `tier_too_low` | 403 | 会员等级 < 2 |
| `not_enrolled` / `not_cancellable` | 409 | 未报名 / 状态不可取消 |
| `cooldown_active` | 429 | 商户折扣冷却中 |
| `daily_limit_reached` | 429 | 当日次数上限 |
| `already_checked_in` | 409 | 今日该站已签到 |
| `idempotency_conflict` | 409 | 幂等键冲突 |
| `rate_limited` | 429 | 触发限频(登录/OTP) |

### 3.4 幂等 / Idempotency
- 所有**资金/积分/库存**写操作支持 `Idempotency-Key` 请求头(UUID,端侧每次操作生成)。
- 同键重复 → 返回**首次结果**(不重复扣分/扣款);键冲突(不同 body 同键)→ `409 idempotency_conflict`。

### 3.5 账本 / 事件 / 审计
- 资金、积分、库存、结算、激励变更 **必须 append-only 账本记录**(`type/status/balanceAfter/reasonCode`)。
- 领域事件**版本化**:如 `rider.profile.updated.v1`、`wallet.withdrawal.requested.v1`、`marketplace.order.created.v1`、`slot.enrollment.cancelled.v1`、`ponto.checkin.recorded.v1`。
- 关键写操作 `appendServerAudit`(actor/entity/detail/risk)。

### 3.6 i18n / 灰度
- 用户可见文案三语;接口 `Accept-Language: pt|zh|en`(默认 pt)。
- 新能力(签到、任务、OTP)挂 **feature flag**,默认灰度/关闭。

---

## 4. 逐接口详规 / Endpoint Specs

> 约定:**[新增]** = 后端尚无;**[补强]** = 已存在需增强。请求体仅列关键字段。

### P0-1 · 个人信息 [新增]
- **读** `GET /api/rider/profile` → `{ data: { name, cpf, phone, pix, ponto, leader, nineId, isComplete } }`(`isComplete = !!cpf && !!pix && !!phone`)。
  - 兼容:`GET /api/wallet?...` 的 `data.me` 同步带 `cpf/pix/phone`,避免端侧多打一次。
- **写** `POST /api/rider/profile` body `{ name?, cpf?, phone?, pix? }` → `{ data: { ...profile, isComplete } }`。
- **校验:** CPF 11 位 + 校验位;PIX 为 CPF/邮箱/手机/EVP 之一;手机 E.164/巴西号。非法 → `invalid_cpf`/`invalid_pix`。
- **权限:** 会话派生骑手,仅可改**本人**;`ponto/leader/nineId` **只读**(后台下发,端不可改)。
- **事件/审计:** `rider.profile.updated.v1`;审计 risk=Low(改 PIX 记 Medium)。
- **风控:** PIX 变更后**冷却 N 小时**再允许提现(防接管盗领),记录变更历史。

### P0-2 · 提现申请 [补强]
- `POST /api/wallet` body `{ action:"requestWithdrawal", amount }`(riderId 由会话派生)。
- **业务规则:** 仅 `profile.isComplete` 才可发起,否则 `422 profile_incomplete`;`amount` ∈ [最低额, 可提余额];冻结(hold)对应金额,生成提现单 `requested`。
- **强约束:** **App 端不经手任何资金**;本接口只**发起申请单**,实际出款由后端 + PIX 通道在 HQ 确认(`confirmPayment`)后完成。
- **幂等:** `Idempotency-Key` 必带,防重复发起。
- **事件:** `wallet.withdrawal.requested.v1`;账本写冻结分录。
- **响应:** `{ data: { withdrawalId, amount, status:"requested", pix } }`。

### P0-3 · 积分兑换 [补强]
- `POST /api/mall` body `{ action:"redeem", productId, pickupStoreId?, couponId? }`(身份会话派生)。
- **业务规则:** 风控骑手拦截;余额校验(不足 `insufficient_points`);库存预留(不足 `out_of_stock`);实物需选 Ponto 取货门店;高价值(≥阈值)进 `held` 审核。
- **幂等 + 账本:** `Idempotency-Key`;`spend` 账本 + 扣库存原子化(上 Supabase 前补乐观锁,见 §6)。
- **事件:** `marketplace.order.created.v1`。
- **响应:** `{ data: { orderId, status, pointsSpent, cashDue?, pickupStoreName? } }`。

### P0-4 · 取消报名 [新增]
- `POST /api/slots` body `{ action:"cancelEnrollment", enrollmentId }`(或 `slotId`)。
- **业务规则:** 仅可取消**本人**、状态 `submitted`(审核中)或未到班次的报名;已 `approved` 且临近班次按政策(可配冷却)→ `not_cancellable`;取消后**名额 +1 回补**。
- **事件:** `slot.enrollment.cancelled.v1`;审计 Low。
- **响应:** `{ data: { enrollmentId, status:"cancelled", slotId, enrolled } }`。

### P0-5 · 签到得积分 [新增]
- `POST /api/scan` body `{ type:"checkin", code }`(或 `POST /api/mall {action:"checkinPonto", pontoCode}`)。
- **业务规则:** 码前缀 `ponto/checkin/p-` → 签到;**每日每站 1 次**(重复 `already_checked_in`);可选**地理围栏**(用户↔站点距离 ≤ R)。入账 `+N pts`(默认 50,后台可配)。
- **账本/事件:** `earn` 账本(reasonCode=`checkin`);`ponto.checkin.recorded.v1`。
- **响应:** `{ data: { awarded, available } }`(刷新余额)。
- **风控:** 围栏 + 每日上限 + 设备/IP 频控,防刷分。

### P0-6 · 会话加固(登录 OTP) [新增]
- `POST /api/member-login` 升级为两步:
  - `{ action:"request-otp", phone }` → 发短信/WhatsApp 验证码(限频 `rate_limited`)。
  - `{ action:"verify-otp", phone, code }` → 校验 → 下发 `meponto_session`。
- **现状:** 仅手机号即登录(骨架),**P0 必须**加 OTP 或密码,防冒用。
- **合规:** 验证码 5–10 分钟有效、单号限频、错误次数锁定。
- **事件/审计:** `auth.member.login.v1`;失败计数审计。

### P1-7 · 商户折扣(扫商户码) [补强]
- `POST /api/mall` body `{ action:"scanPartner", partnerId }`(身份会话派生)。
- **业务规则:** 类别**固定折扣**可配(燃油 R$5 / 话费 R$5 / 维修 R$20 / 装备 R$20 / 整车 R$30);**冷却天数** + **每日上限**(`partnerServiceBenefitRules`);超限 `cooldown_active`/`daily_limit_reached`。
- **补强:** 折扣规则改为**后台可配**(现为常量);错误码标准化;返回券/折扣回执。
- **事件:** `partner.benefit.granted.v1`;账本留痕。

### P1-8 · 任务(目标+奖励+周期) [新增]
- 配置(后台,PontoSys):`POST /api/tasks` `{ title, metric, target, rewardPoints, period, audience }`(RBAC `manage_points`/运营)。
- 骑手:`GET /api/tasks?riderId=`(会话派生)→ `{ data: { tasks:[{ id, title, target, progress, rewardPoints, period, claimable }] }}`。
- 领取:`POST /api/tasks {action:"claim", taskId}` → 达标才发奖(账本 `earn`,reasonCode=`task`)。
- **规则:** 进度由后端按真实指标(完单/签到/兑换)计算,**端仅展示**;奖励发放走账本 + 反作弊窗口(参考积分经济标准 pending→release)。
- **事件:** `task.created.v1` / `task.reward.granted.v1`。

### ✅ 已完成(参考,不在本期开发)
- **开屏** `GET/POST /api/app/rider/splash`:HQ 配置,端每次启动拉取;版本号 + 审计。
- **推送** `GET /api/push?publicKey`、`POST /api/push {action:subscribe|send}`:Web Push + VAPID + Service Worker(后台/关闭可收);HQ 在「App 配置 / 推送」页下发。

---

## 5. 数据模型变更 / Schema Changes
- `Rider`:确保 `cpf? / pix? / phone?` 字段齐全 + 派生 `isComplete`;新增 PIX 变更历史。
- `SlotEnrollment`:`status` 增加 `cancelled` 流转(若未有)。
- **新增** `PontoCheckin { id, riderId, pontoId, awarded, at }`(append-only)。
- **新增** `OtpChallenge { phone, codeHash, expiresAt, attempts }`(短期,可用 KV/缓存)。
- **新增** `Task { id, title, metric, target, rewardPoints, period, audience, enabled }` + `TaskProgress { riderId, taskId, progress, claimedAt }`。
- `partnerServiceBenefitRules`:从常量迁为可配置记录(类别→折扣/冷却/日上限)。
- 所有新集合按 `memory.ts` 模式注册 + 持久化接线(`trackCollection` + 再水合)。

---

## 6. 非功能需求 / NFR
- **PIX 合规:** App 不经手转账;提现仅发起申请单,出款由后端 + 持牌通道完成;敏感字段(CPF/PIX)脱敏展示、传输加密、不入 URL。
- **一致性:** 积分「校验→扣分」、库存「检查→扣减」上 Supabase 多实例前补**乐观锁 / DB 约束**(防双花/超卖,见审计 M2);幂等键全覆盖资金/积分写。
- **性能:** 骑手核心读 P95 < 300ms;写 < 800ms;接口 best-effort,端侧失败回退本地默认不空白。
- **可回滚:** 新能力挂 flag,默认灰度;接口加版本;小步可回滚,保持 `main` 可部署。

---

## 7. 验收标准 / Acceptance
- 每个 P0 接口:契约一致(字段/错误码)、鉴权会话派生、幂等生效(重复请求不双扣)、账本与事件落库、三语文案、审计留痕、`codex:preflight` 全绿。
- 端到端:端侧把 `LiveRiderAPI` 写方法切真实调用后,**UI 不改**即可完成:补资料→提现申请、兑换、取消报名、签到、OTP 登录。
- 对账:提现/兑换/签到的账本净额自洽(发起=冻结、兑换=扣分+扣库存、取消=名额回补)。

---

## 8. 附:接口清单 / Endpoint Index

| 用途 | 方法 路径 | 状态 | 优先级 |
|---|---|---|---|
| OTP 登录 | `POST /api/member-login {request-otp\|verify-otp}` | 新增 | P0 |
| 个人信息读 | `GET /api/rider/profile` | 新增 | P0 |
| 个人信息写 | `POST /api/rider/profile` | 新增 | P0 |
| 提现申请 | `POST /api/wallet {requestWithdrawal}` | 补强 | P0 |
| 积分兑换 | `POST /api/mall {redeem}` | 补强 | P0 |
| 取消报名 | `POST /api/slots {cancelEnrollment}` | 新增 | P0 |
| 签到积分 | `POST /api/scan {checkin}` | 新增 | P0/P1 |
| 商户折扣 | `POST /api/mall {scanPartner}` | 补强 | P1 |
| 任务配置/进度/领取 | `GET/POST /api/tasks` | 新增 | P1 |
| 开屏配置 | `GET/POST /api/app/rider/splash` | ✅ 完成 | — |
| 推送 订阅/下发 | `GET/POST /api/push` | ✅ 完成 | — |

> 端侧已按 `RiderAPI`(iOS)/ Repository(Android)协议抽象:后端补齐后,只需把 `LiveRiderAPI` 对应**写方法从空实现切真实调用**,游客 Mock 不变、**UI 零改动**。

### 安全与合规要点(评审务必确认)
1. **资金不经端:** 提现只发起申请单,实际出款后端 + 支付通道完成,端永不持有/转移资金。
2. **登录加固:** `member-login` 当前为手机号骨架,**P0 必须**加 OTP/密码 + 限频,否则存在冒用风险。
3. **越权面:** 所有骑手写操作身份**会话派生**,不信任客户端 `riderId`(延续 H1 修复口径)。
