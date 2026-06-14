# PontoMall 本轮变更清单与回归指引

> 2026-06-13 · 配套设计见 `mall-build-plan.md`
> 约束：本轮未改全站鉴权（按「已确认暂缓」），所有改动限于商城范围。
> 基线 commit：`33936f4`（mall 预付现金钱包）。`tsc --noEmit` 全程通过。

## 一、交付的功能（按特性）

1. **公开商城体验**：加载骨架屏（修「加载中误显示无商品」）、空态文案区分、核销码一键复制、
   骑手订单自助取消按钮。
2. **轻量风控**：风控骑手（`status==='Risk'`）拦截兑换；每骑手单日兑换上限（20/日）；
   高价值兑换审计升 `High`。
3. **兑换闭环**：`cancelOrder` —— 仅在途订单可取消，退积分(+refund 台账)、退现金(+refund 台账)、
   回补库存、push 通知，全程留痕。
4. **高价值人工审核**：≥8000 分兑换 hold（积分即扣、虚拟不发码、履约拦截）；`reviewOrder`
   批准(发码/放行)/拒绝(退分退现金回补+通知)；`/store` 显示「Em análise」，`/mall` 显示
   「待审核·高价值」+ 批准/拒绝按钮。
5. **Partner 兑换**：`session.organization → crmPartner.name` 只读映射（不动鉴权）；虚拟即时发码，
   实物直送门店 + partner 自助 `confirmReceipt`；前台 partner 模式、后台只读守卫；订单纳入 HQ 对账
   与供应商结算。
6. **看板增强**：ops 汇总加 `reviewPending/partnerOrders/partnerPointsSpent/topProducts`（office-only）；
   `/mall` 总览与 `/mall-insights` 呈现，高价值待审核可点击跳转。
7. **优惠券**：满减/折扣券、按等级发放、满减门槛、每人限用、过期；兑换自动选最优券抵扣；
   后台 CRUD + storefront 详情弹窗预览。

## 二、文件改动清单（8 改 + 2 新文档）

| 文件 | 改动 |
|---|---|
| `app/api/mall/route.ts` | redeem 加风控/高价值 hold/优惠券抵扣；新增 `cancelOrder`/`reviewOrder`/`confirmReceipt`/partner redeem 支路；GET 纳入 partner 订单与 partner `me`、骑手可用券；券助手函数 |
| `app/api/mall/ops/route.ts` | 汇总加 partner/审核/热销指标；新增 `addCoupon`/`updateCoupon`/`deleteCoupon`；GET 返回券 |
| `app/lib/mall-ops.ts` | 新增 `MallCoupon`/`MallCouponType` 类型 |
| `app/lib/points.ts` | `MarketplaceOrder` 加 `reviewStatus`/`couponId`/`couponDiscount` |
| `app/lib/server/memory.ts` | 注册 `mallCoupons` 持久化集合 |
| `app/mall/page.tsx` | 总览新指标卡 + 热销榜；订单 Tab 审核与 partner 守卫；券管理 UI |
| `app/mall-insights/page.tsx` | 同步新指标 + 热销榜 |
| `app/store/page.tsx` | 加载态/复制/取消/partner 模式/确认收货/券展示/状态用词 |
| `docs/modules/mall-build-plan.md`（新） | 方案与实施记录 |
| `docs/modules/mall-session-changelog.md`（新） | 本清单 |

## 三、新增 API 动作（`POST /api/mall` 与 `/api/mall/ops`）

- `/api/mall`：`cancelOrder`、`reviewOrder{decision}`、`confirmReceipt`、`redeem{accountType:"partner"}`。
- `/api/mall/ops`：`addCoupon`、`updateCoupon`、`deleteCoupon`。
- 权限：partner redeem/confirmReceipt → `manage_partner_services`；reviewOrder/券 CRUD → `manage_points`；
  cancelOrder/rider redeem → `use_rider_app`。

## 四、数据模型新增

- `MallCoupon`（新持久化集合 `mallCoupons`，通用键值库存储，无需改 SQL）。
- `MarketplaceOrder.reviewStatus | couponId | couponDiscount`。

## 五、已做的验证

- `tsc --noEmit`：每次改动后均通过。
- 离线状态机回归（27 项断言）：骑手普通/高价值 hold/审核批准·拒绝/取消、Partner 虚拟·实物+确认收货、
  供应商结算纳入、余额拦截。
- 优惠券逻辑回归（8 项断言）：等级门槛/满减门槛/多券取最优/每人限用/取消释放/过期/封顶不超价。

