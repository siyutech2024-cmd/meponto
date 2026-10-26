#!/bin/bash
# 骑手详情字段:补组长账号详情卡的入班时间字段名 —— 双击运行(发布网站)
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
npm run codex:preflight
git add app/lib/eastwind.ts scraper/eastwind-rider-status.mjs push-boavista-details.command
git commit -m "fix(eastwind): per-rider detail for the station-level (leader-mode) board — the scraper spends its detail budget on delivering/online riders first instead of the first rows of a 300-rider all-day list, and the parser reads riderJoinScheduleDateTime; status classification verified against Eastwind's own workStatus codes (2 delivering, 4 online, 1 disconnected / below expectations)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成"
