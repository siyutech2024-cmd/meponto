# PontoMall 闭环加固 + 合作方闭环 + 统一商城控制台

> 分支 `codex/partner-mall-points-ledger` → `main`,共 8 个提交。
> 本文件仅作 PR 描述的复制源,无需提交进仓库(可随后删除)。

## 概述 / Summary

闭合合作方的积分"赚→看→花"链路,加固 PontoMall 经济侧(结算模型、积分负债可见、版本化事件、后台可调兑换限额),并把商城后台(运营 + 供应商 + 合作方)收敛为**一个按角色路由的域**。底层仍是一套登录、一套 RBAC,数据按角色隔离。

## 改动分组 / Changes（按提交）

**1. 合作方闭环 `d6b92b0`**
- `/api/mall` GET 在 `me` 上下发只读积分账本切片(骑手 + 合作方)。
- 门面 `store`:新增"Extrato de pontos / 积分明细"抽屉,骑手与合作方共用。
- `partner-points`:积分余额卡 + "进入商城"入口,整页转葡语,表格用名称/葡语品类 label 替原始 ID。
- 供应商结算定为**代销**:补货单标注"不产生应付,实付以履约月对账为准"。
- `mall-insights` 新增 HQ"积分负债与兑付对账"面板。

**2. 事件 outbox `f6f5a6b`**
- 新增 `app/lib/server/events.ts`(append-only 内存 outbox)。
- redeem/cancel/arrive/pickup/reject 处发出 `marketplace.order.{created,arrived,fulfilled,cancelled,rejected}.v1`。
- GET 对 HQ 下发 `events`;`mall-insights` 事件流面板。补齐 AGENTS.md 硬规则 #6 / 积分经济标准 §9。

**3. 审计文档 `d736d87`** —— 闭环审计标记已修复项。

**4. 后台可调兑换限额 `b1080bd`**
- `MallConfig` 扩:日笔数 / 日积分 / 月积分 / 高价值审核门槛 / 新账号窗口 / 新账号上限。
- redeem **服务端强校验**(0=不限;日笔数 20、高价值 8000 维持原值;新增三项默认关,运营填值才生效)。
- `/mall` 设置页新增"兑换限额(全局风控)"输入。

**5. web-push 修复 `cfd389e` + `ae09c1a`**
- 补装 `web-push` 依赖并同步 lockfile(否则 `npm ci`/Vercel 构建会失败)。
- 把 web-push 做成可选构建依赖(`turbopackIgnore`):缺失时构建不挂、运行时优雅降级。

**6. 统一 GMV 折算 + G6/G7 `600a91d`**
- ops summary 新增 `gmvBRL = 现金 + 积分÷pointsToBrlRate`(单一口径);`mall-insights` 头条卡。
- G6 关闭;G7 确认 redeem 已强校验 `purchaseLimit`,审计标记关闭。

**7. 统一商城控制台 `61c6779`**
- `mall.meponto.com` 一个域服务 pontomall + supplier + partner 三 portal,按角色路由。
- 登录 API:同属"商城枢纽"的账号互通(运营/供应商/合作方共用 `mall.meponto.com/login`;骑手等非枢纽账号仍 403)。
- 旧子域 `partner./supplier..meponto.com/*` → 301 到 `mall.meponto.com/*`。
- `/admin` 按登录角色分流:运营→`/mall`、供应商→`/mall/supplier`、合作方→`/partner-points`。

## 护栏对照 / Guardrails（AGENTS.md）

- 账本:资金/积分/库存全部 append-only,新增的是只读派生读模型。✓
- RBAC:统一权限,未新起登录系统;枢纽放行**仅限**商城三角色。✓
- 三语:面向巴西用户的门面/合作方页用葡语,内部后台中文。✓
- 事件版本化:`*.v1`。✓
- 新能力默认关:三项新限额 default 0(不限)。✓

## ⚠️ 风险与必测 / Risk & required testing

本 PR 改动了**登录与路由(auth)**。**合并前在 Preview 部署上手测**:

1. `mall.meponto.com/` → 公开门面。
2. 登出态 `/admin` → 跳登录。
3. `mall@meponto.com / pontomall-demo` → 落 `/mall`。
4. `supplier@meponto.com / supplier-demo` 在 mall 登录 → 落 `/mall/supplier`。
5. `partner@meponto.com / partner-demo` → 落 `/partner-points`。
6. `partner./supplier..meponto.com/任意` → 跳 `mall.meponto.com/...`。
7. 骑手账号在 mall 登录 → **应 403**。
8. `sys/franchise/app` 等其他域行为不变。

外加:`npm run build` 绿、`npm run codex:preflight:full` 绿。经济/风控类改动建议过一遍 Finance/Risk。

## 回滚 / Rollback

- 统一控制台(auth/路由)集中在最后一个提交 `61c6779`(portals.ts / login route / proxy.ts / mall 页脚),可**单独 revert** 而不影响其余功能。
- web-push 可选化 `ae09c1a`、兑换限额 `b1080bd` 均可独立 revert。
- 其余为加法式只读读模型与文案,风险低。
