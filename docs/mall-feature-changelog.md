# 提交清单 — 取货门店 + 两级销售分成 + 公开用户 + 服务地图

> 一次性新功能。自检：`tsc` 全绿、`module:guard` 通过。`next build` 需在本机跑（沙箱缺 SWC）。

## 数据模型（lib）
- **app/lib/data.ts** — `Ponto` 加 `pickupEnabled?`（是否可作取货点）。
- **app/lib/network.ts** — `Franchise` 加 `stationShareBRL?`（站点分成固定额）。
- **app/lib/points.ts** — `MarketplaceProduct` 加 `franchiseShareBRL?`（加盟商分成）；`MarketplaceOrder` 加 `pickupStoreId/pickupStoreName`。
- **app/lib/mall-ops.ts** — 新增 `RevenueShareEntry` / `RevenueShareStatement` 类型 + 状态标签。
- **app/lib/server/memory.ts** — 注册两个 collection：`mallRevenueShareEntries`、`revenueShareStatements`。

## 后端 API
- **app/api/mall/route.ts**
  - 取货门店规则 `pickupCandidatesForRider/forPartner` + `haversineKm`（partner 取最近 10 Ponto）。
  - `redeem` 两分支接 `pickupStoreId`，订单写 `pickupStore` + `franchise=取货门店加盟商`。
  - `accrueRevenueShare()`：取货完成（markPickedUp / 合作商 confirmReceipt）计提分成账。
  - `priceProduct` 接 `franchiseShareBRL`；GET 返回 `pickupStores`。
- **app/api/mall/ops/route.ts** — 新增 `setStationShare` / `generateRevShareStatement` / `confirmRevShareStatement` / `payRevShareStatement`；GET 对加盟商/站点开放只读分成视图；office 返回分成数据。
- **app/api/register/route.ts**（新）— 公开会员注册（无 99ID=会员一级）+ 裂变积分入账。
- **app/api/service-map/route.ts**（新）— 服务地图数据：partner 服务点 + Ponto 取货点（两层分明）。
- **app/api/partner-register/route.ts** — 写入真实 `lat/lng`（替换写死坐标）。

## 前端页面
- **app/store/page.tsx** — 商品详情「取货门店」选择器；redeem 带 `pickupStoreId`；登出态加「Criar conta」入口。
- **app/rider-app/mall/page.tsx** — redeem 自动带门店。
- **app/mall/page.tsx** — 定价表加「加盟商分成 R$」输入；新增「销售分成·月度对账」面板（生成 + 标记付款）。
- **app/wallet/page.tsx** — 加盟商「销售分成」区：设站点分成 + 确认月度对账单。
- **app/partner-register/page.tsx** — 地理定位采集（按钮 + lat/lng 输入）。
- **app/register/page.tsx**（新）— 公开注册页 + 邀请链接。
- **app/members/page.tsx**（新）— 「用户/会员」后台菜单（含骑手筛选；复用 riders 不动表）。
- **app/rider-app/map/page.tsx**（新）— Leaflet 服务地图（🔧 服务点 / 🏪 取货点 双层）。
- **app/components/ui.tsx** — 导航加「用户/会员」入口。
- **app/lib/i18n.ts** — `navMembers` 三语。
- **proxy.ts** — `/register` 加入 publicPaths；app 加 `map` section。

## 文档
- **docs/mall-pickup-store-revshare-map-plan.md** — 方案 v2。
- **docs/system-business-loop-audit.md** — 业务闭环审计报告。
- **docs/mall-feature-changelog.md** — 本清单。

---

## 补充批次（缺口修复 — 公开用户登录 / 地图选点 / 站内信）

> 修复自查发现的 3 个缺口。当前未提交文件：见 `git status`。

- **app/api/member-login/route.ts**（新）— 公开会员**手机号登录**（签发会话），让注册后的公开用户能回来用积分兑换。
- **app/register/page.tsx** — 加「Criar conta / Entrar」双模式（注册 + 手机登录）。
- **app/partner-register/page.tsx** — 升级为 **Leaflet 交互地图选点**（点/拖拽落点 + 定位按钮），替换手动填坐标。
- **站内信（in-app message）系统**（替代 WhatsApp）：
  - **app/lib/mall-ops.ts** — 新增 `MemberMessage` 类型。
  - **app/lib/server/memory.ts** — 注册 `memberMessages` collection。
  - **app/api/mall/route.ts** — `markArrived` 生成到货站内信；GET `me.messages`/未读数；新增 `markMessagesRead`；并把 `franchises/pontos/mallRevenueShareEntries/memberMessages` 补进 `COLLECTIONS` 刷新列表（分成计提正确性修正）。
  - **app/store/page.tsx** + **app/rider-app/mall/page.tsx** — 顶部「📬 Mensagens」未读横幅 + 「Marcar lidas」；兑换带 `pickupStoreId`。
- **app/mall/station/page.tsx** — 撤掉 WhatsApp 按钮（净回退）。

---

提交（一次性）：
```bash
cd ~/Documents/MePonto && npm run build
git add app/ proxy.ts docs/
git commit -m "feat(mall): pickup-store rules + two-level revenue share + public members + service map + in-app messages"
git push
```
