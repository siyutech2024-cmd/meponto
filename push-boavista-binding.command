#!/bin/bash
# Boa Vista 区域内骑手默认绑定 SJBV + 看板只显示 Boa Vista 区域 —— 双击运行
#
# ── 改动(只影响新数据;已有档案里已归属其他加盟商的骑手不动,历史 T+1 归属不动)
#   · Boa Vista 抓取每一轮:区域内的骑手
#       - 没有档案 → 自动建档,加盟商 = Boa Vista 加盟商(SJBV)
#       - 有档案但未归属 → 自动填 SJBV
#       - 已归属别的加盟商 → 不动
#     站点(组长)留给运营分配。紧急关闭:Vercel 设 SJBV_AUTOBIND=off
#   · Boa Vista 实时看板:地图锁定在 Boa Vista 区域;看板上不再隐藏未归属骑手
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检(模块边界 + 生产构建)"
npm run codex:preflight

echo "==> 提交并推送(只提交本次相关文件)"
git add app/lib/server/boavista-binding.ts app/api/eastwind/rider-status/route.ts \
  app/rider-monitor/page.tsx app/rider-monitor/RiderMap.tsx push-boavista-binding.command
git commit -m "feat(boavista): riders kept by the Boa Vista in-area feed are bound to the Boa Vista franchise by default — no profile → created on it (deterministic id r-sjbv-<99ID>, DB re-read first, matched by 99ID/CPF/phone), unbound profile → franchise filled, already-bound riders never re-assigned, T+1 attribution untouched, kill switch SJBV_AUTOBIND=off; the Boa Vista live board frames and locks the map to the Boa Vista area and no longer hides riders without a franchise

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpzicu7ee"
git push origin main

echo
echo "==> 完成。2 分钟后浏览器强制刷新(⌘ + Shift + R)。Boa Vista 抓取下一轮(3 分钟内)起自动绑定。"
