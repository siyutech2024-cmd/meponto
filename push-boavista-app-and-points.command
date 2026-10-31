#!/bin/bash
# Boa Vista:App 端补齐 + 默认站点 + 累计完单/积分 —— 双击运行(一次发布)
#   · SJBV 骑手默认分配到站点 SJBV(只填没有站点的人;已分给组长的不动)。新骑手建档即在 SJBV 站点
#   · SJBV 站点是「待分配池」:没有组长,不进组长考核与结算
#   · 骑手清单「累计完单」= T+1 表 + 每日实时单量(没 T+1 表的天),同一天以 T+1 为准
#   · 每单 +1 积分(按每日冻结的单量记,只追加;T+1 表导入后那天以表为准,也是每单 1 分)
#   · App:SJBV 骑手不显示/不能报名圣保罗排班;钱包和流水不显示工资;后台不能给 SJBV 骑手记工资付款
#   · App 首页 KPI:没 T+1 表的天用每日实时单量
#   · 组长申请:站点重名直接拒绝
# 不改任何已有历史数据;圣保罗骑手和页面不变。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
npm run codex:preflight
git add app/lib/leader-mode.ts app/api/slots/route.ts app/api/wallet/route.ts app/api/rider/home/route.ts \
  app/lib/server/boavista-binding.ts app/api/eastwind/rider-status/route.ts app/api/leaders/assessment/route.ts \
  app/api/performance/route.ts app/lib/server/leader-points.ts app/lib/server/leader-daily.ts app/api/riders/route.ts \
  app/api/leaders/route.ts push-boavista-app-and-points.command
git commit -m "feat(boavista): default pool station, live-daily lifetime orders + 1 point per order, rider app side of leader mode — Boa Vista riders with no station go to the franchise's pool station SJBV (fill-only, never moves a rider off a station; new profiles start there); a station that never had a leader is not a leader station (no assessment, no pay); riders list lifetime orders add the frozen daily live ledger for days without a T+1 row (T+1 wins per day); each frozen day credits 1 point per order (insert-only, same ledger id as T+1, credited from the stored counts) and T+1 imports credit leader-mode riders 1 point per order flat; app: empty shift feed + no signup for leader-mode riders, wallet/home ledger never show PontoSys wages and back-office recordPayment refuses wage payments for leader-mode cities, home KPI falls back to the live ledger; leader applications reject duplicate station names. No stored history changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成。约 3 分钟内 SJBV 骑手自动进 SJBV 站点;告诉 Claude 已推送,补记 10/26 起的每日单量和积分。"
