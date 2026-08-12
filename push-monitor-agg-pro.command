#!/bin/bash
# 实时监控:加盟商/站点分布表加 PRO 小计(业务方 2026-08-11)
#
# 「各加盟商在班分布」「各站点在班分布」两张表的在班骑手列,
# 在总数旁加金色小字 PRO n(有才显示)——
# 与顶卡「在班骑手 · PRO 10」、KPI 条副值同一套"总数 + 其中 PRO"视觉语言。
# Clayton 33 → 「33 PRO 5」,一眼看出各家 PRO 到岗情况。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/eastwind/riders-live/route.ts app/rider-monitor/page.tsx push-monitor-agg-pro.command
git commit -m "feat(monitor): the franchise and station distribution tables carry gold PRO sub-counts on the on-shift column — same total-plus-PRO-within language as the stat cards and the KPI strip, rendered only when a row actually has pro riders, so operations reads each franchise's PRO attendance without switching to the pool filter"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  · 各加盟商在班分布:Clayton 行在班骑手显示「33 PRO n」金色小字"
echo "  · 各站点在班分布同款;无 PRO 的行不显示小字"
