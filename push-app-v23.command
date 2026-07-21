#!/bin/bash
# APP v2.3:
#  1. 名片分享修复:每次分享用唯一文件名(接收方 App 按 URI 缓存,固定文件名导致
#     换了照片分享出去还是旧图),并清理旧分享文件
#  2. 成就徽章折叠/展开(默认 2 行,已达成优先,右上显示 达成数/总数)
#     + "我的"页头像显示(与名片/首页同一张照片)
#  3. 首页下拉刷新(现金账本/KPI/通知即拉即新)
# 注:现金账本"不是最新"经查是 6/29 后没有导入新结算数据,非显示 bug。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add android-rider-app/app/build.gradle \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/HomeScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/ProfileScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/MemberCardScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/i18n/Localization.kt \
        push-app-v23.command
git commit -m "app v2.3: unique share filename (stale card image fix), collapsible badges + profile avatar, home pull-to-refresh"
git push origin main

echo "==> 构建 APP v2.3 (versionCode 16) release AAB"
cd android-rider-app
./gradlew bundleRelease
echo
echo "==> 完成!AAB:"
echo "    android-rider-app/app/build/outputs/bundle/release/app-release.aab"
echo "    → v2.2 审核结束后,在 Play Console 上传 v2.3 (versionCode 16)"
