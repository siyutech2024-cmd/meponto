#!/bin/bash
# Boa Vista:T+1 数据 / 组长考核 按实时看板统计 + 在线骑手全部入清单 + 组长邀请(合并)—— 双击运行
#   · 「T+1 数据 · Boa Vista」:每天优先用 T+1 表格;没有表格的天用实时看板
#       - 过去的天 = 每晚冻结的单量(+ 在线时长,11/3 起冻结的天才有)
#       - 今天 = 实时看板最新一批(完单、在线时长),页面顶部注明「截至 几点」
#       - TSH / AR / CAA 实时看板没有,导入 T+1 后才显示;Boa Vista 无工资,收入页为空
#   · 「组长考核」:今天的单量也按实时看板计入(只展示,零点后定格);本周漏冻结的过去几天,打开页面时自动补冻结
#   · 封周只会封「当前组长团队」,待分配池的旧临时行不会被封、不会生成付款
#   · 在线记录里出现的骑手 100% 进 Boa Vista 清单:每晚冻结时逐人核对——没建档的建档进 SJBV 池;
#     主档在圣保罗的不迁移(不影响圣保罗),在 Boa Vista 清单里也显示并标「主档:XX」
#   · (合并)组长在 App 邀请骑手 + 每队 5–8 人 + 考核小修
# 只新增数据,不改历史。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
npm run codex:preflight
git add app/api/leaders/assessment/route.ts app/api/leaders/route.ts app/api/network/route.ts app/api/riders/route.ts \
  app/api/performance/route.ts app/api/eastwind/rider-status/route.ts \
  app/assessment/page.tsx app/performance/page.tsx app/riders/page.tsx app/rider-app/team/page.tsx \
  app/lib/i18n.ts app/lib/leader-mode.ts app/lib/network.ts app/lib/data.ts \
  app/lib/server/leader-daily.ts app/lib/server/boavista-binding.ts app/lib/server/db/leader-repo.ts \
  push-boavista-live-stats.command
git commit -m "feat(boavista): T+1 page and leader assessment run on the live board until T+1 tables exist; every rider in the online records is on the Boa Vista list; leader invites + team size 5–8 — the Boa Vista T+1 view takes, per day, the T+1 import when present, else the frozen live ledger (attributed to that day's station) or today's newest realtime batch (orders + online hours; TSH/AR/CAA stay N/A; no money), with a banner naming the source; the assessment counts today from the newest batch (display only, never stored nor counted by the close gate) and self-heals past days of the week that were never frozen; close-week closes only current leader stations; the daily freeze now also stores online minutes and reconciles the roster over the whole day (missing riders get a profile in the pool, riders whose profile is on another franchise are marked seenInBoaVista and listed in Boa Vista without being moved); leaders invite riders from the team page (no team → join at once + HQ notified, other team → transfer for review, HQ switch to review all), team cap 8 riders excl. leader on every way in; fixes: same-day-cleared leader keeps the pool out of assessment, clearing a leader clears the name, new teams inherit the parent safety score. New records only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成。2 分钟后生效。推送后告诉 Claude,补核对 10/26 起的在线名单。"
