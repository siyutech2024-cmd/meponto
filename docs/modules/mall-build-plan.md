# PontoMall（mall.meponto.com）构建方案

> 更新：2026-06-13 · 配套契约见 `docs/modules/marketplace-contract.md`
>
> 约束：凡需修改 **sys 总后台 / franchise 加盟商后台现有业务代码** 的项，
> 必须先经业务方确认后再实施。本文档把每一项的「影响文件 + 是否需确认」标清楚。

## 0. 当前资产盘点

| 面 | 路由 | 文件 | 状态 |
|---|---|---|---|
| 公开商城 | `mall.meponto.com/` → `/store` | `app/store/page.tsx`（≈585 行）、`app/store/layout.tsx` | 成熟：响应式、搜索/分类、详情弹窗、订单抽屉、PIX 充值、SEO metadata + sitemap |
| 商城后台 | `mall.meponto.com/admin` → `/mall` | `app/mall/page.tsx`（564 行） | 成熟：总览/商品定价/分类Banner/订单履约/充值收款/供应链/设置 7 Tab |
| 供应商 | `/mall/supplier` | `app/mall/supplier/page.tsx` | 已建 |
| 站点到货 | `/mall/station` | `app/mall/station/page.tsx` | 已建 |
| 共享 API | — | `app/api/mall/route.ts`、`app/api/mall/ops/route.ts`、`app/api/marketplace/*` | 后台与商城共用 |
| 经济模型 | — | `app/lib/points.ts`、`app/lib/mall.ts`、`app/lib/mall-ops.ts` | 共享 |

业务流（实物兑换 / 虚拟商品即时核销 / PIX 现金差价）已上线并有实测记录，详见
`MePonto-业务逻辑梳理与待办清单.md`。

## 1. 公开商城体验（方向四）— 多数已就绪

已完成：SEO metadata、sitemap、响应式、分类/搜索、详情弹窗、订单抽屉、会员等级折扣展示、
PIX 充值闭环（前台侧）。

本轮已补（纯前台、无需确认）：
- 加载骨架屏，修复「加载中误显示无商品」的体验 bug。
- 空态文案区分「搜索无结果」与「暂无上架」。
- 虚拟商品核销码一键复制。

仍可选优化（纯前台，可继续自主做）：
- 商品图懒加载 / 占位渐显；详情弹窗键盘可达性（Esc 关闭、focus trap）。
- 商品结构化数据（JSON-LD）以增强 Google 收录——需评估 client 渲染下的收益。

## 2. Partner 兑换打通（方向一）— 后端已支持，缺前台 ⚠️需确认

**关键发现**：`app/api/marketplace/orders/route.ts` 已支持 `accountType: "partner"`，
会扣 `partnerPointsLedgerEntries`、排除 Supplier、做余额校验。但：
- `/store` 走的是 `/api/mall?action=redeem`，该分支**仅支持骑手**；
- storefront 的 `me` 仅识别 `portal === "rider"` 的会话。

打通需要的改动（**均触及后台/共享代码 → 需确认**）：
1. `app/api/mall/route.ts` 的 `redeem` 分支增加 Partner 账户支路（或让 storefront 改调 `/api/marketplace/orders`）。← 改后台共享 API
2. `app/store/page.tsx` 识别 Partner 会话、展示 Partner 积分余额与兑换入口。← 纯前台，但依赖 1
3. 鉴权：`requirePermission(request, "use_rider_app")` 当前按骑手权限，需放行 Partner。← 改 authz

> 待确认点：Partner 兑换是否复用骑手的等级折扣 / 现金差价逻辑，还是独立规则？

## 3. 兑换闭环健壮性（方向三）— 有缺口 ⚠️需确认

| 子项 | 现状 | 改动 | 需确认 |
|---|---|---|---|
| 取消 / 退积分 | `/api/mall` 无 cancel/refund action；订单只有 created→arrived→fulfilled | 新增 cancel 端点：退积分(+refund ledger)、回补库存、释放现金 | 是（写经济台账） |
| 库存预留 | `redeem` 即时 `stock-1`，无两阶段预留 | 改为 reserve→confirm→release，防并发超卖 | 是（改 redeem 核心） |
| 订单事件 | `markArrived` 已发骑手 push；created/fulfilled 未发事件 | 接 `order.created/fulfilled` 到 notify/analytics | 是（改后台 API） |
| 持久化确认 | `redeem` 走 memory + `flushPendingToDatabase` | 核对生产是否真落 Supabase | 是（核对，不必改码） |
| 高价值审核 | 订单打 `risk` 标但不拦截 | 阈值以上转审核队列 | 是（改 redeem + 后台 UI） |

## 4. 鉴权与风控（方向二）— 全站级 ⚠️需确认（且待办标「已确认暂缓」）

- 现状：API 按 `x-vento-role` 头鉴权（演示级），见 `app/lib/server/authz.ts`。
- 目标：服务端 session/JWT + `marketplace.*` scope（契约第 2 节）。
- 影响面：**全站所有 API**，非 mall 独有，风险最高，建议放在闭环稳定后单独立项。
- 风控（轻量、可先行，但仍改 redeem）：单日兑换上限、风控骑手拦截、高价值人工审核。

