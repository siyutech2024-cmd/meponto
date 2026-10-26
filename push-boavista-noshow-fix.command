#!/bin/bash
# SJBV 不排班、全天运转(业务方 2026-10-26)—— 双击运行
#   · Boa Vista 菜单去掉「运力排班」
#   · Boa Vista 实时看板不再显示「应岗未上」(没有排班名册可比;之前误列了圣保罗站点)
#   · 圣保罗看板的「应岗未上」只比圣保罗自己的名册
# 只改页面,不改任何数据。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
echo "==> Web 预检"
npm run codex:preflight
git add app/rider-monitor/page.tsx app/components/ui.tsx app/lib/portals.ts push-boavista-noshow-fix.command
git rm -q --cached app/dispatch/boavista/page.tsx 2>/dev/null || true
git commit -m "feat(boavista): SJBV runs all day without shift scheduling — the Boa Vista menu drops 运力排班 and its live board drops the no-show panel (no roster to compare; it had listed São Paulo's EP001/Quality/CP001 riders as absent); the São Paulo board's no-show panel now compares against São Paulo's roster only

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成。2 分钟后强制刷新(⌘ + Shift + R)。"
