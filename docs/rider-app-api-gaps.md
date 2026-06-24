# 骑手端 App 真实数据对接清单 / Rider App ↔ PontoSys API Gap Sheet

> 适用于 `android-rider-app/`(Kotlin/Compose)与 `ios-rider-app/`(SwiftUI)。
> 两端共用同一份 PontoSys 契约(`docs/api.md`),基础地址 `https://mall.meponto.com/api/`。
> 所有读取均 best-effort:失败/缺字段自动回退 mock,App 永不白屏。

本表把骑手端每个功能分为三类:**✅ 已接真实** · **🟡 端点已存在、可立即接(有注意点)** · **🔴 需后端新增**。
每项标注后端端点结构与两端要改的文件。

App 改动落点(统一):
- Android:`data/remote/ApiService.kt` + `data/remote/Dtos.kt` + `data/RiderRepository.kt`(mapper)+ `data/AppStore.kt`(`apply`)。
- iOS:`Networking/APIClient.swift`(DTO + mapper)+ `Services/LiveRiderAPI.swift`(`fetchBootstrap` 合并)。

---

## ✅ 已接真实(both apps)

| 功能 | 端点 | 说明 |
| --- | --- | --- |
| 登录 | `POST /api/member-login {phone}` | 写会话 cookie `meponto_session`(Android 持久化 CookieJar / iOS 共享 HTTPCookieStorage) |
| 会员名 / 网点 | `GET /api/wallet?riderName=` · `GET /api/slots` | `me.name` → profile.name;slots 首条 `pontoName` → profile.ponto |
| 钱包余额 | `GET /api/wallet?riderName=` | `available` → 可用;`held` → 待结算 |
| 积分余额 + 流水 | `GET /api/points?riderId=` | `accounts[].available` → 余额;`ledger[]` → 流水(earn/refund/release/adjust 记 +,其余 −) |
| 商城商品 | `GET /api/marketplace/catalog` | `pointsPrice/stock/category` → MallProduct |
| 班次(读 + 报名) | `GET /api/slots` · `POST /api/slots {slotId}` | slot → Shift(含 `apiId`);报名后重新拉取刷新 |

---

## 🟡 端点已存在,可立即接(本轮在仓库中确认)

### 1. 地图商户 — `GET /api/service-map`(无鉴权)
返回:`{ data: { partners: [{ id, name, category, services, bairro, lat, lng, phone }], stores: [...] } }`
- 用途:地图页商户 pin + 列表。`stores` 是网点取货点,可作第二图层。
- ⚠️ 注意:**没有 `discountBRL / partnerPoints / distance`**(当前 UI 有折扣徽章)。接入时:折扣徽章在缺失/0 时隐藏;或见下 🔴 E 让后端在 partner 上补这些字段。
- 映射:`Partner(name, neighborhood=bairro, category, services, discountBRL=0, partnerPoints=0, distance="", latitude=lat, longitude=lng)`。

### 2. 消息 Inbox — `GET /api/notifications`(GET 无鉴权)
返回:`{ data: [{ id, title, body, href, source, severity, createdAt, readAt?, acknowledgedAt? }], summary:{unreadCount,...} }`
- 映射:`InboxItem(title, detail=body, time=createdAt 转相对时间)`。
- ⚠️ 注意:目前是**事件/系统通知(incident/system),非骑手个人消息**。要骑手个人维度需后端支持 `?riderName=` 过滤(见 🔴)。

### 3. 当日绩效 — `GET /api/performance?mine=<riderName>`(权限 `use_rider_app`)
返回:`{ data: { date, completedOrders, tsh, ar } }` 或 `null`
- 映射:`Performance(orders=completedOrders, tshHours=tsh, acceptanceRate=ar, cancelledOrders=保留/0)`。
- ⚠️ 注意:是**最近一天**,不是整周;**无 `cancelledOrders`**。Home 现为周汇总文案,接入前先和产品确认口径。
- 附:`GET /api/performance?ranking`(`use_rider_app`)→ `{ data: { top: [{name, orders}] } }`,可做"骑手排行榜"新功能。

