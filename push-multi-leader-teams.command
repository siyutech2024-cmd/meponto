#!/bin/bash
# 一个站点多个组长 —— 双击运行
#   · 组长与站点(Boa Vista):站点 SJBV 上「增加组长」→ 每个组长建一个自己的团队(挂在 SJBV 下)
#   · 组长只看到自己团队的骑手(App 团队页 / 考核 / 结算都按团队算)
#   · SJBV 本身是待分配池,不能直接设组长(防止把全部骑手交给一个人)
#   · 骑手清单:站点下拉里组长团队显示为「↳ 团队名 · 组长名」,勾选骑手一键分进团队
#   · 骑手 App 申请「开站」批准后,新团队自动挂在 SJBV 下;「加入团队」只列有组长的团队
# 只新增数据,不改历史;圣保罗不受影响。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
npm run codex:preflight
git add app/lib/data.ts app/api/network/route.ts app/api/leaders/route.ts app/pontos/page.tsx app/riders/page.tsx app/lib/i18n.ts \
  push-multi-leader-teams.command
git commit -m "feat(leader-mode): one station, many leaders — HQ adds leaders to a station as leader teams (a team is a virtual child station: parentStationId, its own leader, payee, trial/active, leader history from today; the leader's rider record moves into the team); each leader sees only their team because the team page, daily attribution, assessment and settlement already run per station; the pool / a station holding teams can no longer be given a leader directly; approved open-station applications become teams under the franchise pool; join/transfer lists only leader teams with the leader's name; riders list labels teams (↳ team · leader) in the station pickers and bulk assign. New records only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成。2 分钟后刷新「组长与站点 · Boa Vista」,在 SJBV 那一行点「增加组长」。"
