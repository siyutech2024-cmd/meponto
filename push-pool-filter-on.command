#!/bin/bash
# 骑手 APP 排班按池过滤:默认开启(业务方 2026-08-10 定"PRO 只显示 PRO 排班")
#
# ── 背景
# 功能(模式二 S1)几周前就做完了:/api/slots 按骑手 pool 过滤 ——
# PRO 骑手只看 PRO 班,普通骑手永远看不到 PRO 班。
# 但它挂在 MODE2_POOL=on 环境变量后面(灰度期护栏,默认关),
# 这个变量在 Vercel **从未被设置过** —— 功能做完一直没生效。
#
# ── 改动
# 默认翻转为【开】:PRO 全量上线,灰度使命结束。
# 保留 MODE2_POOL=off 作为紧急关闭开关(设 off 即回到全部可见的旧行为)。
# 不需要去 Vercel 设任何环境变量。
#
# 服务端过滤 = APP / PWA 一起生效,无需发版。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/slots/route.ts push-pool-filter-on.command
git commit -m "feat(slots): pool filtering defaults ON — the rider slot feed has filtered shifts by the rider's pool since S1, but it sat behind a MODE2_POOL=on env flag that was never set in Vercel, so the finished feature never fired; with the pro pool fully live the graduation-period default flips to on, PRO riders see only the PRO plan and standard riders never see it, and MODE2_POOL=off remains as the kill switch back to the old everything-visible behaviour"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收(服务端过滤,APP 无需更新):"
echo "  1) PRO 骑手登录 APP → 排班菜单只列 PRO 班次"
echo "  2) 普通骑手登录 → 看不到任何 PRO 班次,普通班照旧"
echo "  3) 想紧急回退:Vercel 设 MODE2_POOL=off 并 redeploy"
