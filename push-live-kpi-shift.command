#!/bin/bash
# 实时页 KPI 条:改为「当前班次」口径(业务方 2026-08-07 定)
#
# ── 口径分工(最终版)
#   实时骑手看板  → KPI = **当前班段**(11/14/18 切班)的读数,"现在"的状态
#   当日数据页    → 全天累计(班段内 MAX、跨班段相加)
# 之前把实时页也改成了当日累计 —— 业务方看后拍板:实时面板就该显示当前班次。
#
# ── 保留今天修掉的体验问题
# 不是简单回退到"取最新一批":换班后头几分钟 Eastwind 面板是空的,抓到的
# 批次全 0/NULL(实测 18:20 批),直接显示像看板坏了。现在:
#   1. 按"计数明显回落"自动定位当前班段起点(不依赖排班时刻,改班表也不怕)
#   2. 取当前班段内**最新一个有读数**的批次
#   3. 班段刚开始、确实还没有读数时,如实显示 0 —— 那是真实状态
# 右下角口径说明改为「全城·当前班次」(三语)。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/eastwind/riders-live/route.ts app/lib/i18n.ts push-live-kpi-shift.command
git commit -m "fix(realtime): the KPI strip shows the current shift, not the day total — a live board answers 'how is it going right now', and the day-cumulative view already lives on the today page; the changeover fix is kept by locating the current slot via counter fallback and reading its latest batch that actually carries values, so the minutes-long blank window after 11/14/18h no longer renders as a dead board while a genuinely fresh shift honestly shows zero"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  · 实时页 KPI 条应显示当前班段数值(现在 18-22 班段,完单应为几百而非 1634)"
echo "  · 右下角口径:「KPI 为全城·当前班次」"
echo "  · 明天 11:00/14:00/18:00 换班后:KPI 短暂显示 0 或低值(真实的新班段起步),"
echo "    但不会出现 AR「—」满屏的死板状态"