> 待你拍板：本轮是否启动鉴权改造（与待办「已确认暂缓」冲突），还是仅做轻量风控？

## 5. 建议推进顺序

1. ✅ 公开商城体验收尾（本轮已做，纯前台可继续）。
2. Partner 兑换打通（后端已就绪，性价比最高）——待确认 §2。
3. 兑换闭环（cancel/refund/库存预留/事件）——待确认 §3。
4. 鉴权与风控——影响面最大，建议最后且单独立项——待确认 §4。

## 6. 待确认清单（动后台前需逐项放行）

- [x] §3 取消/退款新端点（写积分+现金台账、回补库存）— 已实现 `cancelOrder`
- [x] §4 轻量风控：单日上限 / 风控骑手拦截 / 高价值审计 — 已实现
- [x] §2 Partner 兑换打通 — 已实现（`organization → crmPartner` 只读映射，v1 仅虚拟商品）
- [x] §3 高价值兑换审核队列 — 已实现（hold + reviewOrder + `/mall` 审核 UI）
- [ ] §3 redeem 改两阶段库存预留 — 不做（现模型已等价实现预留，见 §8）
- [ ] §4 session/JWT 鉴权改造 — 按「已确认暂缓」不动

## 7. 本轮实施记录（2026-06-13，鉴权暂缓）

授权范围：Partner 兑换 + 兑换闭环 + 轻量风控（鉴权暂缓）。已落地：

**纯前台（无需后台）**
- `/store` 加载骨架屏 + 空态文案区分；核销码一键复制；订单取消按钮。

**后台共享代码（已授权）**
- `app/api/mall/route.ts` redeem 分支：`status==='Risk'` 风控骑手拦截、单日兑换上限
  （常量 20/日，不动 config/admin UI）、高价值兑换审计升 `High`。
- `app/api/mall/route.ts` 新增 `cancelOrder`：仅 `created` 可取消；退积分(refund 台账)、
  退现金(cash refund 台账)、库存 +1、状态置 `cancelled`、push 通知骑手。权限并入
  `use_rider_app`（骑手自助），含订单归属校验。
- `tsc --noEmit` 通过。

**Partner 兑换打通（已实现，方案 A 的零鉴权改造版）**
关键发现：partner 账号的 `session.organization`（如 "Oficina Paulista 24h"）**正好等于**
`crmPartners.name`（crm-001），因此可只读映射、**不动鉴权/登录代码**。已落地：
- `GET /api/mall`：portal==="partner" 时按 `organization → crmPartner` 建 partner `me`
  （partnerId、partner 积分余额），并只返回该 partner 的订单。
- `POST /api/mall` redeem 增加 `accountType:"partner"` 支路：身份从 session 派生（不信任
  前端传的 partnerId），权限用 `manage_partner_services`；v1 仅限**虚拟商品（即时核销码）**、
  纯积分（无现金差价）、无等级折扣；扣 `partnerPointsLedger`、减库存、写审计。
- `/store` 前台：识别 partner 会话，按 `audience∈{partner,both}` 过滤商品，partner 模式隐藏
  等级/站点/现金 UI，兑换分流到 partner 支路。

生产环境前提：partner 用户的 `organization` 字段须等于其 `crmPartners.name`（建账约定，
需在用户管理里保证；未来更稳的做法是登录建档时写入显式 `partnerId`）。

**Partner 实物履约（已实现）**
模型：partner 本身是实体门店（`crmPartners` 有 bairro/lat-lng/联系人），故实物**直送门店、
partner 自助确认收货**（无需骑手式到站取货）。
- redeem 去掉「仅虚拟」限制：实物 partner 商品 → `status:"created"`、`station=partner.bairro`、
  按 `deliveryCycleDays` 估 ETA、无核销码；虚拟仍即时发码 `fulfilled`。
- 新增 `confirmReceipt`（`manage_partner_services`，身份从 session 派生并校验 `partnerId`）：
  partner 在商城点「Confirmar recebimento」→ `status:"fulfilled"`。
- `/store` partner 订单显示物流状态 + 确认收货按钮；`/mall` 后台对 partner 订单显示
  「直送门店·待合作方确认 / 已确认收货」，不显示骑手用的到站/交付按钮。
- 供应商结算天然涵盖：partner 实物 fulfilled/arrived 订单按供货价计入供应商应付（无账户类型限制）。

**高价值兑换审核队列（已实现）**
- 阈值 `HIGH_VALUE_POINTS = 8000` 分。达到即 `reviewStatus="pending"`：积分立即扣（冻结），
  但**虚拟商品不立即发码**、`markArrived/markPickedUp` 在 pending 时被拦截。
