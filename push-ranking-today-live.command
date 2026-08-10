#!/bin/bash
# 排行榜日榜:改当日实时,每 30 分钟更新(业务方 2026-08-10 定)
#
# ── 口径切换的前提(为什么现在能用快照排名了)
# 8/7 弃用快照做榜单,是因为旧聚合只取"最新一批" —— Eastwind 计数器
# 每班段清零,前面班段整段丢掉,只剩确认值 ~40% 且名次会反。
# "计数器不清零"方案(班段 MAX、跨班段相加,3 分钟抓取)修的正是这件事,
# 当日数据页已在用同一算法。日榜复用它,周榜**不动**(仍 T+1 确认报表,
# 与结算同源 —— 骑手拿周榜对工资仍然对得上)。
#
# ── 实现
#   · RPC rider_today_orders():库内聚合当日 (骑手,班段) MAX 相加,
#     两源并集(骑手集不相交,PRO 自动上榜)
#   · 接口:日榜优先当日实时,**30 分钟缓存 = 更新节奏**;
#     当天没数据(清晨/异常)自动回退 T+1 最新一天,行为与旧版一致
#   · 页面:tab 文案 Último dia → Hoje(实时时),副标题
#     「Hoje · atualiza a cada 30 min」;底部口径声明改写 ——
#     今天是实时部分数据,最终以明日确认报表为准(防止拿榜单质疑工资)
#
# ═══ 执行顺序 ═══
#  1. 本脚本(推代码)
#  2. **db-migrate.command 立刻跑**(建 RPC;没跑之前日榜自动回退 T+1,
#     不会坏,但也不会显示今天)
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add supabase/migrations/20260810150000_rider_today_orders_rpc.sql \
        app/api/rider/leaderboard/route.ts \
        app/rider-app/ranking/page.tsx \
        push-ranking-today-live.command
git commit -m "feat(leaderboard): the daily board goes live — today's ranking now comes from realtime snapshots aggregated in-database as per-slot maxima summed across slots (the same counter-reset-proof algorithm the today board already trusts, which is what invalidated the original reason for keeping snapshots off the leaderboard), refreshed on a 30-minute cache with both scraper sources unioned so pro riders rank alongside, falling back to the latest confirmed T+1 day whenever today has no data yet; the tab renames to Hoje with an updates-every-30-minutes subtitle and the methodology note now says today is partial and settles in tomorrow's confirmed report, because the weekly board stays on the settlement-grade source and the two must not be confused"
git push origin main

echo
echo "==> 完成。接着跑 db-migrate.command(建 RPC)"
echo
echo "==> 验收(部署 + 迁移后打开 app.meponto.com/ranking):"
echo "  1) 日榜 tab 显示「Hoje」,副标题「Hoje · atualiza a cada 30 min」"
echo "  2) 榜单数字应接近当日数据页的完单列(同一算法)"
echo "  3) PRO 骑手带金标混排在内"
echo "  4) 周榜不变(T+1,08-04 ~ 08-10 或当前周窗口)"
echo "  5) 底部口径声明:今天=实时部分数据,明日报表定稿"
