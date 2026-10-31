#!/bin/bash
# 组长模式闭环(第一批 + 第二批,一次发布)—— 双击运行
#   · KPI 设置:组长基础 / 考核提成可改(默认 R$0 + R$0.15/单),下周一生效
#   · 组长与站点:建无场地组长站点、设组长与 Pix/CPF/CNPJ、试运营/正式/暂停/关闭、试运营达标「转正」
#   · 骑手清单:勾选多人一次分给组长;组长结算页只做组长周提成
#   · 每日实时单量记账(无表格时用,只追加);有 T+1 表格的那天以表格为准
#   · 封周:7 天数据齐才能封,缺的天自动补记;应付 R$0 的周直接结清;漏付 bug 修复
#   · 组长当周换人按天切开提成
#   · App 首页卡片:组长「Minha equipe」、SJBV 骑手「Seja líder ou entre numa equipe」;修申请页打不开
# 只影响新数据;圣保罗页面与数据不变。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
npm run codex:preflight
git add app/lib/server/leader-daily.ts app/api/cron/leader-daily/route.ts vercel.json \
  app/api/rider/team/route.ts app/rider-app/team/page.tsx app/api/rider/home/route.ts proxy.ts \
  app/lib/leader-mode.ts app/lib/data.ts app/lib/i18n.ts app/lib/portals.ts app/lib/server/db/leader-repo.ts \
  app/api/leaders/assessment/route.ts app/api/network/route.ts app/api/wallet/route.ts \
  app/assessment/page.tsx app/performance/page.tsx app/pontos/page.tsx app/riders/page.tsx app/wallet/page.tsx \
  push-leader-mode-loop.command
git commit -m "feat(leader-mode): close the Boa Vista leader loop — KPI settings for the two leader components (base + bonus R$/order, default 0 + 0.15, append-only versions effective next Monday); leader-station setup (virtual stations, leader rider, payee masked for tenants, trial/active/suspended/closed, trial progress + HQ one-click promotion, trial weeks earn the bonus, leader history so a mid-week change splits the commission by day); bulk-assign riders to a leader; Boa Vista settlement = leader weekly payments only; daily live order ledger (append-only, frozen 00:10 BRT, counter-reset tolerant, attributed to the rider's station that day; T+1 wins per imported day) feeding assessment and close-week, with close-time backfill of missing past days; leader team API + Minha equipe page and app home card routing (leader → team, then marketing, then apply entry); fix(leader-mode): generating payments settles only stations that got an order (no-payee stations used to be marked settled and never paid), zero-amount weeks settle without an empty order, close-week gate is city-level; fix(proxy): register team and leader-apply rider pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 完成。2 分钟后强制刷新(⌘ + Shift + R)。"
