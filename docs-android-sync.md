# MePonto 骑手端 — Android 团队同步说明 / Android Sync Notes

> 面向 **Android 团队**(`android-rider-app/`,Kotlin + Jetpack Compose)。
> 与 iOS(`ios-rider-app/`,SwiftUI)同源同契约;后端契约见 `docs/api.md`、缺口见 `docs/rider-app-api-gaps.md`。
> 基础地址:`https://mall.meponto.com/api/`(`BuildConfig.BASE_URL`)。
> 通用原则:**所有读取 best-effort**——失败/字段缺失自动回退 mock,UI 永不白屏;**经济类写操作必须走后端账本**,不可只做本地。
> 图例:✅ 端点已存在 · 🔴 待后端新增 · ✍️ 写操作。

---

## 1. 延迟登录(游客可进 + 敏感操作再登录)

**变更点**
- App 以**游客**身份直接进入,公共内容(商城目录、班次、地图)可浏览;**会员操作**(钱包、报名、兑换、签到、个人资料)触发 `requireMember()` 弹出登录/注册。
- 登录方式:**手机号**(phone-only,demo 级;后续可升级 OTP)。会话基于 **cookie**。

**业务规则**
- 未登录点会员操作 → 弹登录,不报错、不阻断浏览。
- 会话 cookie `meponto_session`(HttpOnly, SameSite=Lax, 有 Max-Age),需**持久化**,重启仍登录。
- 退出登录:清除该 cookie + 本地登录态,回到游客。

**数据·接口契约**
- ✅ `POST /api/member-login` body `{ "phone": "<digits>" }`
  - 200 → `{ data: { name, role:"Rider", portal:"rider", organization } }` + `Set-Cookie: meponto_session=...`
  - 400 电话无效;404 电话未注册(提示先注册)。

**Android 落地提示**
- OkHttp 持久化 `CookieJar`(已实现 `data/remote/SessionCookieJar.kt`,SharedPreferences 落盘)。
- `SessionManager`(guest/member 态),`requireMember()` 控制登录弹窗;退出调 `cookieJar.clear()`。
- 登录成功后立刻 `loadSnapshot(name)` 刷新为会员数据。

---

## 2. 个人信息 CPF / 手机 / PIX(可填可改 + 提现强约束)

**变更点**
- 会员资料新增 **CPF / 手机 / PIX**,App 内可查看与修改。

**业务规则**
- **提现前置校验**:`PIX` 与 `CPF` 必须补全,否则不允许申请提现,引导跳资料页补全。
- 手机号通常来自后端;CPF/PIX 初始可能为空,需提示骑手补全。

**数据·接口契约**
- 读:✅ `GET /api/wallet?riderName=` 的 `me` 已含(后端暴露时)`cpf / pix / phone`。
- 写:🔴✍️ `POST /api/rider/profile` body `{ name, cpf, phone, pix }`(**后端尚未提供**;App 已按此调用,缺失时静默失败、保留本地值)。

**Android 落地提示**
- `MembershipProfile` 增加 `cpf/phone/pix` 字段;资料编辑页(`OutlinedTextField`)。
- 提现按钮 `enabled = pix.isNotBlank() && cpf.isNotBlank()`;否则提示去资料页。
- DTO:`WalletMe` 增加 `cpf/pix/phone`;新增 `RiderProfileUpdate` 请求体。

---

## 3. 排班重做(绑定 Ponto / 无金额 / 审核状态 / 周切换 / 动态日期)

**变更点**
- 骑手**只看本网点(Ponto)**的班次;班次**不再显示金额**;报名进入**审核状态流**;支持**本周/下周**切换;日期相对"今天"**动态生成**;分页从列表移到**"我的日程"**。

**业务规则**
- 报名只锁定名额;**收入按完成订单计算,不保证金额**(UI 明确提示)。
- 报名状态:`submitted(审核中) → ponto_approved → franchise_confirmed → hq_reviewed(已通过)`;或 `rejected / cancelled`。App 端归并:`submitted/ponto_approved` 显示「审核中」,`franchise_confirmed/hq_reviewed` 显示「已通过」。
- 报名前置:rider 角色 + **tier ≥ 2** + 当周 `weekStatus == "open"`。

**数据·接口契约**
- ✅ `GET /api/slots`(需会话)→ `{ data: { slots:[RiderSlot], enrollments:[SlotEnrollment], weekStatus, weeks, summary } }`
  - `RiderSlot { id, date(yyyy-MM-dd), weekday, startTime, endTime, capacity, enrolled, status(open|full|ended), priority, pontoName, franchiseName, quotaNote }`
  - `SlotEnrollment { id, slotId, status }`
- ✅✍️ `POST /api/slots` body `{ slotId }` → 201 `{ data: enrollment }`(403 非 rider/未达 tier;409 未开放/已满/重复)。
- 🔴✍️ **骑手自助取消**:暂无端点(现有 `PUT /api/slots` 是后台审核动作)。取消暂为本地乐观更新,待后端补 rider 取消路由。

