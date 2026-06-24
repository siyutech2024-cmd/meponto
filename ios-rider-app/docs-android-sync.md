# MePonto 骑手端 — iOS 近期更新同步到 Android

> 面向 Android 团队的对齐说明。每项包含：**变更点 / 业务规则 / 数据·接口契约 / Android 落地提示**。
> iOS 侧实现位置仅供参考（`ios-rider-app/MePontoRider/...`）。后端契约与 Web/Android 同源（`docs/api.md`）。

---

## 1. 延迟登录（游客可进）+ 登录/注册

**变更点**：去掉启动登录墙。App 打开即为**游客**，可浏览公共内容；触发敏感操作时再弹登录/注册。

**业务规则**
- 公共（免登录）：班次表浏览、积分商城目录、地图周边、支持、语言/外观。
- 会员专属（触发登录）：会员卡 + 现金账本、钱包整页、扫码、积分兑换、我的二维码、班次报名、我的日程、个人信息、退出登录。
- 登录方式为**手机号**（PontoSys member-login，无密码字段时按手机号校验）。

**接口契约**
- 登录：`POST /api/member-login` body `{ "phone": "<手机号>" }` → `data.name`（会员显示名）。
- 会话：URLSession 共享 Cookie；会话 cookie `meponto_session` 自动保存/回传；退出登录清除该 cookie。

**Android 落地提示**：用 `AuthState { loading, guest, member }`；`requireMember()` 网关——非会员则弹登录 sheet 并返回 false，调用方 `if (requireMember()) { ... }`。OkHttp 用 `CookieJar` 持久化 `meponto_session`。

---

## 2. 个人信息：姓名 / CPF / 手机号 / PIX（新增）

**变更点**：后台把用户纳为骑手后，App「我的 → 个人信息」可**查看并主动填写/更新** 姓名、CPF、手机号、PIX。

**业务规则**
- `isComplete = CPF && PIX && phone 均非空`。
- **提现强约束**：资料未补全时，钱包页提示「请补全 CPF 与 PIX 才能接收提现」并**禁用提现按钮**。
- 「我的」入口在资料不全时显示橙色提醒点 + 文案。
- 只读区展示后台下发：网点(ponto)/队长(leader)/99 ID；可编辑区：姓名/CPF/手机/PIX。

**接口契约**
- 读取（随 bootstrap）：`GET /api/wallet?riderName=` 的 `data.me` 现包含可选 `cpf / pix / phone`（有则用，无则留空待补）。
- 更新：`POST /api/rider/profile` body `{ name, cpf, phone, pix }` → `error == null` 视为成功。

**Android 落地提示**：`Rider` 模型加 `cpf/phone/pix` + `isComplete`；个人信息编辑页保存即本地更新 + 异步回写；钱包提现按钮 enabled 加 `profile.isComplete` 条件。

---

## 3. 排班（重做，多项业务修正）

**变更点**：周/日可点击表格；按骑手 Ponto 过滤；报名审核状态；**移除"金额"**；分页位置调整。

**业务规则**
- **绑定 Ponto**：骑手只看到/只能报名**本网点**班次（`shift.zone == profile.ponto`）。
- **班次无保证收入**：DispatchShift 无 payout 字段，**不显示金额**。改为显示：时段、**热区(hotzone)**、**剩余/总名额**、`critical`(高峰)标记。详情页注明「报名只锁定名额，实际收入按完成订单计算，不保证金额」。
- **报名审核状态**：报名进入 `submitted(审核中)` → `approved(已通过)` / `rejected`。映射：`hq_reviewed/franchise_confirmed → approved`；`rejected/cancelled → 不计入`；其余 → `submitted`。
- **本周/下周切换**：可查看下周名额；周切换器到边界禁用箭头。日期**按当前日期动态生成两周**（不要写死）。
- **分页**：当天班次列表**全显示不分页**；分页放在「我的日程(agenda)」（每页 3 条）。

**接口契约**
- 列表：`GET /api/slots` → `data.slots[]`（`id,date,weekday,startTime,endTime,capacity,enrolled,status,priority,pontoName,franchiseName,quotaNote`）+ `data.enrollments[]`（`slotId,status`）。
- 报名：`POST /api/slots` body `{ "slotId": "<id>" }`（需 tier≥2 且本周开放；用 slot 的 `id`）。
- 窗口文案 = `startTime – endTime`；`hotzone = quotaNote ?? pontoName`；`critical = priority`。

**Android 落地提示**：Slot→UI 映射同上；report 周分组用 ISO 周一为周首；agenda 分页与 day-list 不分页保持一致。

