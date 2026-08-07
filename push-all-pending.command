#!/bin/bash
# 一次推完所有待上线改动(替代 push-pro-gold / push-leaderboard 两个脚本)
#
# ═══════════════════════════════════════════════════════════
# 一、PRO 骑手后台标金
# ═══════════════════════════════════════════════════════════
# 之前只有一个小 PRO 徽章,几十行里扫过去容易漏。现在名字变金色 + 整行一道
# 金色左边框 + 6% 淡金底,覆盖四张"PRO 和普通混在一起"的表:
# 骑手管理 / 对账结算 / 实时监控 / 绩效 KPI。
#
# 两个 DataTable 组件(components/kit 和 components/ui)各加了 rowAccent 钩子,
# 共用同一套视觉 —— 否则一张描边一张铺底,看着像两个系统。
#
# 三处刻意克制:
#  1) 不整行铺满金色 —— 会压掉状态色,让"缺 PIX""风险""应岗未上"这些
#     真正要立刻处理的标记失效。身份色不该盖住待办色。
#  2) 骑手管理页里缺 PIX 的警告色**优先于** PRO 金色。
#  3) 绩效页按行自带的 account 判定,不查骑手当前 pool —— 骑手转池后,
#     他之前在普通池跑的历史行不该被追溯染金。
#
# ═══════════════════════════════════════════════════════════
# 二、骑手排行榜(每日 / 每周订单榜)
# ═══════════════════════════════════════════════════════════
# 业务方定的口径:一张总榜(PRO 标金)、显示全名、数据用实时抓取快照、
# 周 = 自然周(周一→周日,下个整周从 2026-08-10 开始)。
#
# ⚠️ 实现上唯一容易写错的地方(已处理):
#   快照字段 finished_cnt 是**当日累计**不是增量。一天十几个批次,直接 SUM
#   会把每个人放大十几倍,排名彻底失真。正确:每人每天取 MAX,周榜再把
#   每天的 MAX 相加。
#
# 新增/改动:
#  · GET /api/rider/leaderboard —— 直连快照表聚合,不进内存层
#      - 开关关闭时返回 enabled:false,老客户端也绕不过(服务端说了算)
#      - 榜单截到 topN,但**本人名次永远附带**,哪怕排在榜外
#  · weekWindow() 从 api/assessment 提到 lib/assessment,
#    **排行榜和考核页共用同一个"周"** —— 各写一份迟早漂移,
#    骑手说"我这周第 3"时运营查到的必须是同一个周
#  · 主后台 APP 配置页:总开关 / 日榜 / 周榜 / 显示前 N 名
#  · H5 页 /rider-app/ranking
#
# ⚠️ 这张 H5 页**故意不用 readSession()/localStorage**:
#   它主要在 APP 的内嵌 WebView(A5)里打开,而 WebView 注入的只有
#   meponto_session **cookie**,localStorage 是另一套存储。照抄别的
#   rider-app 页面用 readSession() 判断登录,页面在 APP 里会一律显示
#   "请先登录"。改为纯 cookie 认证,由服务端告诉页面"你是谁、第几名"。
#
# ✅ 已验证的登录链路(APP 内打开不用再登录):
#    APP 的 API 地址 = https://mall.meponto.com/api/ → 会话 cookie 存在 jar 里的
#    host 就是 mall.meponto.com;injectSession() 正好从这个域读出来,写进 WebView
#    时 Domain 写成 .meponto.com(覆盖主域和所有子域)。SameSite=Lax 在顶层导航
#    时允许带 cookie,页面内又是同源 fetch —— 全程无阻。
#
# ⚠️ 活动卡的 linkURL 必须填 mall.meponto.com,不要填 meponto.com:
#    页面里调的是相对路径 /api/rider/leaderboard,请求会打到"谁在 serve 这个
#    页面"那个域上。mall.meponto.com 确认在跑 Next 应用、也是 API 所在的域,
#    同源;换个域可能页面能开但接口 404。
#      正确 → https://mall.meponto.com/rider-app/ranking
#
# 💡 由此得出:排行榜**不需要发新版 APP**。活动卡(A4)+ WebView(A5)
#    在 v2.6 里已经具备,以后做抽奖、任务、榜单季都走这条路径,都不用发版。
#    前提:v2.6 先上架 —— v2.4 用户没有活动卡,看不到入口(不报错,只是看不见)。
#
# ═══════════════════════════════════════════════════════════
# 三、后台闭环补强(复核时发现四处断点)
# ═══════════════════════════════════════════════════════════
# 功能都在,但"运营明天怎么用"这条链上有四个坑,补齐:
#
#  ① 活动卡 linkURL 纯手填,最容易错在**域**上
#     → 加「填入排行榜地址」一键按钮 + 「预览这个链接」直接新标签打开
#     → 填了 https://meponto.com/rider-app/… 会警告应改用 mall 域
#        (页面调的是相对路径 /api/…,请求打到 serve 页面的那个域;
#         填错域会"页面能开、接口 404")
#
#  ② 活动卡开关和排行榜开关分处两块、互不知情 —— 运营一定会踩:
#     → 卡指向排行榜但排行榜没开 → 卡片下方黄字警告
#     → 排行榜开了但没有卡指过去 → 排行榜区块黄字警告(骑手没有入口)
#
#  ③ ranking 页没有返回入口。WebView 顶部有 X,但在浏览器里打开就出不去
#     → 加 Voltar(history.back(),两种场景都成立)
#
#  ④ 没有打开率埋点。方案里要看"有多少人真的点进来",没这个数就没法
#     判断排行榜有没有用、要不要继续投入
#     → GA4 事件 leaderboard_open(gtag 由 layout 注入,WebView 里同样统计得到)
#
# ═══════════════════════════════════════════════════════════
# 本期明确不做(业务方 2026-08-07)
# ═══════════════════════════════════════════════════════════
#  · R10 进出池阈值(D4)、加盟商提名审批流(D5) —— 先人工按周执行
#  · 工单分类字段 —— 暂不加
#  · 参与奖账本化 —— 等活动口径
#  · PRO 霸榜后的"本站点榜"(D2) —— 不加
#  · 显示全名的隐私口径(D3) —— 不考虑
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/components/kit.tsx \
        app/components/ui.tsx \
        app/riders/page.tsx \
        app/wallet/page.tsx \
        app/rider-monitor/page.tsx \
        app/performance/page.tsx \
        app/lib/app-config.ts \
        app/lib/assessment.ts \
        app/api/assessment/route.ts \
        app/api/app/rider/splash/route.ts \
        app/api/rider/leaderboard/route.ts \
        app/app-config/page.tsx \
        app/rider-app/ranking/page.tsx \
        docs/activity-leaderboard-plan.md \
        push-all-pending.command
