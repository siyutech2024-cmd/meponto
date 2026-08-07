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
# ③ 【下发了但看不见】活动卡标题为空 → APP 里渲染成一个空白框
#    实测 /api/app/rider/splash 返回 v5:卡 enabled=true、linkURL 也对了,
#    但 title / imageURL / badge / subtitle 全是空字符串。
#    HomeScreen 的卡片 = 标题 + 可选(图/角标/副标题),标题空 → 整张卡是空白 Panel。
#    骑手看不出那是入口;运营更查不出来 —— 后台明明勾了、接口明明返回了。
#    → activityCardVisible() 加一条:标题为空一律不下发。
#      宁可不下发,也不要给一个看不见的入口。
# ═══════════════════════════════════════════════════════════
# ④ 【数据是错的】排行榜被 PostgREST 的 1000 行上限截断
# ═══════════════════════════════════════════════════════════
# 实测对比(2026-08-07 15:xx):
#            接口返回        数据库实际
#   人数        56            111
#   最高单量     5             13
#   日榜 vs 周榜  完全一样      本周 5 天 43,401 行
#
# 根因:原实现把整周快照拉回 Node 再聚合,而 PostgREST 有 **1000 行返回上限**,
# `.limit(50_000)` 压不过它。于是只拿到最近 1000 行(≈今天最后几个批次),
# 日榜和周榜用的是同一批数据 → 两张榜一模一样。
# 最坏的一点:接口 200、数字看着也像那么回事,**没有任何报错**。
#
# 修法:聚合下推到数据库。新增迁移
#   supabase/migrations/20260807120000_rider_order_ranking_rpc.sql
#   · rider_order_ranking(from,to,day) 在库内做"每人每天 MAX、周内再相加"
#   · 加了本地日期表达式索引,否则 30 万行整表扫
#   · 只回 ~150 行(原来要传 43,000 行)—— 顺带解决页面卡顿
#
# ⚠️ 这条**依赖迁移先跑**。迁移没应用时接口会自动退回"分页聚合"慢路径,
#    结果正确、只是慢(响应里 degraded:true)。跑完迁移就走快路径。
#    → 见脚本末尾的执行顺序。
#
# ⑤ 【发现】PRO 抓取一条数据都没有
#    快照表 source 全是 main,7/24 至今没有一条 pro。所以榜上一个 PRO 都没有 ——
#    不是代码问题,是 PRO 抓取器没产出。这条得去 VPS 查。
#
# ═══════════════════════════════════════════════════════════
# ⑦ 【口径改了】排行榜改用 T+1 确认报表,不再用实时快照
# ═══════════════════════════════════════════════════════════
# 本来只是查"周排名会不会太吃数据库"(实测 875ms / 540MB / 次),
# 顺手核对了一下两个数据源,发现更严重的问题 —— 同一天同一批骑手:
#
#     骑手      T+1 确认   快照 MAX   比例
#     …6017        23         9       39%
#     …1866        22         9       41%
#     …1041        20         7       35%
#     …0639        19        10       53%
#
# 快照只有真实值的 ~40%,**而且比例不一致**。后果不是"数字偏小":
# …0639 以快照 10 排在 …6017 的 9 前面,真实却是 19 vs 23 —— **名次是反的**。
#
# 即 finished_cnt **不是当日累计完单**,原设计的口径假设就错了。
# (这个错误藏在"每人每天取 MAX 不是 SUM"这条正确规则底下 ——
#  规则对,输入的语义错。)
#
# 改用 riderDailyKpis 之后:
#   · 数字和结算、周考核同源 —— 骑手拿榜单来问工资,查到的是同一份数
#   · PRO 能上榜(快照 source 至今全是 main,PRO 根本不出现)
#   · 一周约 1000 行,不是 7 万行;走已有索引,不需要新索引
#   · 原本规划的"日聚合表"彻底不需要了 —— T+1 报表本身就是日聚合表
#   · 缓存 TTL 从 90 秒放宽到 5 分钟(数据一天只变一次)
#
# 代价:没有"今天"。日榜 = 报表里最新有数据的一天(通常昨天;
# 导入晚一天就显示前天,而不是空榜)。界面上把日期显示出来了,
# 否则骑手会当成今天的。
#
# ⚠️ 没有"退回前端聚合"的兜底了:一周约 1000 行正好卡在 PostgREST 的
#    1000 行上限上,自己拉回来算随时可能悄悄少一批人。迁移没跑就明确报错。
#
# ⑧ 【遗留】PRO 抓取一条数据都没有
#    快照表 source 从 7/24 至今全是 main。排行榜不再依赖它了,
#    但**实时监控看板还在用** —— 这个得单独去 VPS 查。
#
# ⑨ 【实测反馈】返回按钮点了没反应 + 进排行榜先糊一屏启动页
#
#    两个是同一类问题:这页会被**深链直接打开**,不是一步步点进来的。
#
#    · 返回按钮:活动卡 → WebView 是新开一个页面,history.length === 1,
#      无脑 history.back() 什么都不会发生 —— 按钮看着能点,点了没反应。
#      改成运行时判断:有历史就返回;没有就回骑手端首页,
#      **并且把文案也换成 Início** —— 写着 Voltar 却跳首页会让人以为点错了。
#
#    · 启动页:RiderSplash 挂在 rider-app 的 layout 上,每个页面都会触发。
#      首页进来没问题(一次会话只放一次),但 WebView 打开排行榜是**全新会话**,
#      sessionStorage 是空的 → 点一次卡片就先看一屏启动页,放完才见榜单。
#      启动页的语义是"打开 APP",不是"打开任意页面" —— 现在按路径卡死在首页。
#
# ⑩ 【二次反馈】进度条太淡等于没有 / 首页按钮去掉
#    · 进度条:第一版用 scaleX + 22% 透明度,淡到等于没有;第二版加了左右竖线
#      (左侧色带锚点 + 末端实色封口),但一屏十几行的竖线会连成一列栅栏,反而抢眼。
#      定版:**只留一条横向背景色带**,靠饱和度让它看得见、末端渐隐不切一刀。
#      末位保底 8% 宽,否则榜尾几行的条会整个消失。
#      用静态 width 而不是 scaleX —— 值从不变化,不存在每帧 layout。
#    · 返回按钮:没有上一页时**直接不显示**。WebView 顶部本来就有原生关闭键,
#      页面里再放一个只会多此一举 —— back() 点了没反应,跳首页又会把人
#      从活动里带走。退出交给原生那颗。
#
# ⑥ 排行榜页面重做(领奖台/进场动画/骨架屏 + 名次色带 + 滚动优化)
#    · 进度条按名次走色带:第 1 名热橙 → 榜尾紫。灰色只说明长短,
#      色相额外说明"在哪个梯队";PRO 仍为金色(身份色优先)
#    · 前三名放深色舞台 + 金色光晕,和下面浅色列表拉开层次
#    · 滚动卡顿两个真凶:每行重复 paint(加 content-visibility: auto,
#      滚出视口直接跳过渲染)、进度条用 width 每帧触发 layout(改 transform: scaleX)
#    · 每行 box-shadow 换成 outline —— 阴影是移动端 WebView 滚动的经典杀手
#    APP 活动卡默认头图的 Kotlin 改动也一并提交,但**本期不发版**
#    (版本号已备好 v2.7 / code 20,下次发版直接用;暂时别跑 build-app-v27.command)
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add proxy.ts app/lib/app-config.ts app/app-config/page.tsx \
        app/rider-app/splash-gate.tsx \
        app/api/rider/leaderboard/route.ts app/rider-app/ranking/page.tsx \
        supabase/migrations/20260807120000_rider_order_ranking_rpc.sql \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/HomeScreen.kt \
        android-rider-app/app/build.gradle \
        docs/activity-leaderboard-plan.md push-ranking-route-fix.command
