#!/bin/bash
# APP 实测反馈 7 项修复:会员卡去金额 / 通知7天过期+横滑 / 兑换短缺换现 /
# 站点评论(服务端+APP) / 名片分享预览 / 排班星期本地化。
# 步骤:web 预检 → 推送(Vercel 自动部署)→ 构建 v2.0 AAB(上架用)。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检(module:guard + build)"
npm run codex:preflight

echo "==> 提交并推送 web 改动"
git add app/api/rider/home/route.ts app/api/partner/reviews/route.ts \
        android-rider-app/app/build.gradle \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/components/MembershipCard.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/HomeScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/MallScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/MapScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/MemberCardScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/ShiftsScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/AppStore.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/RiderRepository.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/remote/ApiService.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/remote/Dtos.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/i18n/Localization.kt \
        push-app-feedback.command
git commit -m "app v2.0: field-feedback fixes — points card w/o cash, 7-day swipe notices, shortfall redeem, station reviews, share preview, localized weekdays"
git push origin main

echo "==> 构建 APP v2.0 (versionCode 13) release AAB"
cd android-rider-app
./gradlew bundleRelease
echo
echo "==> 完成!AAB 位于:"
echo "    android-rider-app/app/build/outputs/bundle/release/app-release.aab"
echo "    → Play Console 上传新版本 (v2.0, versionCode 13)"
