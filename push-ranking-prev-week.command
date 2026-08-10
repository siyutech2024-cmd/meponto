#!/bin/bash
# 排行榜:周一空榜 → 自动回退显示上周(用户 2026-08-10 周一实测发现)
#
# ── 现象
# 周一打开 app.meponto.com/ranking 显示"Ainda sem dados"空榜。
#
# ── 根因(设计漏洞,不是故障)
# 排行榜按自然周(周一→周日)查 T+1 报表。T+1 天然滞后一天:
#   · 周一当天,本周(今天开始)还没有任何报表
#   · 连周日的数据都属于**上一周**的窗口
# 所以每周一整天(直到周二导入周一的报表)本周窗口必然为空 ——
# 当初定"周一零点清零"时漏掉了这个场景。
#
# ── 修法
# 本周窗口查出来为空时,自动回退查上一周,显示上周完整榜。
# 页面本来就把 from–to 日期区间显示出来,骑手看得出是上周,不会误导。
# 本周第一笔数据一进来(周二导入周一报表),缓存过期后自动切回本周。
# 缓存结构带上实际使用的窗口,避免回退周与本周数据串味。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/rider/leaderboard/route.ts push-ranking-prev-week.command
git commit -m "fix(leaderboard): fall back to last week when the current week is empty — the board follows the natural Monday week over T+1 reports, which lag a day, so every Monday (until Tuesday's import lands) the current window is necessarily empty and even Sunday's numbers belong to the previous week; an empty board reads as broken, so the route now retries the previous window, the page already displays the from–to range so nobody is misled, and the cache carries the window it actually served so the switch back happens on its own once this week's first import arrives"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后打开 app.meponto.com/ranking:"
echo "  · 周榜应显示上周(08-03 ~ 08-09)完整排名"
echo "  · 日榜应显示上周最新一天(08-09 周日,如已导入;否则 08-08)"
echo "  · 明天(周二)导入今天的报表后,自动切回本周窗口"