---

## 4. 扫码业务逻辑（方向修正）

**变更点**：骑手为**扫描方**，按码类型分流。

**业务规则**
- 扫**商户码** → 获得**服务折扣**（按类别固定：燃油 R$5 / 话费 R$5 / 维修 R$20 / 装备 R$20 / 整车 R$30；含冷却天数与每日上限，见 `partnerServiceBenefitRules`）。
- 扫**站点码** → **签到得积分**（当前 +50 pts，写入积分余额）。
- 码识别：含 `partner` 或 `crm-` 前缀 → 商户折扣；含 `ponto/checkin` 或 `p-` 前缀 → 签到。
- 「我的 MePonto 二维码」语义改为**会员身份码**（不再是"商户扫你核销折扣"）。

**Android 落地提示**：扫码结果页按 `ScanOutcome { partnerDiscount, checkIn, unknown }` 分支；签到积分入账后刷新积分余额。

---

## 5. 首页口径修正

**变更点**
- 「今日收益」→ **「昨日收益」**（结算按上一业务日，对齐 99 导入口径）；订单标注「本周」。
- **绩效改为「本周 · 个人」**周维度，注明「口径同主后台」。
- **任务**加注「**由运营后台设置（目标 + 奖励 + 周期）**」——App 仅展示进度，规则后台下发。

**Android 落地提示**：仅文案/取数口径调整，无新接口；任务数据应来自后台活动配置而非写死。

---

## 6. 地图按骑手定位

**变更点**：以**骑手实时定位**为中心，周边**服务点按距离排序**并显示**服务类型 + 距离 + 折扣**；未授权定位时给提示并回退到网点区域。

**Android 落地提示**：FusedLocationProvider 取定位；`distance = 用户↔商户` 实时计算并排序；标注按类别用不同图标。

---

## 7. 启动页（开屏/广告）可后台配置 + 品牌

**变更点**：开屏内容由后台下发（开关/标语/时长/广告图/跳转）；本地缓存 + 失败回退默认；用真实 MePonto Logo；**App 名称 = MePonto**。

**接口契约**：`GET /api/app/rider/splash` →
`{ enabled, headline, tagline, durationMs, backgroundHex, accentHex, imageURL, linkURL }`（best-effort，失败用默认）。

**Android 落地提示**：SplashConfig 同字段；启动读缓存即时渲染、后台拉取更新供下次用。

---

## 8. 商城/积分补充

- 新增**积分流水**（Extrato de pontos，入账/兑换明细，来源+状态）。
- **邀请好友得积分**（二维码，好友首单到账）。
- **我的会员二维码**（身份码）。
- 兑换、我的二维码为会员专属（游客触发登录）。

**接口契约**：`GET /api/points?riderId=` → `data.accounts[].available` + `data.ledger[]`；`GET /api/marketplace/catalog` → 商品。
积分流水符号：`type ∈ {earn,refund,release,adjust}` 为 +，其余为 −。

---

## 9. 架构 / 数据对齐（实现侧，便于对照）

- **取数架构**：界面只读本地 Store；Store 经 `RiderAPI` 协议取数。游客用 Mock，会员登录后切真实接口，**UI 零改动**。建议 Android 同构（Repository 接口 + Mock/Live 两实现）。
- **容错**：每个请求 best-effort，失败/缺字段回退本地默认，界面永不空白；整体失败显示重试态。
- **数据对齐**：骑手姓名单一来源（profile）；排班日期动态生成；个人/网点数据统一从 profile 派生。

---

## 接口清单速查

| 用途 | 方法 路径 | 关键字段 |
|---|---|---|
| 登录 | `POST /member-login` | `{phone}` → `data.name` |
| 钱包+身份 | `GET /wallet?riderName=` | `me.{riderId,available,held,cpf,pix,phone}` |
| 积分 | `GET /points?riderId=` | `accounts[].available`, `ledger[]` |
| 商城 | `GET /marketplace/catalog` | `id,name,pointsPrice,stock,category,status` |
| 排班 | `GET /slots` / `POST /slots {slotId}` | slots[]+enrollments[] |
| 个人信息更新 | `POST /rider/profile` | `{name,cpf,phone,pix}` |
| 开屏配置 | `GET /app/rider/splash` | enabled/tagline/durationMs/imageURL… |

> 注：写路径（取消报名、兑换、提现、签到）后端尚未开放骑手侧 mutation，iOS 端先乐观更新；后端补齐后两端同接。
