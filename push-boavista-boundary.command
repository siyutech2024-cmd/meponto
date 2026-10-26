#!/bin/bash
# Boa Vista 边界改为 Eastwind 原始区域(hotArea,areaID 242071373948)—— 双击运行
# 看板地图边界 + 「只保留区域内骑手」的判断都按 Eastwind 的真实边界。已存的历史快照不动。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
echo "==> Web 预检"
npm run codex:preflight
git add app/rider-monitor/hot-zones.ts scraper/hot-area-sjbv.json scraper/eastwind-rider-status.mjs push-boavista-boundary.command
git commit -m "feat(boavista): zone outline is Eastwind's own hot area — vendor.rider.monitor.hotArea polygon for city 55000174 (areaID 242071373948, 58 vertices, 58.46 km²) captured from the Boa Vista board replaces the screenshot-traced oval, so the map boundary and the in-area rider filter match Eastwind exactly; the scraper keeps a local copy of the hotArea and KPI payloads per city for re-syncing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成。2 分钟后强制刷新(⌘ + Shift + R)看 Boa Vista 实时看板。"
