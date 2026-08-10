#!/bin/bash
# 当日数据页:PRO 标记(业务方 2026-08-10 问"今日统计中 pro 骑手有标记吗"——没有,补上)
#
# 当日数据页此前完全没有池概念(接口和页面都没有)。现在:
#   · 接口:快照扫描带上 source 列 —— **在 PRO 源出现过 = PRO**
#     (与实时页、入库自动标记同一条规则:新 Eastwind 看板是池归属的事实),
#     档案 pool 匹配兜底;每行输出 pool 字段
#   · 汇总卡:骑手数、完单两张卡加金色 PRO 小计(与实时页 KPI 条、
#     T+1 看板顶卡同一套"总数 + PRO 其中"视觉语言;PRO 为 0 时不显示)
#   · 明细表:PRO 行金色左边框 + 极淡金底(复用 DataTable rowAccent,
#     与实时列表同款),名字金色 + PRO 徽章
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/eastwind/riders-today/route.ts \
        app/rider-monitor/today/page.tsx \
        push-today-pro-badge.command
git commit -m "feat(today-board): PRO riders are now marked on the daily accumulation view — the snapshot scan carries the source column so presence in the pro feed classifies the rider (same source-of-truth rule as the live board and the ingest auto-tagger, with profile pool as fallback), rows get the gold left-border accent and name badge already used on the live list, and the riders and finished stat cards gain the gold PRO sub-counts that the T+1 board's cards established"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后打开 当日数据 tab 验收:"
echo "  1) 骑手数、完单卡下方出现金色小字(PRO 8 / PRO n)"
echo "  2) PRO 骑手行:金色左边框 + 名字金色 + PRO 徽章"
echo "  3) 接单/完单等计数照旧(班段 MAX 口径没动,只加了标记)"
