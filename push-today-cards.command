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
# ── 追加(用户实测 18:20 批次):实时页 KPI 条整条归零
# 18:00 换班段,Eastwind 城市计数器全部清零:17:55 还是 348 接单/306 完单,
# 18:00 直接 17/0,18:20 批恰好全 0/NULL。实时页原来只取"最新一批",
# 等于把换班归零原样端给用户 —— 每天 11/14/18 点各出现一次"看板坏了"。
# 修法:城市 KPI 同样改当日累计(班段内 MAX、跨班段相加;班段切分按
# "计数明显回落"判定,不依赖排班时刻)。比率(AR/%TSH/CAA/超时)取当日
# 最后一个有值批次 —— 比率不能相加,平台的班段内读数本身是对的。
# 右下角口径说明改为「全城·当日累计(比率为最新读数)」,三语。
# ── 追加②:抓取间隔 5 分钟 → 3 分钟(业务方要求)
# 代码侧必须先改**批次对齐粒度**:原来批次时间向下取整到 5 分钟(幂等用),
# 3 分钟抓取时 18:00 和 18:03 两轮会撞进同一个 18:00 批次,入库是先删后插,
# **前一轮整批被抹掉**。已改为对齐到 1 分钟(alignTo5Min → alignToMinute),
# 任何 ≥1 分钟的间隔都不冲突,幂等语义不变。前端"每 5 分钟更新"文案改 3(三语);
# 页面自刷新本来就是 60 秒一次,不用动。
#
# ⚠️ 服务端这半边推完后,**VPS 那半边要你自己改**(SSH,两个实例都要):
#     cd ~/scraper && echo "INTERVAL_MIN=3" >> .env   # 已有该行则直接改值
#     pm2 restart eastwind-scraper
#     (PRO 实例同理:它自己的目录 + pm2 名称)
#   顺序:**先跑本脚本等部署完,再改 VPS** —— 反过来的话 3 分钟批次会互相覆盖。
#
# 代价心里有数:数据量 +67%(每天约 7 千行 → 1.2 万行);逐卡点击每轮 1-2 分钟,
# 3 分钟间隔偶尔跑不完时脚本自带防重入(pulling 标志),那一轮自动跳过,
# 实际变成 6 分钟一次,无害。对 Eastwind 的访问频率提高,风控暴露略增。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add supabase/migrations/20260807150000_snapshot_perf_columns.sql \
        app/api/eastwind/riders-live/route.ts \
        app/lib/eastwind.ts \
        app/api/eastwind/rider-status/route.ts \
        app/api/eastwind/riders-today/route.ts \
        app/rider-monitor/today/page.tsx \
        app/lib/i18n.ts \
        push-today-cards.command
git commit -m "fix(realtime+today): day-cumulative counters everywhere — Eastwind resets every counter at each shift slot (11/14/18h), so the live board's city KPI strip went to zero and NULL for minutes after every changeover (348 accepted at 17:55, 17 at 18:00) because it displayed the latest batch verbatim; the strip now rebuilds the day as per-slot max summed across slots with slot boundaries detected by counter fallback rather than schedule times, rates come from the last batch that carried a reading, and the caption says day-cumulative; fix(today-board): make the accept/decline/cancel/overtime totals genuinely day-cumulative — Eastwind counters reset every shift slot and the old aggregation read only the slot's final batch, silently dropping any slot whose final batch missed the rider's detail card; counters are now real columns extracted at ingest (history backfilled from raw across both nesting levels), day totals are per-slot MAX summed across slots so any captured batch counts, and a tri-lingual note explains that accepted follows the platform's dispatch-offer basis where auto-assigned orders produce no accept event, which is why accepted can sit below finished; feat(scraper): batch alignment drops from 5 minutes to 1 so the interval can shrink to 3 minutes — with 5-minute flooring two 3-minute rounds landed in the same batch key and delete-then-insert wiped the earlier one"
git push origin main

echo
echo "==> 完成。接着跑 db-migrate.command(必须 —— 回填 21 万行历史 + 新列)"
echo
echo "==> 验收:"
echo "  1) 当日数据页四张卡仍在,下面多一行灰色口径说明(中/英/葡按语言切)"
echo "  2) 接单合计应明显高于旧值 219(旧算法丢班段;新口径任何一批抓到都算)"
echo "  3) 头部骑手行的接单若仍为 0 → 是真 0(全程系统直派),不是丢数据"
echo "  4) 完单 984 不变(它本来就是按班段末值相加,口径没动)"
echo "  5) 【实时页】KPI 条在 18:00/11:00/14:00 换班后**不再归零** ——"
echo "     完单/接单显示当日累计,右下角口径变为「全城·当日累计」"
echo
echo "==> 最后一步(SSH 到 VPS,部署完成后再做):"
echo "    cd ~/scraper && sed -i 's/^INTERVAL_MIN=.*/INTERVAL_MIN=3/' .env \\"
echo "      || echo 'INTERVAL_MIN=3' >> .env"
echo "    pm2 restart eastwind-scraper"
echo "    验证:pm2 logs eastwind-scraper 里 interval 应显示 3;"
echo "    实时页「批次」时间应开始出现 :03 :06 这类非 5 倍数分钟"