git commit -m "fix(leaderboard): aggregate in the database — PostgREST caps responses at 1000 rows, so pulling the week (43,401 rows) client-side silently returned only the most recent batch: daily and weekly were identical, 56 riders instead of 111, top score 5 instead of 13, all with a 200 and no error anywhere; a stable SECURITY DEFINER function now does the per-day MAX and weekly sum in-database behind a local-date index, the route falls back to paged aggregation when the migration has not been applied yet rather than serving truncated ranks, and the page is rebuilt with a podium, staggered entry and a skeleton; fix(proxy): register ranking in riderSections — a rider page missing from the whitelist is not rewritten to /rider-app, falls through the strict host-portal binding and bounces to /register, so the page looks broken when only its route was unregistered; the canonical rider domain is app.meponto.com (mall/rider-app/* merely 302s there), so the back office now fills the clean URL and warns on the mall form; also flag the activity card's own enable checkbox, the one switch the earlier cross-checks failed to cover"
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
echo "     · **填一个葡语标题**,例如 Ranking de pedidos 🏆"
echo "       (标题为空的卡从此不再下发 —— 空白框比没有更糟)"
echo "     · 点「保存启动页」"
echo
echo "  3) 【重要】跑迁移让排行榜走快路径:"
echo "     双击 db-migrate.command(首次需 --baseline,见脚本内说明)"
echo "     ⚠️ 迁移没跑的话排行榜接口会直接报错(故意的,不给错数据)"
echo "     跑完再开 /api/rider/leaderboard:"
echo "       · 最高单量应≈20-34(不再是 5),日榜和周榜**不应再相同**"
echo "       · daily.date 应是报表最新一天(昨天),不是今天"
echo
echo "  4) 手机 APP 杀进程重开(首页配置是启动时拉的)"
echo "     → 点活动卡 → **不应再看到启动页**,直接就是榜单"
echo "     → 左上角:WebView 里(没有上一页)**不应出现返回按钮**,用原生关闭键退出"
echo "     → 每行应有一根彩色进度条,末端有实色封口;榜尾也看得见"
echo "     → 首页出现活动卡 → 点进去直接是榜单,不用再登录"
