#!/bin/bash
# GA4 接入:
#  网站:layout.tsx 注入 gtag(流 "MePonto Web", G-SKT4QZV5RV)→ 推送后全站生效
#  APP :firebase-analytics 依赖 + Analytics 封装 + 4 个业务事件
#       (station_check_in / redeem_order / shift_enroll / support_ticket)
#       → 数据进 GA 里已存在的 "MePonto" Android 流,随 v2.5 上架生效
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/layout.tsx \
        android-rider-app/app/build.gradle \
        android-rider-app/app/src/main/java/com/meponto/rider/data/Analytics.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/AppStore.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/MainActivity.kt \
        push-analytics.command
git commit -m "analytics: GA4 web tag (MePonto Web stream) + Firebase Analytics in app with core business events"
git push origin main

echo "==> 构建 APP v2.5 (versionCode 18) release AAB"
cd android-rider-app
./gradlew bundleRelease
echo
echo "==> 完成!"
echo "    网站端:Vercel 部署后即上报(GA 实时报告几分钟内可见)"
echo "    APP 端:v2.4 过审后上传本 AAB (v2.5, versionCode 18)"
