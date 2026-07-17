#!/bin/bash
# 对账自愈上线:reconcileAndHeal(投影脏了自动按 JSONB 真源修复)
# + 余额快照孤儿自动重算。推送后自动触发一次 cron,立即清掉 7/17 的脏项。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> 预检(module:guard + build)"
npm run codex:preflight

echo "==> 提交并推送"
git add app/lib/server/db/reconcile.ts app/api/cron/reconcile-perf/route.ts push-heal.command
git commit -m "reconcile: self-heal projections (delete legacy-gone rows, re-upsert drift, recompute orphan balances)"
git push origin main

echo "==> 等待 Vercel 部署(150s)…"
sleep 150

echo "==> 触发对账自愈"
SECRET=$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | cut -d= -f2- || true)
if [ -n "$SECRET" ]; then
  curl -s -H "Authorization: Bearer $SECRET" "https://mall.meponto.com/api/cron/reconcile-perf" | head -c 3000
else
  curl -s "https://mall.meponto.com/api/cron/reconcile-perf" | head -c 3000
fi
echo
echo "==> 完成。perf/txcore/fin 三模块应显示 clean:true(healed 字段=本次修复量)"
