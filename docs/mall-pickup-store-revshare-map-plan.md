# 方案 v2：公开用户 + 取货门店 + 两级销售分成 + Partner 地理 + 服务地图

> 一条完整闭环：注册（用户/骑手/partner）→ 选门店下单 → 站点履约(无库存,T+1~3 到货,站长提醒)→ 站点/加盟商/总部可见 → 两级销售分成结算 → partner 就近取货 → 骑手服务地图。

---

## 1. 账户与会员（**不动现有数据表** · 需求6）

**不新建表、不迁移。** 复用现有 `riders` 集合承载所有会员：
- **公开用户** = `riders` 记录中**无 `ninetyNineId`** 的会员。
- **骑手** = 有 `ninetyNineId` 的会员。
- 后台**仅新增一个「用户(会员)」菜单**（视图层）：列出全部会员，**包含骑手**（有 99 ID 者，可筛选）。现有「骑手」页面/数据保持不动。
- 积分账户沿用现有 `pointsLedgerEntries`（按会员 id 记账，key 不变）；Partner 仍独立账户。
- Partner 注册补写**真实** `lat/lng/address`（`crmPartners` 已有 lat/lng 字段，仅改注册写入，不改表结构）。

**会员等级**（现有 `tierDefinitions` 已天然支持，**无需改数据**）：
- 会员一级=`member`（无 99 ID，停留此级、可正常累积积分）。
- 会员二级=`bronze`（绑定 99 ID 且有完单记录，`resolveTier` 自动升）。
- 三级以上：现按完单数；**改为按积分升级的阈值表后续再定**（占位，先不动）。

---

## 2. 取货门店规则（需求1/3 + 骑手限制）

| 下单方 | 取货门店范围 |
|---|---|
| 骑手 **有归属站点** | **锁定**该站点 |
| 骑手 **无归属站点**（有加盟商） | 本加盟商下属 `pickupEnabled` 站点 |
| **公开用户** | **不限制**，任一 `pickupEnabled` 门店 |
| **Partner** | **离 partner 服务点最近的 10 个** `pickupEnabled` Ponto（按 `lat/lng` 直线距离排序取前 10） |

- 门店 = 现有 `Ponto`（含 `lat/lng/franchise`），新增 `pickupEnabled`。
- **取货只能在 Ponto（需求4）**：所有账户（含 Partner）一律在选定的 Ponto 取货，**不再有「发到 partner 自己店」的路径**——partner 订单也落到最近 Ponto，由站长履约。
- 订单写入 `pickupStoreId / pickupStoreName`；`order.franchise = 门店所属加盟商`（→ 销售记录与分成归属）。
- **关键**：骑手取货恒在本加盟商内 → 不影响 `/wallet`、KPI 的「骑手派薪」口径；跨加盟商只由公开用户/partner 选店产生，分成统一以 `order.franchise`（取货门店加盟商）为准。

---

## 3. 履约：无库存 + T+1~3 到货 + 站长提醒（需求4）

- **门店不设库存**：`Ponto` 不持有存货；商品 `stock` 维持「全局可兑数量」用于风控，门店仅作取货点。
- 下单后货按 `deliveryCycleDays`（默认隔天，1~3 天）配送到所选门店。
- 流程：`created` →（货到）站长 `markArrived` → **自动推送提醒客户取货** → 客户到店 `markPickedUp(fulfilled)`。
- 提醒对象扩展到**公开用户/会员**（现有 markArrived 已对骑手推送，扩展按 user 推送/短信）。
- 虚拟商品仍即时发券；高价值审核、取消退款闭环不变。

---

## 4. 两级销售分成闭环（需求1 · 我来设计）

**模型：产品 → 加盟商分成（HQ 定）→ 站点分成（加盟商定）**

数据：
- `MarketplaceProduct` 新增 `franchiseShareBRL`（每次成功取货给加盟商的**固定 R$**，HQ 在商城后台按产品设置；默认 0）。✓ 已确认固定额。
- `Franchise` 新增 `stationShareBRL`（加盟商分给经手站点的**固定 R$**，加盟商在加盟商后台设；默认 0=全归加盟商）。✓ 已确认固定额；v1 全商统一，v2 可按站点。
- 新 collection `mallRevenueShareEntries`（订单级 append-only 分成账）：
  `orderId, productId, pickupStoreId, franchise, franchiseShareBRL, stationShareBRL, franchiseNetBRL(=franchiseShareBRL−stationShareBRL), createdAt, status(accrued/settled)`。

