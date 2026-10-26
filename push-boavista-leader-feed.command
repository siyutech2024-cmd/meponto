#!/bin/bash
# 新OL 并入 Boa Vista(业务方 2026-10-26 定)—— 网站端发布,双击运行
#
# ── 改动
#   · ingest 新增 "sjbv" 源:Boa Vista 专用账号(组长模式)的实时数据走自己的通道,
#     不进 PRO 池、不被自动打成 PRO、金额不清零;sjbv 只收 Boa Vista(55000174)的数据
#   · 实时看板的数据源 = 老OL(main)+ Boa Vista(sjbv);PRO 暂停,不再参与
#     (否则它的过期心跳会让「应岗未上」面板永久隐藏)
#   · 抓取器支持 SOURCE_ACCOUNT=sjbv;老OL 不设这个变量,行为不变
#   · 看门狗改为看护 老OL + Boa Vista
#
# 不需要去 Vercel 设任何环境变量。发布完再双击 scraper/switch-to-boavista.command。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送(只提交本次相关文件)"
# VPS 运维脚本(含 VPS 地址 / VNC 密码)与 PRO 那批一样留在本地不进 git
git add app/api/eastwind/rider-status/route.ts app/api/eastwind/riders-live/route.ts \
  scraper/eastwind-rider-status.mjs scraper/scraper-watchdog.sh push-boavista-leader-feed.command
git commit -m "feat(eastwind): new OL merged into Boa Vista — the PRO-pool scraper is paused and its VPS slot now runs the dedicated Boa Vista account in leader mode as its own ingest lane \"sjbv\" (never auto-tagged PRO, only accepts cityId 55000174); the live board reads main + sjbv so the paused PRO heartbeat no longer hides the no-show panel; old OL scraping is unchanged except it stops rotating into Boa Vista once the new feed is confirmed live

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main

echo
echo "==> 完成。等 1-2 分钟 Vercel 部署,然后双击 scraper/switch-to-boavista.command"