**Android 落地提示**
- `Shift` 增加 `apiId / station / dateKey / weekday / dayLabel / hotzone / critical / status(枚举)`。
- 周分组用 ISO 周(`Calendar` firstDayOfWeek=MONDAY, minimalDaysInFirstWeek=4);`profile.ponto` 过滤 `riderShifts`。
- 详情页报名 → `POST /api/slots {slotId=shift.apiId}` → 成功后重新 `loadSnapshot` 刷新。

---

## 4. 扫码方向修正 + 我的二维码

**变更点**
- 扫码语义明确:骑手**扫商户码 → 服务折扣**;骑手**扫站点码 → 签到积分**。
- **"我的二维码" = 会员身份码**(由商户扫描核销折扣),不是骑手去扫别人。

**业务规则**
- 我的码内容:`meponto://rider/{99id}`;邀请码:`meponto://invite/{99id}`(好友首单后积分到账)。
- 二维码内容**端上生成**(离线可用)。

**数据·接口契约**
- 生成:端上(Android 用 ZXing,iOS 用 CoreImage)。
- 🔴✍️ 折扣核销 / 站点签到积分的**写端点待后端**(见第 9 节速查表 checkin)。

**Android 落地提示**
- ZXing(`com.google.zxing:core`)生成位图;扫码用 CameraX + ML Kit。
- `ScanScreen` 文案区分「扫商户·折扣 / 扫站点·签到」;签到积分现本地 +50,接 `POST /api/rider/checkin` 后改真实。

---

## 5. 首页口径(昨日收益 / 周绩效个人 / 任务后台下发)

**变更点**
- "今日收益"实际是 **昨日结算**(99 导入 T+1 规则);"绩效"是**个人周汇总**;"任务"由后台下发。

**业务规则**
- 收益文案应体现"昨日/已结算"口径,避免误解为实时今日。
- 绩效为按 99 导入计算的个人 KPI。

**数据·接口契约**
- ✅ `GET /api/performance?mine=<riderName>`(权限 `use_rider_app`)→ `{ data: { date, completedOrders, tsh, ar } }`(**最近一天**,无 `cancelledOrders`),或 `null`。
- ✅ 排行榜(可选):`GET /api/performance?ranking` → `{ data: { top:[{name, orders}] } }`。
- 🔴 今日收益/积分汇总、任务列表:待后端 `GET /api/rider/overview`、`GET /api/rider/missions`。

**Android 落地提示**
- 绩效卡接 `performance?mine`;`cancelledOrders` 暂留空/0;与产品确认"周 vs 日"口径。
- overview/missions 未就绪前保留 mock,接口到位仅改 mapper。

---

## 6. 地图按定位(周边服务点 + 距离 + 类型)

**变更点**
- 地图展示**周边服务点**,按**距离**与**服务类型**呈现;网点取货点作为单独图层。

**业务规则**
- `partners` = 服务点(维修/加油等),不是取货点;`stores` = 网点取货点(唯一取货处)。
- 距离需**端上按定位计算**(后端不返回 distance)。

**数据·接口契约**
- ✅ `GET /api/service-map`(无鉴权)→ `{ data: { partners:[{id,name,category,services,bairro,lat,lng,phone}], stores:[{id,name,bairro,franchise,lat,lng,address}] } }`
- ⚠️ partner **无 `discountBRL/partnerPoints`**:折扣徽章在缺失时隐藏,或待后端在 partner 上补(见缺口表 E)。

**Android 落地提示**
- 申请定位权限,按 `Location` 计算并排序距离;`Partner` 映射 `neighborhood=bairro`;`stores` 第二图层。
- 现无 Google Maps Key 时,地图用风格化布局 + `geo:` 导航 intent;有 Key 后可换 Maps Compose。

---

## 7. 开屏可后台配置 + 真实 Logo + App 名 MePonto

**变更点**
- 开屏页(splash)由**后台下发配置**;使用**真实品牌 Logo**;App 名为 **MePonto**。

**业务规则**
- 开屏可被后台关闭/改文案/改时长/挂广告图;端上缓存,失败用缓存或默认;Profile 内可本地预览编辑。

**数据·接口契约**
- ✅ `GET /api/app/rider/splash` → `SplashConfig { enabled, headline, tagline, durationMs, backgroundHex, accentHex, imageURL, linkURL }`。

**Android 落地提示**
- `SplashController` 拉取 + 缓存(SharedPreferences)+ 默认兜底;冷启动门展示。
- Logo:用真实资源(`public/icon-512.png` 已生成各密度 launcher PNG;splash/登录/首页用 `R.drawable.meponto_logo`)。`strings.xml` `app_name = MePonto`。

---

## 8. 积分流水 / 邀请 / 会员码

**变更点**
- 商城页新增**积分流水**(append-only)、**邀请入口**、**我的会员码**。

**业务规则**
- 流水符号:`earn/refund/release/adjust` 记 **+**;`spend/expire/reverse/hold` 记 **−**。
- 邀请/会员码为端上生成的 deep link(见第 4 节)。

