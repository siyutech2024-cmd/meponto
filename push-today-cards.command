#!/bin/bash
# 当日骑手数据:接单/拒单/取消/超时 改为真·当日累计("计数器不清零"方案)
#
# ── 背景(两轮诊断后的最终结论)
# 现象:「完单 984、接单 219」直觉矛盾。实测 129/130 骑手的 raw 都有计数字段,
# 不是抓取残缺;问题出在两个口径:
#   1) Eastwind 计数器**每班段清零**,旧算法只取"班段最后一批"的 raw ——
#      末批恰好没点到骑手卡片时,整个班段的计数被算丢,合计偏低
#   2) "接单"是平台的**派单邀约**口径:系统直派的单没有"接"动作,
#      接单 < 完单 本身正常,但必须向看板用户说明
#
# ── 方案(业务方拍板:不撤卡,要准)
#   · 计数在班段内单调递增 → **班段内取 MAX**(任何一批抓到都算数,
#     不再依赖末批),**跨班段相加** = 当日累计
#   · 四个计数从 raw 抽成真列:入库时抽(parseRiders),历史行由迁移回填
#     (21 万行,候选键与 extractRiderPerf 同一套,raw 顶层 + riderFeature 两层)
#   · 卡片保留七张;下方加一行三语口径说明(接单=邀约口径),
#     免得"接单<完单"再被当成 bug 报上来
#
# ── 执行顺序
#   1. 本脚本(推代码)
#   2. **db-migrate.command 立刻跑** —— 迁移加列并回填;没跑之前入库会报
#      "column accept_cnt does not exist"(和上次 account 列同一类空窗)
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add supabase/migrations/20260807150000_snapshot_perf_columns.sql \
        app/lib/eastwind.ts \
        app/api/eastwind/riders-today/route.ts \
        app/rider-monitor/today/page.tsx \
        app/lib/i18n.ts \
        push-today-cards.command
git commit -m "fix(today-board): make the accept/decline/cancel/overtime totals genuinely day-cumulative — Eastwind counters reset every shift slot and the old aggregation read only the slot's final batch, silently dropping any slot whose final batch missed the rider's detail card; counters are now real columns extracted at ingest (history backfilled from raw across both nesting levels), day totals are per-slot MAX summed across slots so any captured batch counts, and a tri-lingual note explains that accepted follows the platform's dispatch-offer basis where auto-assigned orders produce no accept event, which is why accepted can sit below finished"
git push origin main

echo
echo "==> 完成。接着跑 db-migrate.command(必须 —— 回填 21 万行历史 + 新列)"
echo
echo "==> 验收:"
echo "  1) 当日数据页四张卡仍在,下面多一行灰色口径说明(中/英/葡按语言切)"
echo "  2) 接单合计应明显高于旧值 219(旧算法丢班段;新口径任何一批抓到都算)"
echo "  3) 头部骑手行的接单若仍为 0 → 是真 0(全程系统直派),不是丢数据"
echo "  4) 完单 984 不变(它本来就是按班段末值相加,口径没动)"