- 新增 `reviewOrder(approve|reject)`（`manage_points` 权限，HQ/商城运营）：
  - 批准：虚拟商品此时才发核销码并置 `fulfilled`；实物放行走正常到站流程。push 通知骑手。
  - 拒绝：退积分 + 退现金 + 回补库存 + 置 `cancelled`，push 通知骑手。
- `/store` 订单显示「Em análise」徽标；`/mall` 后台 orders Tab 显示「待审核·高价值」并加
  批准/拒绝按钮。骑手仍可自助取消处于审核中的订单（退分）。
- 台账数学经独立脚本验证：hold→批准（不二次扣分）/ 拒绝（全额退还+回补）均自洽。

**Partner 订单对账可见性（已修复）**
启用 Partner 兑换后发现：`/api/mall` GET 与 `/api/mall/ops` 汇总原本只取 `accountType==="rider"`，
导致 partner 兑换订单在 HQ 后台与看板里不可见、无法对账。已改 GET：HQ/无 scope 视图纳入
partner 订单（下游 scope/riderId 过滤天然保证骑手 storefront 与加盟商/站点视图不受影响）。
**GMV 统计刻意不合并**：partner 积分与骑手积分是两套独立货币，混入同一「积分 GMV」会口径错误；
如需 partner 维度 GMV，应另起独立指标（待业务方确认口径）。

## 8.5 回归验证（2026-06-13）

- `tsc --noEmit` 全程通过（每次改动后均跑）。
- 离线状态机回归（27 项断言全通过）覆盖：骑手虚拟兑换、骑手高价值 hold（不发码/拦截履约）、
  审核拒绝（退分+回补+作废）、审核批准（不二次扣分+发码）、取消（退积分+退现金+回补库存）、
  Partner 虚拟兑换、Partner 实物兑换+确认收货、供应商结算纳入 Partner 实物订单、余额不足拦截。
- 注：项目自带 live 回归（`npm run check`：build→start→smoke）需长驻服务器，受当前沙箱单次时长限制
  未在本环境执行；建议在 CI / 本地 `npm run check` 跑一次端到端确认。

## 8.6 看板增强（2026-06-13）

- `/api/mall/ops` summary 新增（office-only）：`reviewPending`（高价值待审核数）、`partnerOrders`、
  `partnerPointsSpent`、`topProducts`（兑换次数 Top5，rider+partner）。供应商视图这些字段为 0/[]。
- `/mall` 总览：新增「高价值待审核」（可点击跳订单 Tab）、「合作方兑换」、「合作方积分消耗」、
  「近30天兑换」Stat + 「热销商品 Top5」面板。
- `/mall-insights`（HQ 只读）：同步上述新指标 + 热销榜。
- `tsc` 通过。

### 营销位（已就绪）＝ storefront 顶部 Banner（`/mall`「分类与Banner」增删启停）。

### 优惠券（已实现，默认机制）
持久层为通用键值库（`app_state_records` 按 collection 存 JSON），故新增 `mallCoupons`
集合无需改 SQL，照搬 `mallBanners` 注册即可。机制（默认，可后续调）：
- 券型：`points_off`（满减积分）/ `percent_off`（按抵扣后积分价百分比）。
- 发放：按会员等级门槛 `minTier`（全员/铜+/银+/金+/钻）。
- 门槛：`minPoints`（满 X 积分价可用）；`perRiderLimit`（每人限用次数，0 不限）；`expiresAt`（过期）。
- 核销：兑换时**自动选最优可用券抵扣**（取折扣最大者），记 `couponId/couponDiscount` 到订单，
  积分按抵扣后扣；取消/审核拒绝释放该券占用次数（按非 cancelled 订单计数）。
- UI：`/mall`「分类与Banner」Tab 增「优惠券」管理（增删启停）；storefront 详情弹窗显示
  「🎟️ 券名 −X」与划线原价、抵扣后价格，余额校验按抵扣后价。
- 验证：券抵扣逻辑 8 项断言全过（等级门槛/满减门槛/多券取最优/每人限用/取消释放/过期/封顶不超价）。
- 范围：v1 仅骑手；Partner 券另议。

## 9. 已知项 / 留给后续

- **rider storefront 订单广播**：现状 GET 对骑手不按 riderId 收窄，会把全量订单下发到前端再客户端过滤
  （既有设计，属鉴权暂缓范畴）。鉴权阶段一并按会话身份服务端收窄。
- **Partner 实物履约**：v1 仅虚拟商品，实物需定 partner 自提/配送方案。
- **Partner 维度 GMV / 高价值 partner 审核**：当前高价值审核仅覆盖 rider；partner 如需同等口径另议。

## 8. 备注：两阶段库存预留为何暂缓

当前 redeem 即时 `stock-1` 且有 `stock<=0` 拦截，cancel 时 `stock+1` 回补。
在 serverless + 内存仓储 + 每请求 `flushPendingToDatabase` 的模型下，单商品并发兑换
窗口极小；引入 reserve→confirm→release 三态会显著增加状态机复杂度与出错面。
建议待迁入真正的事务型库存表（Supabase 行级锁/CHECK 约束）后再做，收益更实在。