## 六、建议的本地端到端回归（沙箱时长所限未跑 live）

```bash
npm run check          # build → start → smoke（端到端，最权威）
# 或分步：
npm run build          # 确认生产构建 + lint 通过
npm run smoke          # 登录与门面冒烟
```

手动冒烟清单（`mall@meponto.com` / `partner@meponto.com` / 骑手）：
1. 后台建一张「满减券 -100、全员、门槛0」→ 骑手在 storefront 详情见「🎟️ −100」与抵扣后价 → 兑换成功，积分按抵扣后扣。
2. 给某商品定价 ≥8000 分 → 骑手兑换 → 订单「Em análise」、积分已扣、未发码 → 后台批准 → 发码/放行；或拒绝 → 退分回补。
3. 骑手在途订单点「取消」→ 积分/现金退回、库存+1。
4. partner 登录 → 兑换 partner 虚拟商品（即时码）与实物商品（直送门店）→ 点「确认收货」→ fulfilled。
5. 后台总览/`mall-insights` 看到合作方兑换数、高价值待审核数、热销 Top5。

## 六点五、注册简化 + Google 登录（同会话追加）

新增/改动文件：
- `app/rider-login/page.tsx`：表单精简（默认仅 名字/手机/密码/邮箱，其余折叠）；URL `?ref=&station=`
  邀请预填 + 横幅；新增「使用 Google 继续」按钮（GIS One Tap，凭 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 显隐）。
- `app/scan/page.tsx`：邀请码 `/scan?ref=` 未登录时新增「Criar minha conta」CTA → 跳预填注册页。
- `app/api/auth/google/route.ts`（新）：用 Google tokeninfo 验证 ID token → 查到登录/查不到建档 →
  发与密码登录同一 session cookie。无需 client secret。
- `app/api/auth/register/route.ts`：修 bug——账号状态 `"Active"`→`"active"`（之前大小写不匹配导致
  注册后登录失败）。
- `.env.example` / `.env.local`：加 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`。

已完成的外部配置（本会话用浏览器操作）：
- Google Cloud（项目 DESCU AI）已创建 OAuth Web 客户端「MePonto Rider」，授权来源
  `https://app.meponto.com` + `http://localhost:3000`。
- Client ID 已写入本地 `.env.local`，并在 Vercel 项目 `meponto` 添加 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
  （All Environments，非 sensitive）。
- **生产生效前提**：需先 push 含上述代码的提交触发 Vercel 部署（当前线上为旧代码）；
  Client secret 未使用、未保存。

## 六点六、验证记录（2026-06-13）

提交：`da8967b`（main，15 文件 +1318/−83，工作区干净）。

通过：
- 代码：`tsc --noEmit` 全清。
- 离线仿真：商城状态机 27 项断言、优惠券台账 8 项断言全过。
- Vercel：`NEXT_PUBLIC_GOOGLE_CLIENT_ID` 存在，All Environments，值与 Client ID 一致。
- Google OAuth 客户端「MePonto Rider」：Client ID 一致；JS 来源 `https://app.meponto.com` +
  `http://localhost:3000`；重定向 URI 空；状态 Enabled。
- 同意屏幕（Audience）：In production + External；仅用基础范围（openid/email/profile，非敏感），
  不受 100 用户上限限制、不弹「未验证应用」——公开骑手可正常登录。

未能在沙箱完成（需本地）：
- 运行时功能测试：沙箱 `node_modules` 的 Next SWC 为 macOS 二进制，平台不匹配，起不了 dev server。
  本地 `npm run dev` → `/rider-login` 点 Google 按钮验证（首次自动建档）。
- 推送：沙箱无 GitHub 网络（代理 403）。Mac 上 `git pull --rebase origin main` 后 `git push`；
  该次 Vercel 部署带上代码+变量，线上生效。

## 七、生产前提 / 留给后续

- **Partner 身份**：partner 用户 `organization` 须等于其 `crmPartners.name`（建账约定）；
  长期改为登录写入显式 `partnerId`（属鉴权阶段）。
- **鉴权改造**：`x-vento-role → session/JWT` 全站级，按「已确认暂缓」未动；
  storefront 订单服务端按身份收窄、partner 显式 id 等依赖它。
- **两阶段库存预留**：现模型已等价实现预留，建议迁事务型库存表后再做。
- **本地 git 与 GitHub 有分叉**：推送前先 `git pull --rebase`。