---

## 🔴 需后端新增 / 扩展(当前无骑手端 GET,App 仍用 mock)

> 建议统一前缀 `/api/rider/*`,权限 `use_rider_app`,以会话 rider 为作用域(或 `?riderName=` / `?riderId=`)。

### A. 骑手资料 + 等级输入(优先级高 → 会员卡真实化)
`GET /api/rider/profile?riderName=` →
```json
{ "data": { "name": "...", "ponto": "...", "leader": "...", "bairro": "...",
            "ninetyNineId": "...", "ar": 96, "nightShiftCount": 14, "incidentCount": 1 } }
```
- 用途:**会员卡等级分**现用本地 `ar/nightShiftCount/incidentCount` 推算(member-login 不返回);`leader/bairro/99ID` 现为 mock。
- App:补 `RiderProfileDto` → 合并进会员卡数据源(Android `MembershipProfile`,iOS `LiveRiderAPI.fetchBootstrap` 的 profile)。

### B. 今日概览(首页三卡)
`GET /api/rider/overview?riderName=` →
```json
{ "data": { "today": { "earningsBRL": 86.40, "orders": 18, "pointsToday": 240 } } }
```
- 用途:首页"今日收益/单量/积分"(现 mock)。绩效可复用 🟡3,但**今日收益/积分**缺。

### C. 任务 Missions
`GET /api/rider/missions?riderName=` → `{ "data": [{ "id", "title", "reward", "progress": 0.75 }] }`
- 用途:首页任务进度(现 mock)。

### D. 现金账本(append-only)
建议扩展 `GET /api/wallet?riderName=` 增加 `recentLedger`,或新 `GET /api/rider/cash-ledger?riderName=` →
```json
{ "data": [{ "title", "detail", "value": "+R$ 120,00", "status": "Disponível", "tone": "ok" }] }
```
- 用途:首页现金账本 + 钱包流水(现 mock;wallet 目前只回 `withdrawals`)。

### E. 合作商户权益 / 地图折扣
让 `service-map` 的 partner 增加 `discountBRL`、`partnerPoints`,或新
`GET /api/rider/partner-benefits?riderName=` → `[{ partner, service, discount, status }]`
- 用途:首页"合作商户权益" + 地图折扣徽章(🟡1 缺这些字段)。

### F. 写回(把乐观更新变真实)
- 提现:`POST /api/wallet {action:"requestWithdrawal", riderName, amount}`(**已存在**)。App 待办:把金额透传——iOS `RiderAPI.requestWithdraw()` 现无参、Android `AppStore.requestWithdraw()` 现本地,需要小改签名带 `amount`。
- 兑换:`POST /api/marketplace/orders {productId, accountType:"rider", riderId}`(**已存在**)。App 待办:`redeem` 改为带 `productId` 调真实下单。

### G. 站点签到积分
`POST /api/rider/checkin {stationId 或 qr}` → `{ "data": { "pointsAwarded": 50 } }`
- 用途:扫码"站点签到"(现 +50 本地)。

### H. 等级预览条 / 阈值
首页底部"等级预览"五档可静态(对齐 `docs/meponto-points-economy-standard.md`),或从 `GET /api/points` 的 `ruleSetVersions/rules` 派生。

---

## 优先级建议

1. **🟡 可立即接**(无需后端):service-map(地图)、notifications(消息)、performance?mine(绩效)——我可直接接,注意点见上。
2. **🔴 A 骑手资料**:让会员卡等级真实化,收益最高。
3. **🔴 B/C/D**:首页今日/任务/账本。
4. **🔴 F 写回**:提现/兑换闭环为真实事务(经济类务必走后端账本)。
5. **🔴 E/G/H**:权益、签到、等级阈值。

> 接入任一项时,把该端点一次真实响应贴过来,我据此校准两端 DTO/mapper(契约若与本表略有出入,只改 mapper,UI 不动)。
