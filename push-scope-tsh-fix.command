#!/bin/bash
# 加盟商/站点 TSH 口径修正:未上线时长计入(业务方 2026-08-10 指出)
#
# ── 旧算法的两个偏差
#   1. 只平均"有 TSH 读数"的骑手 —— 未上线的骑手没有读数,被整个排除:
#      旷工不拉低团队 TSH,数字系统性虚高
#   2. 按在线分钟加权 —— 在线越久权重越大,进一步高估
#
# ── 新口径
#   排了班就计入:未上线骑手按 TSH=0 参与;
#   权重 = **班段已过时长**(圣保罗时钟)——
#     同班段人人权重相等;跨班段(3h/4h)长短公平;
#     班段还没开始的权重为 0,不提前扣分。
#   在线但读数缺失(抽取失败)的仍跳过,不把技术缺数算成旷工。
#
# 影响范围:实时页加盟商/站点视角的 scope KPI 及其 PRO 副值
# (同一聚合函数,自动同口径)。总部城市 KPI 条走 Eastwind 官方读数,不动;
# T+1 考核看板走确认报表,也不动。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/eastwind/riders-live/route.ts push-scope-tsh-fix.command
git commit -m "fix(monitor): franchise and station TSH now counts the riders who never showed up — the old aggregate averaged only riders that carried a TSH reading and weighted them by online minutes, so a no-show vanished from the metric entirely and the team number was systematically inflated by exactly the people it should have been flagging; scheduled riders now enter the mean with zero when not online, the weight is the elapsed minutes of the slot on the São Paulo clock so slots that have not started contribute nothing and 3h and 4h slots compare fairly, and riders who are online but missing a reading stay excluded because an extraction gap is not absenteeism; the PRO sub-value shares the aggregate and corrects with it"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  1) 加盟商账号登录实时页:%TSH 应明显低于之前"
echo "     (未上线的人现在按 0 计入 —— 数字变难看是修对了的标志)"
echo "  2) 未上线骑手多的加盟商降得更多;全员在线的几乎不变"
echo "  3) PRO 副值同口径同步变化"
echo "  4) 总部城市 KPI 条(Eastwind 官方读数)不受影响"
