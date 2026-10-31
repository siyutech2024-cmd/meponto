#!/bin/bash
# 骑手 App 2.8(组长模式体验)+ 服务端 + 网页 —— 双击运行
#   1) 推送代码(服务端立即生效):首页下发组长模式入口;团队页/申请页在 iPhone 浏览器里可登录后返回
#   2) 构建 Android 2.8(versionCode 21)AAB → 上传 Play Console
# Android 2.8:Boa Vista 骑手底部「班次」换成「团队」;首页固定「我的团队 / 当组长」入口;
#   实时单量标「实时」,接单率/取消率/时长显示「—」;说明文字(无排班、工资由 99 发)。
#   · 后台 Boa Vista 骑手清单:「缺PIX」只提示没填 Pix 的组长(普通骑手由 99 发工资,不需要 Pix)
# 圣保罗骑手 App 界面不变。不改任何已有数据。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
npm run codex:preflight
git add app/api/rider/home/route.ts app/riders/page.tsx app/register/page.tsx app/rider-app/team/page.tsx app/rider-app/leader-apply/page.tsx \
  android-rider-app/app/build.gradle \
  android-rider-app/app/src/main/java/com/meponto/rider/data/AppStore.kt \
  android-rider-app/app/src/main/java/com/meponto/rider/data/Models.kt \
  android-rider-app/app/src/main/java/com/meponto/rider/data/RiderRepository.kt \
  android-rider-app/app/src/main/java/com/meponto/rider/data/remote/Dtos.kt \
  android-rider-app/app/src/main/java/com/meponto/rider/i18n/Localization.kt \
  android-rider-app/app/src/main/java/com/meponto/rider/ui/RootScaffold.kt \
  android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/HomeScreen.kt \
  android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/TeamScreen.kt \
  push-app-2.8-leader.command
git commit -m "feat(rider-app 2.8): leader mode experience — in leader-mode cities the Shifts tab becomes Team (who I am: leader / team / no team, my orders with live badge, open team dashboard, become a leader / join / transfer, how pay works); home gets a fixed team/apply entry (activity cards pointing to the same link are no longer duplicated); live-ledger KPI days show a Live badge and — for hours/AR/CAA instead of fake zeros; server: /api/rider/home ships a leaderMode block (role, station, links, notices); web: team and leader-apply pages offer a login that returns to the page (register ?next= whitelist) so iPhone riders can use them in the browser. versionCode 21 / 2.8. Back office: in the Boa Vista riders list the missing-Pix flag only shows for leaders with no station payee Pix and no own Pix.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
echo "==> 代码已推送。开始构建 Android 2.8…"
bash ./build-app-log.command
