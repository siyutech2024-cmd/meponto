# 骑手 App 数据闭环核对 / Rider App Data Closed-Loop Audit

上线前逐屏核对每项数据的来源:**真实接口** vs **需补后端**。原则:**纯真实,无 mock**
——App 二进制里不再内置任何演示用户数据(persona/金额/积分/班次/商品全部清空),
登录后由 PontoSys API 填充;**没有后端来源的板块直接隐藏**,绝不显示假数字。

## ✅ 已闭环(真实接口,读+写)

| 屏幕 | 数据 | 来源 | 写回 |
| --- | --- | --- | --- |
| 首页问候/身份 | name, ponto, leader, 99ID, CPF, phone, PIX | `GET wallet` + `GET rider/profile` | `POST rider/profile` |
| 钱包 | available, pending | `GET wallet` | 提现 `POST rider/payout` |
| 积分/商城 | pointsBalance, pointsLedger | `GET points` | — |
| 商城 | 商品目录、库存 | `GET marketplace/catalog` | 兑换 `POST marketplace/redeem` |
| 班次 | 周排班、名额、状态(按 ponto 过滤) | `GET slots` | 报名 `POST slots` / 取消 `POST slots/cancel` |
| 个人资料 | 资料编辑 | `GET rider/profile` | `POST rider/profile` |
| 扫码签到 | 签到积分 | — | `POST rider/checkin` |
| 推送 | FCM token | — | `POST push (registerToken)` |

这些是核心资金/积分/履约闭环,均为真实数据,登录即生效。

## ✅ 本轮新接入(GET /rider/home 聚合 + rider/profile 扩展)

新增后端聚合接口 `GET /api/rider/home`(会话态),Android `loadSnapshot` 一次拉取并填充。
全部来自真实集合,**无数据时返回空数组/ null,客户端隐藏对应板块**(绝不造假):

| 屏幕板块 | 字段 | 真实来源 |
| --- | --- | --- |
| 首页 · 表现 | performance(单量/TSH/AR/CAA) | `riderDailyKpis`(最新一条算率、本周累加算量) |
| 首页 · 任务 | missions | `appTasks`(rider/all 启用)+ `taskClaims`(进度) |
| 首页 · 现金流水 / 钱包 · 流水 | cashLedger | `riderWithdrawals`(出)+ `walletPayments`(入) |
| 首页 · 消息 | inbox | `notifications`(近 6 条公告) |
| 地图 · 附近商户 | partners | `crmPartners`(名称/类目/片区/服务/经纬度) |
| 会员等级 | profile.ar / nightShiftCount / incidentCount | `rider/profile` 已补返回(来自 Rider 记录) |
| 钱包周目标 | weeklyGoalProgress | `riderDailyKpis` 在线时长 / 40h 周 |

> 说明:`riderDailyKpis`、`riderWithdrawals` 默认无种子数据,所以表现/流水会在
> 真实运营数据进来后才显示——这正是"真实即显示、无数据即隐藏"。`crmPartners`、
> `appTasks`、`notifications` 已有种子,地图/任务/消息会直接有内容。

## ⚠️ 仍未接(缺后端模型,保持隐藏,不造假)

| 屏幕板块 | 字段 | 缺口 |
| --- | --- | --- |
| 首页 · 今日统计 | todayStats | 与"表现"重复,待由 performance 派生即可显示 |
| 首页 · 合作权益 | partnerBenefits | `crmPartners` 无"折扣/积分回馈"字段,需补合作优惠模型 |
| 地图商户 · 折扣/积分/距离 | discountBRL / partnerPoints / distance | 同上无优惠模型;距离需骑手定位。现置 0/空,名称与定位真实 |

## 🟦 静态配置(非用户数据,保留)

- 首页 · 等级阶梯(tiers 分段参考):展示用配置。
- 支持页 · 操作入口(helpActions:紧急报案/在线客服/账户安全):导航入口,文案三语。

## 建议的下一步(把"暂隐藏"变"真实")

1. 后端给 rider 维度补只读接口或扩展现有返回:
   - `GET rider/profile` 增加 `ar / nightShiftCount / incidentCount`(驱动等级)。
   - `GET wallet` 增加 `weeklyGoalProgress` 与 `ledger`(现金流水)。
   - `GET performance?riderId=` 返回单量/TSH/AR/CAA。
   - `GET notifications?riderName=`(收件箱)、`GET partners`(含经纬度)。
2. Android `RiderRepository.loadSnapshot` 增加这些拉取,填进 `AppStore`;
   对应板块的 `isNotEmpty()` 守卫会自动让它们重新显示。
3. 每补一个,本文件对应行从 ⚠️ 移到 ✅。

## 本轮改动(Android)

- `AppStore`:核心会员状态(身份/积分/钱包/班次/商品/积分流水)默认清空,API 填充。
- 取消内置演示数据;`MockData` 仅保留 tiers + helpActions 静态配置。
- 首页/钱包/地图:无数据板块隐藏或显示 `empty.generic` 空态(三语已存在)。
- 静态自检:类型齐全、各编辑文件括号配平通过(Android 构建在你本机 Android Studio 进行)。
