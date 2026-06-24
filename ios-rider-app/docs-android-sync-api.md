# MePonto 骑手端 — 后端接口接通（写路径）同步到 Android

> 增量说明，承接 `docs-android-sync.md`。本轮：把读路径已通的基础上，**接通所有写接口**（提现/兑换/取消报名/签到/个人信息），并补 `GET /rider/profile`。
> 原则不变：界面只读本地 Store；Store 经 Repository(协议)取数；**游客=Mock，会员=Live**，UI 零改动。
> 基址 `https://mall.meponto.com/api/`，会话 cookie `meponto_session`。

---

## 0. 本轮要点（TL;DR）

1. 新增 5 个**写**接口调用：提现、兑换、取消报名、签到、更新个人信息。
2. 新增 **GET `/rider/profile`** 作为权威身份（姓名/CPF/PIX/手机/网点/队长/99ID）。
3. 所有写请求带 **`Idempotency-Key`**（UUID）头，best-effort（非 2xx 返回失败但不崩 UI）。
4. 商品需带后端 **`apiId`**（兑换用）；`catalog` 的 `id` 要保留映射进商品模型。
5. 登录后**切换 Repository 到 Live**、退出切回 Mock（冷启动已是会员时，由登录态跃迁触发 Live 加载）。

---

## 1. 接口契约（请求/响应）

> 统一响应信封：`{ "data": <T>|null, "error": <string>|null }`。写接口 2xx 且 `data != null` 视为成功。

| 用途 | 方法 路径 | 请求体 | 关键返回 |
|---|---|---|---|
| 读 个人资料 | `GET /rider/profile` | — | `{riderId,name,cpf,phone,pix,ponto,leader,ninetyNineId}` |
| 改 个人资料 | `POST /rider/profile` | `{name,cpf,phone,pix}` | `Ack{id,status}` |
| 提现申请 | `POST /rider/payout` | `{amount}`(null=全部可用) | `Ack{id,status}` |
| 积分兑换 | `POST /marketplace/redeem` | `{productId,qty}` | `Ack{id,status}` |
| 取消报名 | `POST /slots/cancel` | `{slotId}` | `Ack{id,status}` |
| 站点签到 | `POST /rider/checkin` | `{pontoCode,lat?,lng?}` | `{points,checkinId}` |
| 报名(已有) | `POST /slots` | `{slotId}` | 报名记录 |

**公共要求**
- 所有写请求头：`Content-Type: application/json` + `Idempotency-Key: <UUID>`（重试不重复执行）。
- 鉴权靠 cookie（`meponto_session`），登录后自动回传。
- 失败按 HTTP 状态 + `error` 机器码处理（如 `profile_incomplete`/`insufficient_points`/`slot_full`/`cooldown_active`/`too_far`），文案前端按机器码三语本地化。

---

## 2. 业务规则（与 iOS 一致）

- **个人信息**：`isComplete = cpf && pix && phone` 均非空；**不全则禁用提现**并提示补全。`GET /rider/profile` 为权威值，覆盖钱包带出的字段。
- **提现**：`amount` 省略=全部可用；前端乐观把 available→pending，失败后端会驳回（机器码 `profile_incomplete`/`no_balance`）。**App 不经手转账**，仅发起申请单。
- **兑换**：需带 `productId`(后端目录 id)；积分不足/缺货由后端拒（`insufficient_points`/`out_of_stock`）。
- **取消报名**：用 slot 的后端 id（iOS 的 `Shift.apiId`）；释放名额。
- **签到**：`pontoCode` 来自扫码文本；后端校验网点归属+地理围栏+冷却，返回积分；前端先乐观 +N，再以返回为准。

---

## 3. 模型/映射改动（Android 需同步）

- **商品模型**加 `apiId`（= catalog `id`）。`/marketplace/catalog` 映射时保留 id；兑换时回传。
- **资料模型**已含 `cpf/phone/pix` + `isComplete`（上一轮）。bootstrap 增加 `GET /rider/profile` 合并。
- **Repository 接口**方法签名对齐（与 iOS `RiderAPI` 同构）：
  - `signup(shift)` / `cancelSignup(shift)` / `redeem(product)` / `requestWithdraw()` / `checkIn(pontoCode) → Int` / `updateProfile(profile)` / `fetchBootstrap()`。
  - 注意 `redeem` 传**整个商品**（取 apiId），`checkIn` 传 **pontoCode**。

---

## 4. 取数/写入封装建议（Android）

- 一个 `write(path, body)` 助手：`POST`，自动加 `Idempotency-Key`，2xx→解析 `data`，否则返回 null/Result.failure。
- bootstrap 聚合：`wallet → points → catalog → slots → rider/profile`，逐个 best-effort，缺失回退本地默认，**界面永不空白**；整体失败显示重试态。
- 登录态切换：`isMember` 变 true → `repo = LiveRepo(memberName)` 后 `reload()`；退出 → `repo = MockRepo()`。

---

## 5. 联调核对清单（建议两端一致）

- [ ] `Ack` 实际字段名（`id`/`status`）与各写接口返回是否一致。
- [ ] `checkin` 返回是否为 `points`（积分数）。
- [ ] 错误机器码集合：`profile_incomplete / no_balance / insufficient_points / out_of_stock / slot_full / cancel_closed / wrong_ponto / too_far / cooldown_active / tier_too_low / unauthorized`。
- [ ] `Idempotency-Key` 后端是否生效（重复提交不双花/不重复报名）。
- [ ] `amount=null` 提现是否按"全部可用"处理。
- [ ] 余额/积分以**账本求和**为准，写后刷新 bootstrap 对账。

---

## 附：iOS 实现位置（对照参考）

- `Networking/APIClient.swift`：DTO + `write()` 助手 + 各 endpoint（`fetchRiderProfile/updateRiderProfile/requestPayout/redeemProduct/cancelSignup/checkin/enrollSlot/loadSnapshot/login`）。
- `Services/LiveRiderAPI.swift`：把协议方法接到 `APIClient`；bootstrap 合并 `rider/profile`。
- `Services/RiderAPI.swift`：协议 + `MockRiderAPI`（游客/预览）。
- 切换：`AppStore.configure(api:)`；登录态在 `RootContainer.onChange(isMember)` 切换。

> 若后端真实响应结构与本契约有出入，**只改 APIClient 的 DTO/路径**，Repository 与 UI 不动——Android 建议同构。