闭环：
1. HQ 按产品设 `franchiseShareBRL`。
2. 加盟商设 `stationSharePct`。
3. 订单 **fulfilled（已取货）** 时生成一条分成账：站点得 `stationShareBRL`，加盟商净得 `franchiseShareBRL − stationShareBRL`（站点额不超过加盟商额）。仅成功取货计提（取消/驳回不计）。
4. **月度对账**：按 franchise + station 汇总 → 新增 `RevenueShareStatement`（复用 SupplierStatement 三段式：generate → 加盟商 confirm → HQ pay）。
5. 可见性：HQ 全量；加盟商看本商（含各站点明细）；站点看本站点。

> 这条与「供应商对账」并行：供应商收 `supplyPrice`，加盟商/站点收 `share`，HQ 收差额。三方账各自独立、可追。

---

## 5. 公开用户裂变积分（需求2 = 公开用户的积分来源）

- 公开用户注册即得**邀请码/QR**。
- 被邀请人注册并达标 → **邀请人(公开用户) 得积分**：
  - 邀请骑手注册（含被邀人后续绑 99 ID 活跃）→ 用现有 `rider_invites_rider`(200) 口径。
  - **邀请 partner 注册并通过** → `rider_invites_partner`(500) 口径。
- 实现：扩展现有 `awardReferral` / partner 注册流程，支持「inviterType=user」并给 users 账户入账（现有积分账本直接支持）。
- 反欺诈：沿用 `pendingReleaseRules`（注：当前 `creditPoints` 即时 approved，**若要反欺诈持有窗口需另补 release 作业**——见系统审计 M1）。

---

## 6. 地图与注册地址（需求3/5 · 我定）

- **地图库：Leaflet + OpenStreetMap**（免费、无 API key、巴西覆盖足够）。
- **Partner 注册**：地图**拖拽落点**取 `lat/lng` + 文本 `address`（替换现在写死的圣保罗中心坐标）；可选 Nominatim 搜索辅助。
- **骑手服务地图**（升级现有首页 `PartnerMapSection` → 全屏 `/rider-app/map`）：两类点位分层 —— 🔧 partner 服务点（按 services 筛选、扫码/导航） vs 🏪 取货门店(Ponto)。
- **Partner 取货 10 店**：用 partner `lat/lng` 对所有 `pickupEnabled` Ponto 算直线距离(haversine)，取最近 10。

---

## 7. 权限与可见性

- 复用 `scopeFromRequest`（已支持 station/franchise）。
- mall 订单/分成 GET：HQ 全量；franchise → `order.franchise=本商`；station → `pickupStoreId=本门店`。只读。
- 履约动作（markArrived/markPickedUp）仍归站点（`manage_slots`）。
- 分成配置：产品级=HQ(`manage_points`)；站点分成比例=加盟商(新权限或 franchise 会话)。

---

## 8. 分期落地

**v1**：用户表/骑手表分离 + 公开用户注册/裂变积分 + 取货门店选择(四类规则)+ partner 就近10店 + 无库存T+1~3履约+站长提醒 + 两级分成「固定额、月度对账」+ 服务地图(Leaflet)+ partner 注册落点。
**v2**：站点级分成比例、分成自动打款、门店级库存（若需要）、按积分升级阈值表、地图导航深链。

---

## 9. 决策记录

**已确认**
- ✅ 加盟商分成 = 每产品**固定 R$**（`franchiseShareBRL`，HQ 商城后台设）。
- ✅ 站点分成 = **固定 R$**（`stationShareBRL`，加盟商设）；加盟商净得 `franchiseShareBRL − stationShareBRL`。
- ✅ **不动现有数据表**：复用 `riders` 集合，仅加「用户(会员)」菜单（含骑手）。
- ✅ **取货只能在 Ponto**（含 partner，走站点履约，不再发到 partner 自有店）。
- ✅ Partner 取货 = 服务点最近 **10 个 Ponto**（直线距离）。
- ✅ 无门店库存；T+1~3 到货；站长 markArrived 自动提醒取货。
- ✅ 地图 = Leaflet + OSM。

**剩余小项（我按默认，可随时改）**
- 裂变积分：沿用现有 200(邀骑手) / 500(邀 partner)。
- Partner 取货 10 店：不额外限同城（纯距离）。
- 公开用户注册入口：放商城 storefront（mall.meponto.com）。

---

## 10. 下一步

我据此出 **v1 逐文件改动清单 + 实现拆解**，分批提交。每批落地前（尤其动到加盟商后台分成、主后台「用户」菜单）按约定再跟你确认。建议开工顺序：

1. 取货门店选择（四类规则）+ 订单按门店 scope 可见 + 站点销售记录。
2. 两级固定额分成（产品/加盟商配置 + 计提 + 月度对账）。
3. 公开用户注册 + 裂变积分 + 「用户」菜单。
4. Partner 注册落点 + 就近 10 店 + 骑手服务地图(Leaflet)。
5. 无库存履约 + 站长提醒（含会员推送）。
