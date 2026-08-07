#!/bin/bash
# APP v2.4 — 闭环审计修复批次:
#  A. 商城订单可自助取消(在途订单显示"取消"按钮 → 确认弹框 → 服务端退积分/
#     退预付现金/恢复库存;已到货/已完成服务端会拒绝)
#  B. 扫码文案对齐现实("Ponto · Repasse · Parceiro" → "站点签到",三语)
#  C. 邀请进度可见(服务端 rider/home 新增 referrals;首页邀请行显示
#     "已邀请 N 人 · M 人已奖励",姓名脱敏)
#  D. targetSdk/compileSdk 35 → 36(Play 8/31 强制要求)⚠️ 请在真机上回归一下
#  E. 现金账本葡语化:"随加盟商付款"等中文备注不再原样显示给巴西骑手
#     (服务端出口翻译 → 已存的 627 条记录、所有 APP 版本立即生效)
# 步骤:web 预检 → 推送 → 构建 v2.4 AAB。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/rider/home/route.ts \
        android-rider-app/app/build.gradle \
        android-rider-app/app/src/main/java/com/meponto/rider/data/AppStore.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/RiderRepository.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/remote/ApiService.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/remote/Dtos.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/i18n/Localization.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/MallScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/HomeScreen.kt \
        push-app-v24.command
git commit -m "app v2.4: self-service order cancellation, honest scan copy, referral progress on home, target API 36 (Play Aug-31 requirement)"
git push origin main

echo "==> 构建 APP v2.4 (versionCode 17, targetSdk 36) release AAB"
cd android-rider-app
./gradlew bundleRelease
echo
echo "==> 完成!AAB:"
echo "    android-rider-app/app/build/outputs/bundle/release/app-release.aab"
echo "    ⚠️ targetSdk 升到 36,上传前建议先装真机试一圈(扫码/兑换/推送)"
echo "    → v2.3 过审后,Play Console 上传 v2.4 (versionCode 17)"
