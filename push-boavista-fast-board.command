#!/bin/bash
# 实时看板:先出在线/配送中,再慢慢加载其余;修「配送中」一直是 0 —— 双击运行
#   · 看板分两步加载:第一步只拉轻量数据(不带每个骑手的详情),状态卡、KPI、地图 1 秒左右就出来;
#     第二步在后台拉完整数据,骑手详情抽屉随后补上。圣保罗看板同样受益。
#   · 「配送中」:Boa Vista 不排班,送单中的骑手状态是 "Entregas fora do agendamento",
#     之前被 "fora"(班次外)规则抢先归成了"不在区域内",现在送单状态优先,归"配送中"。
# 只改页面读取方式与状态分类,不改任何数据。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
echo "==> Web 预检"
npm run codex:preflight
git add app/api/eastwind/riders-live/route.ts app/rider-monitor/page.tsx push-boavista-fast-board.command
git commit -m "perf(rider-monitor): two-phase board load — a light riders-live payload (no raw per-rider detail, the bulk of an 8 s / 137 KB response for Boa Vista's ~240 riders) paints the status cards, KPI strip and map first, the full payload follows in the background for the detail drawer; fix(rider-monitor): 'Entregas fora do agendamento' is a rider on a delivery, not one outside the area — Boa Vista runs unscheduled so the delivering card had read 0 all day

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成。2 分钟后强制刷新(⌘ + Shift + R)。"
