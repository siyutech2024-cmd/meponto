#!/bin/bash
# 结算记账解耦(2026-08-06 决策):
#  1. APP 现金账本改为直接按【导入的结算表】显示(riderDailyEarnings 每日一行:
#     日期·N单·金额)——不再依赖任何付款动作。7月/8月已导入的数据部署后立即可见。
#  2. 记付款/确认提现不再自动扣加盟商预付款账本(负余额 -R$123k 的根因,已移除)。
#  3. 附清零脚本:把现有负余额补一笔 adjust 归零(幂等,可重复跑)。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/rider/home/route.ts app/api/wallet/route.ts \
        android-rider-app/app/build.gradle \
        docs/rider-app-update-plan-v2.md \
        scripts/zero-franchise-deposits.mjs \
        push-settlement-decouple.command
git commit -m "settlement: rider statement now reads the imported sheet directly (no payment-action dependency); decouple franchise deposit auto-drawdown (phantom negative fix); plan doc v2 + v2.6 version line"
git push origin main

echo "==> 清零加盟商预付款负余额(幂等)"
node scripts/zero-franchise-deposits.mjs

echo "==> 完成。部署后骑手 APP 现金账本立即显示 7 月至今的全部结算记录。"
