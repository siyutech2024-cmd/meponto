#!/bin/bash
# APP v2.2 —合并上一批(v2.1)未上架的改动 + 本批新功能,一次构建:
#  [v2.1] 现金账本排序+分页+隐藏无金额 / 消息点击弹框(统一风格) /
#         排班下拉刷新 / 积分流水分页 / 无库存提示优化
#  [v2.2] 徽章扩充(完单里程碑 8 档 + 在线时长/接单率/工龄/夜班/周单量共 10 个新徽章) /
#         主页显示头像 / 名片头像自愈(修 key 漂移导致头像消失)
# 步骤:web 预检 → 推送(服务端改动即生效)→ 构建 v2.2 AAB。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检(module:guard + build)"
npm run codex:preflight

echo "==> 提交并推送(仅相关文件)"
git add app/api/mall/route.ts app/api/rider/home/route.ts app/lib/mall.ts \
        android-rider-app/app/build.gradle \
        android-rider-app/app/src/main/java/com/meponto/rider/data/AppStore.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/AvatarStore.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/i18n/Localization.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/components/Extras.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/WalletScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/MallScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/HomeScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/ShiftsScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/MemberCardScreen.kt \
        push-app-v22.command
git commit -m "app v2.2: more badges (orders+hours+acceptance+tenure+night+weekly), avatar on home header, self-healing member-card avatar; plus v2.1 ledger/message/shift/statement/stock polish"
git push origin main

echo "==> 构建 APP v2.2 (versionCode 15) release AAB"
cd android-rider-app
./gradlew bundleRelease
echo
echo "==> 完成!AAB:"
echo "    android-rider-app/app/build/outputs/bundle/release/app-release.aab"
echo "    → Play Console 上传 v2.2 (versionCode 15)"
