#!/bin/bash
# 排行榜入口打不开 —— 修路由 + 补后台校验
#
# 现象:APP 里看不到排行榜入口;浏览器打开 mall.meponto.com/rider-app/ranking
#      被弹到 app.meponto.com/register。
#
# ── 根因(两层,都得修)
#
# ① 【真根因】proxy.ts 的 riderSections 白名单里没有 "ranking"
#    域路由的实际规则:
#      mall.meponto.com/rider-app/*  →302→  app.meponto.com/<去掉前缀>
#      app.meponto.com/<page>        →rewrite→ /rider-app/<page>  ※仅白名单内
#      不在白名单 → 掉进"严格域⇄门户绑定" → 弹回 / → 未登录再跳 /register
#    页面代码完全没问题,是**路由没登记**。已把 ranking 加进白名单,
#    并在那行上方写死注释:以后新增骑手页必须同步加,否则同样打不开。
#
#    ⚠️ 同时更正一条我之前给错的结论:
#    我按 build.gradle 的 BASE_URL 推断"linkURL 必须填 mall.meponto.com",
#    实测是错的。骑手页的域是 **app.meponto.com**,正确地址:
#        https://app.meponto.com/ranking
#    (mall 那条也能到,但多一跳。cookie 域是 .meponto.com,两个子域都带得上。)
#    后台的「填入排行榜地址」按钮已改填这条;填了 mall 版会提示换成干净地址。
#
# ② 【配置】后台「首页活动入口卡」的复选框没勾
#    linkURL、日期窗口、受众都填好了,排行榜也开了 topN 30,唯独卡本身是关的
#    → 服务端不下发这张卡 → APP 首页没有入口,而且**页面上没有任何报错**。
#
#    这一条正好落在我上一版校验的盲区:我检查了"卡指向排行榜但榜关了"和
#    "榜开了但卡没指过去",唯独漏了最关键的"卡本身开没开"。已补:
#      · 排行榜区块 —— 逐条点名缺哪一步(URL没指 / 卡没启用 / 卡没标题)
#      · 活动卡区块 —— URL 填好但没勾复选框,就地提示
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add proxy.ts app/app-config/page.tsx docs/activity-leaderboard-plan.md push-ranking-route-fix.command
git commit -m "fix(proxy): register ranking in riderSections — a rider page missing from the whitelist is not rewritten to /rider-app, falls through the strict host-portal binding and bounces to /register, so the page looks broken when only its route was unregistered; the canonical rider domain is app.meponto.com (mall/rider-app/* merely 302s there), so the back office now fills the clean URL and warns on the mall form; also flag the activity card's own enable checkbox, the one switch the earlier cross-checks failed to cover"
git push origin main

echo
echo "==> 部署好后(约 1-2 分钟)按这个顺序验收:"
echo
echo "  1) 浏览器开 https://app.meponto.com/ranking"
echo "     → 应直接渲染榜单(未登录也能看,只是不高亮自己那行)"
echo "     → 若仍跳 /register,说明部署没生效,等一下再试"
echo
echo "  2) 后台 APP 配置页:"
echo "     · 点「填入排行榜地址」→ URL 变成 https://app.meponto.com/ranking"
echo "     · **勾上最上面的「首页活动入口卡」**   ← 这次没显示的直接原因"
echo "     · 填一个葡语标题,例如 Ranking de pedidos 🏆"
echo "     · 点「保存启动页」"
echo
echo "  3) 手机 APP 杀进程重开(首页配置是启动时拉的)"
echo "     → 首页出现活动卡 → 点进去直接是榜单,不用再登录"