**数据·接口契约**
- ✅ `GET /api/points?riderId=` → `{ data: { accounts:[{riderId,available,pending}], ledger:[{type,points,status,sourceType,note,reasonCode,createdAt,balanceAfter}] } }`
- ✅✍️ 兑换:`POST /api/marketplace/orders` body `{ productId, accountType:"rider", riderId }` → 下单扣积分(走后端账本)。

**Android 落地提示**
- `PointsLedgerEntry` 映射 + 符号规则;商城积分流水面板;我的/邀请二维码底栏(`ModalBottomSheet` + ZXing)。
- 兑换从"本地乐观扣减"改为 `POST /marketplace/orders`(带 `productId/riderId`)后再刷新余额。

---

## 9. 架构与数据对齐

**变更点**
- 数据层抽象为 **Repository 接口 + 双实现**(Mock / Live);统一 **best-effort 容错回退**;**姓名单一来源**。

**业务规则**
- 屏幕只读 Store;Store 经 Repository 取数。游客用 Mock,会员登录后注入 Live,UI 零改动。
- `riderName` 由 `profile.name` 派生(单源),避免多处不一致。

**数据·接口契约**
- 见上各节;iOS 对应 `RiderAPI` 协议(`MockRiderAPI` / `LiveRiderAPI`),Android 对应 `RiderRepository`(可同样拆 `Mock/LiveRiderRepository` 接口)。

**Android 落地提示**
- 建议把 `RiderRepository` 抽成接口 + `LiveRiderRepository`/`MockRiderRepository` 两实现,与 iOS 对齐;`AppStore.apply(snapshot)` 合并非空字段;登录态切换实现即可。

---

## 接口清单速查表 / Endpoint Quick Reference

| 功能 | 方法·路径 | 鉴权 | 关键字段 | 状态 |
| --- | --- | --- | --- | --- |
| 登录 | `POST /member-login` | 公开 | `phone` → `{name,role,portal}` + cookie | ✅ |
| 钱包 | `GET /wallet?riderName=` | use_rider_app | `me{available,held,paid,settled,cpf,pix,phone}`, `withdrawals[]` | ✅ |
| 提现 ✍️ | `POST /wallet {action:"requestWithdrawal",riderName,amount}` | use_rider_app + view_finance | 返回 `withdrawal` + `balance` | ✅ |
| 积分 | `GET /points?riderId=` | 公开* | `accounts[{available,pending}]`, `ledger[]` | ✅ |
| 商城目录 | `GET /marketplace/catalog` | 公开 | `[{id,name,pointsPrice,stock,category}]` | ✅ |
| 兑换 ✍️ | `POST /marketplace/orders {productId,accountType:"rider",riderId}` | 公开* | 下单扣积分 | ✅ |
| 班次 | `GET /slots` | 需会话 | `slots[]`, `enrollments[]`, `weekStatus` | ✅ |
| 报名 ✍️ | `POST /slots {slotId}` | rider, tier≥2, 周open | `enrollment` | ✅ |
| 取消报名 ✍️ | (骑手自助取消) | — | — | 🔴 待后端 |
| 绩效(当日) | `GET /performance?mine=<name>` | use_rider_app | `{date,completedOrders,tsh,ar}` | ✅ |
| 排行榜 | `GET /performance?ranking` | use_rider_app | `top[{name,orders}]` | ✅ |
| 地图 | `GET /service-map` | 公开 | `partners[{name,category,services,lat,lng}]`, `stores[]` | ✅(缺折扣字段) |
| 消息 | `GET /notifications` | 公开(GET) | `[{title,body,createdAt,severity,readAt}]` | ✅(系统/事件,非个人) |
| 开屏配置 | `GET /app/rider/splash` | 公开 | `SplashConfig` | ✅ |
| 个人资料 ✍️ | `POST /rider/profile {name,cpf,phone,pix}` | — | 更新身份/收款 | 🔴 待后端 |
| 今日概览 | `GET /rider/overview?riderName=` | — | `today{earningsBRL,orders,pointsToday}` | 🔴 待后端 |
| 任务 | `GET /rider/missions?riderName=` | — | `[{title,reward,progress}]` | 🔴 待后端 |
| 现金账本 | `GET /rider/cash-ledger?riderName=`(或扩展 wallet) | — | `[{title,detail,value,status,tone}]` | 🔴 待后端 |
| 签到 ✍️ | `POST /rider/checkin {stationId|qr}` | — | `{pointsAwarded}` | 🔴 待后端 |

\* 标"公开*"者后端当前未强制鉴权,但生产应按 rider 会话作用域收敛。

**写路径(✍️)汇总**:提现 ✅、兑换 ✅、报名 ✅;取消报名 🔴、签到 🔴、个人资料 🔴。
前三项已可接真实事务;后三项待后端补端点,App 现为本地乐观更新(失败/缺端点不影响浏览)。