git commit -m "ui(mode2): gold PRO rows across the back office; feat(leaderboard): daily and weekly order rankings — per-rider per-day MAX (finished_cnt is a running total, summing the day's batches would inflate everyone), natural Mon-Sun week shared with the assessment page so riders and ops mean the same week, main back-office toggle, and an H5 page that authenticates purely by cookie so it works inside the app WebView without a new release"
git push origin main

echo
echo "==> 完成。验收:"
echo
echo "  【PRO 标金】"
echo "   1) 骑手管理:PRO 骑手名字金色,整行左侧一道金边"
echo "   2) 同一行如果缺 PIX → 名字应是警告色而非金色(待办优先于身份)"
echo "   3) 实时监控 / 对账页 / 绩效页:同样的金名字 + 金边"
echo
echo "  【排行榜】"
echo "   4) APP 配置页 → 勾上「骑手排行榜」→ 保存"
echo "   5) 浏览器登录骑手账号后打开 mall.meponto.com/rider-app/ranking"
echo "      → 应看到 Hoje / Esta semana 两个 tab,PRO 行金色,自己那行高亮"
echo "   6) 抽一个人核对:他今天的单量应等于当天快照里的最大 finished_cnt,"
echo "      不是各批次之和(后者会大十几倍)"
echo "   7) 周榜日期区间应是本周一–周日(本周 08-03~08-09,下周 08-10~08-16)"
echo "   8) 关掉开关 → 页面显示「O ranking está desativado」"
echo
echo "  【后台闭环】"
echo "  10) 活动卡点「填入排行榜地址」→ URL 自动填好;点「预览这个链接」能打开"
echo "  11) 卡指向排行榜但排行榜开关没开 → 卡片下方出现黄色警告"
echo "  12) 排行榜开了但活动卡没指过去 → 排行榜区块出现黄色警告"
echo "  13) ranking 页左上角有 Voltar 可返回"
echo
echo "  【上线活动卡】v2.6 上架后:"
echo "   9) APP 配置页 → 活动卡 linkURL 填"
echo "      https://mall.meponto.com/rider-app/ranking   ← 必须是 mall 这个域"
echo "      → APP 首页点卡片 → 在 APP 内打开且能看到自己的名次(说明 cookie 注入生效)"
