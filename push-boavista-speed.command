#!/bin/bash
# 实时看板提速(根因)+ 未上线骑手折叠 —— 双击运行
#   · 根因:接口里"找老OL 在 Boa Vista 的最新一批"这条查询,因为老OL 从没在 Boa Vista 抓到过数据,
#     每次都把老OL 几个月的历史翻一遍才确认没有(7-8 秒);圣保罗第一行就命中(0.25 秒)。
#     现在这类查询只看最近 24 小时(看板本来只用最近 20 分钟的批次),预计 Boa Vista 降到 1 秒以内。
#   · 表格默认只列在线/配送中,未上线的折叠成一个按钮,点开再看;状态卡和地图不变。
# 只改读取方式,不改任何数据。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
npm run codex:preflight
git add app/api/eastwind/riders-live/route.ts app/rider-monitor/page.tsx app/lib/i18n.ts push-boavista-speed.command
git commit -m "perf(riders-live): bound the per-source latest-batch and heartbeat lookups to the last 24 h — with no (source, city) index, a source that never reported the requested city (old OL ↔ Boa Vista) made Postgres walk the source's whole history before answering none, 8 s per board load; the board only shows batches from the last 20 min so the floor is behaviour-neutral; feat(rider-monitor): the rider table folds not-online riders behind a toggle so working riders are read first

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成。2 分钟后强制刷新。"
