#!/bin/bash
# Boa Vista 独立菜单 + 只抓区域内骑手(业务方 2026-10-26 定)—— 网站端发布,双击运行
#
# ── 改动(只改"怎么显示"和"新进来的数据",已有数据一条不改、不删、不迁移)
#   · 侧边栏新增「Boa Vista · Leader」组:实时看板(含当日数据)/ 运力排班 /
#     T+1 数据与骑手结算 / 骑手清单 / 组长与站点 / 组长考核 / 结算
#   · 圣保罗原有菜单只显示圣保罗,不再混入 Boa Vista(总部视角;加盟商/站点后台不变)
#   · 归属判断:骑手跟着加盟商走(加盟商城市/名称/区域归属);未分配的新骑手按出现在哪个城市的看板
#   · Boa Vista T+1 导入不再出现 PRO 选项(避免金额被清零)
#   · Boa Vista 菜单默认填 Boa Vista(加盟商城市、新骑手/新站点的加盟商;未分配骑手预填,点确认才保存)
#   · 新 Boa Vista 抓取只保留区域内骑手(当天进过区域的骑手出区不丢);紧急关闭:Vercel 设 SJBV_ZONE_FILTER=off
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检(模块边界 + 生产构建)"
npm run codex:preflight

echo "==> 提交并推送(只提交本次相关文件)"
git add \
  app/lib/regions.ts app/lib/useRegion.ts app/lib/geo.ts app/lib/server/regions.ts \
  app/components/ui.tsx app/lib/portals.ts app/lib/i18n.ts \
  app/riders/page.tsx app/riders/boavista/page.tsx \
  app/rider-monitor/page.tsx app/rider-monitor/MonitorTabs.tsx app/rider-monitor/today/page.tsx \
  app/rider-monitor/boavista/page.tsx app/rider-monitor/boavista/today/page.tsx \
  app/dispatch/page.tsx app/dispatch/boavista/page.tsx \
  app/performance/page.tsx app/performance/boavista/page.tsx \
  app/pontos/page.tsx app/pontos/boavista/page.tsx \
  app/assessment/page.tsx app/assessment/boavista/page.tsx \
  app/wallet/page.tsx app/wallet/boavista/page.tsx \
  app/api/eastwind/rider-status/route.ts app/api/eastwind/riders-live/route.ts app/api/eastwind/riders-today/route.ts \
  app/api/performance/route.ts app/api/wallet/route.ts app/api/assessment/route.ts \
  scraper/eastwind-rider-status.mjs push-boavista-menus.command
git commit -m "feat(regions): Boa Vista gets its own menu, São Paulo pages stay São Paulo-only — live board + today, shifts, T+1 data & rider pay, rider list, leaders & stations, leader assessment and settlement are the same pages scoped by a /boavista URL segment; HQ views split by the rider's franchise through an optional read-only region param (tenant portals unchanged), so no stored record, payment or ledger is modified; the Boa Vista ingest keeps only riders inside the Boa Vista hot area (riders already seen inside today stay), Boa Vista imports can't pick the zero-money PRO account; Boa Vista defaults (franchise city, new rider / station franchise, staged franchise for unassigned Boa Vista riders — saved only on confirm) and leader-mode franchises count as Boa Vista; the scraper also reads station-level boards (stationRiderList / stationFeatureInShift) and the zone filter keeps riders with no GPS. Flag exception (requested live by ops): view-only split, ingest filter kill switch SJBV_ZONE_FILTER=off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后刷新 sys.meponto.com,侧边栏会出现「Boa Vista · Leader」一组。"
