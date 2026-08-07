#!/bin/bash
# 修复 KPI 面板消失:后端 cancelledOrders 取整(小数 caa 让 Moshi 解析崩溃 → 整个
# /rider/home 被丢弃 → KPI 及首页区块消失)。后端一部署,线上所有已装版本立即恢复。
# APP 端 DTO 同步加固(Double 容错),随下个版本生效。
cd "$(dirname "$0")" || exit 1
rm -f .git/index.lock
set -e

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/rider/home/route.ts \
        android-rider-app/app/src/main/java/com/meponto/rider/data/remote/Dtos.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/RiderRepository.kt \
        push-kpi-fix.command
git commit -m "fix(rider-home): round cancelledOrders to int — fractional CAA made Moshi discard the whole home payload, hiding the KPI panel; harden app DTO to Double"
git push origin main

echo "==> 完成。Vercel 部署后(约1-2分钟),重开APP首页即恢复 KPI。"
