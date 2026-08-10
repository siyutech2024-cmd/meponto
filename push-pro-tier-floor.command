#!/bin/bash
# 会员等级:PRO 骑手保底 Ouro(三级)(业务方 2026-08-10 定,"其他规则不变")
#
# ── 规则
# PRO 骑手的会员卡等级**保底 Ouro**(Bronze=一级 / Prata=二级 / Ouro=三级):
#   · 积分赚取 +10%、兑换 95 折、生日 100 分 —— Ouro 的全部权益即时生效
#   · **只保底不封顶**:窗口内积分赚够 15000 仍照常升 Diamante
#   · 普通骑手完全不受影响;积分账本、赚取、过期、衰减规则一概未动
#   · 保底跟着 pool 走:骑手入池(含入库自动标记)即生效,退池即回落到
#     按积分算出的真实档 —— 无需任何人工操作
#
# ── 实现
# resolveRiderTierStatus 加可选参数 floorTier(收"保底档"而非布尔,
# 规则再变只改调用方)。四个消费点全部接上,确保**同一档贯穿到底**:
#   · /api/rider/home  —— APP 会员卡展示
#   · /api/mall(storefront)—— 商城 me.tierStatus
#   · /api/mall(redeem)—— 兑换定价(不能一边显示金卡一边按原价扣分)
#   · /api/performance(creditOrderPoints)—— 每单积分的等级加成
#
# ── 配套:后台「用户/会员」统一表(sys.meponto.com/members,用户截图指出)
# 该表有自己的级别口径:无 99 ID=一级,骑手=二级 —— PRO 还挂在二级。
# 同步:PRO 骑手显示金色「会员三级 · PRO 骑手」徽章(表格+详情抽屉),
# 顶部加 PRO(三级)统计卡,筛选加「PRO 骑手」chip,眉题口径更新。
# PontoMall 后台的会员 tab 复用同一组件,自动同步。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/lib/mall.ts \
        app/api/rider/home/route.ts \
        app/api/mall/route.ts \
        app/api/performance/route.ts \
        app/members/members-panel.tsx \
        app/members/page.tsx \
        push-pro-tier-floor.command
git commit -m "feat(mall): PRO riders get a tier floor of Ouro — the membership resolver takes an optional floor tier that lifts the earned-points result but never caps it, so a pro rider starts with gold benefits (plus-10-percent accrual, 95-percent redemption pricing, birthday points) the moment the pool flag lands while Diamante stays reachable the normal way, and all four consumers (rider-app card, mall storefront, redemption pricing, and the per-order accrual multiplier) share the lifted tier because showing a gold card while charging bronze prices would be worse than no floor at all; the floor follows the pool field, so ingest auto-tagging grants it and leaving the pool reverts it with no manual step; feat(members): the unified member table speaks the same rule — pro riders wear a gold third-level badge in the list and the detail drawer instead of sitting at level two, with a PRO stat card, a pool filter chip, and the header legend updated, and the PontoMall back-office members tab inherits it all by sharing the component"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  1) 任一 PRO 骑手登录 APP:会员卡显示 Ouro,权益列表为金卡三条"
echo "  2) 商城兑换:PRO 骑手价格 = 原价 95 折(与卡面一致)"
echo "  3) 明日日报导入记分:PRO 骑手每单积分带 +10% 加成"
echo "  4) 积分已超 15000 的 PRO(如有):显示 Diamante 不被压回 Ouro"
echo "  5) 普通骑手一切照旧"
echo "  6) sys.meponto.com/members:ARIEL 等 PRO 骑手显示金色「会员三级 · PRO 骑手」,"
echo "     顶部有 PRO(三级)计数卡,筛选多一个「PRO 骑手」chip"
