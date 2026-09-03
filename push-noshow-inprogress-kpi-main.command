#!/bin/bash
# 监控页两处数据错误(用户 2026-09-03 截图反馈)
#
# ── 1. "应岗未上"把当天所有已锁班次都算进来
#   12:15 就把 14:00 班和 18:00 班的人全列成"应岗未上"(41 人)。改为只比对
#   **正在进行中**的班次(开班后 10 分钟宽限)。另外某个抓取源断供时,它覆盖的
#   骑手全部"不在看板上",整个名册被误报 —— 任一源超过 20 分钟无批次则隐藏
#   该面板(顶部"数据已过期"横幅已说明原因)。
# ── 2. KPI 条比率取错源
#   原规则"取完单多的源做比率"在主号刚开班/PRO 暂时领先时把 PRO 的 AR 当成
#   全城 AR(实测 91.9% = PRO 91.9%)。改为主号(SP)有读数就用主号的。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
echo "==> 预检"
npm run codex:preflight
echo "==> 提交并推送(仅本次相关文件)"
git add app/rider-monitor/page.tsx app/api/eastwind/riders-live/route.ts \
        scraper/scraper-watchdog.sh scraper/recover-vps.sh scraper/fix-and-protect.command \
        scraper/diag-full.sh scraper/check-all.command \
        push-noshow-inprogress-kpi-main.command
git commit -m "fix(rider-monitor): the rostered-but-not-online panel compared the live snapshot against EVERY locked shift of the day, so at 12:15 it listed the 14:00 and 18:00 riders as no-shows (41 people) — it now considers only shifts in progress (10-min grace after start) and hides itself while any scraper feed is stale, because a blind board would otherwise report its whole roster as absent; fix(live): headline KPI rates come from the main (SP) board whenever it has a reading instead of from whichever source finished more orders, which handed PRO's 91.9% AR to the citywide strip; ops(scraper): VPS-local watchdog cron restarts a feed silent for 15 min, recovery script clears leftover VNC/login processes, records OOM evidence and adds swap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UiRPyfnXq7EH3PVnK1BAtd"
git push origin main
echo "==> 完成。1-2 分钟后刷新 sys.meponto.com/rider-monitor"
