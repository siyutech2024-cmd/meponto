#!/bin/bash
# 先锋骑手入库 —— 双击运行(第 2 步需要输 VPS 密码)
#   1) 发布网站:服务端接收「先锋骑手」名单,和 FL 骑手合并入库(每条标 先锋);
#      Boa Vista 骑手清单显示「先锋」标签;建档 / 单量 / 积分 / 组长考核自动覆盖先锋骑手
#   2) 升级 Boa Vista 抓取器:每轮抓完 FL 骑手后点「先锋骑手」标签再抓一份一起上传
#      (只升级 Boa Vista 实例;圣保罗老OL 的抓取器文件和进程都不动)
# 只新增数据,不改历史。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
echo "==> 1/2 发布网站"
npm run codex:preflight
git add app/api/eastwind/rider-status/route.ts app/lib/server/boavista-binding.ts app/lib/data.ts app/riders/page.tsx app/lib/i18n.ts \
  scraper/eastwind-rider-status.mjs push-pioneer-riders.command
git commit -m "feat(boavista): record 先锋骑手 (pioneer riders) — the Boa Vista scraper also opens the board's pioneer tab each round (best-effort, after the FL capture; pioneer-phase responses never overwrite the FL list or KPI; diagnostic log of api + query keys) and uploads it as pioneerList; the ingest parses it with the same parser into the same batch, tagged raw.riderGroup=pioneer (FL row wins for a rider on both tabs), so profiles, daily orders, points and leader assessment cover pioneer riders; Boa Vista profiles carry riderGroup fl/pioneer from the live feed and the riders list shows a Pioneer tag. Enabled for the sjbv source only (PIONEER_TAB overrides); São Paulo untouched.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 网站已推送,等 Vercel 部署 2 分钟…"
sleep 120

echo "==> 2/2 升级 Boa Vista 抓取器(输 VPS 密码)"
VPS=root@187.77.62.180
scp scraper/eastwind-rider-status.mjs $VPS:/tmp/eastwind-rider-status.mjs
ssh -t $VPS '
  set -e
  cp /opt/eastwind-scraper-sjbv/eastwind-rider-status.mjs /opt/eastwind-scraper-sjbv/eastwind-rider-status.mjs.bak-$(date +%Y%m%d-%H%M%S)
  install -m 644 /tmp/eastwind-rider-status.mjs /opt/eastwind-scraper-sjbv/eastwind-rider-status.mjs
  START="$(date "+%Y-%m-%d %H:%M:%S")"
  systemctl restart eastwind-scraper-sjbv
  echo "== 已升级并重启 Boa Vista 抓取器,等第一轮(最多 6 分钟)… =="
  for _ in $(seq 1 36); do
    sleep 10
    L=$(journalctl -u eastwind-scraper-sjbv --since "$START" --no-pager 2>/dev/null)
    if echo "$L" | grep -q "ingest 200"; then break; fi
    if echo "$L" | grep -qE "LOGIN_REQUIRED|ingest [45][0-9][0-9]"; then break; fi
  done
  journalctl -u eastwind-scraper-sjbv --since "$START" --no-pager | grep -E "pioneer|riderList via|ingest|LOGIN" | tail -6
'
echo
echo "=== 完成:把上面最后几行(含 pioneer tab 那行)发给 Claude ==="
