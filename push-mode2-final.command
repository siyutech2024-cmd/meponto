#!/bin/bash
# 模式二 PRO 池 · 一次性上线包(T2 + T1/T6 + T3 + T5 + T7 + N1)
#
# 这一个脚本代替下面 5 个,双击这一个就够了:
#   push-mode2-t2 / t1-ui / t3 / t5 / t7-app  ← 都已合并进来,不用再单独跑
#
# ── T2 双源导入(新 OL 报表通道)
#      · POST /api/performance 带 account:"main"|"pro"
#      · PRO 行只记单量,所有金额字段强制为 0(v3.0 R6)
#      · 幂等键 = 账号+日期+骑手;缺 account 写 IMPORT_SOURCE_MISSING 审计
# ── T1/T6 三级后台(设计从简,不新增菜单)
#      · 骑手列表:PRO 筛选 + 姓名旁 PRO 徽章 + 批量标记 + CSV 多一列 Pool
#      · 实时监控:全部/PRO/普通 三个 chip + 行内 PRO 徽章
#      · 排班/加盟商/站点:PRO 班次标 PRO 徽章
#      · 开屏配置:受众可选「仅 PRO」
# ── T3 结算分池(v3.0 R5 三级口径)
#      · 总部→加盟商 = PRO 单量 × 单均(默认 R$12,商城配置 hqProRatePerOrder)
#      · 对账页 PRO 小计 chip、分组 PRO 单量/金额、行内 PRO 徽章
#      · 骑手端永远不出现 PRO 单价
# ── T5 锁班(与 99 无关,PontoSys 主后台自己配置)
#      · 手动:填报工作台每行「锁定名单/解锁」+ 日分组「锁定整天 ×N」
#      · 自动:cron /api/cron/lock-shifts 每天 18:00(圣保罗)锁次日名单
#      · 锁后 站点/加盟商提报、骑手自助报名与取消 一律 409
#      · 仅总部可锁/解锁,解锁需二次确认,全程写审计
#      · 加盟商/站点页班次旁显示 🔒,不用猜为什么提交不了
# ── T7 APP v2.6(versionCode 19,含此前并入的 GA4)
#      · PRO 徽章 / 入池欢迎页 / 首页单量双口径卡(昨日确认 + 今日实时)
#      · 卡内无任何金额,底部提示「请与加盟商核对工资」
# ── N1 PWA 钱包 PRO 分支
#      · PRO 骑手不再看到余额/提现(原来永远 R$ 0,00,像是钱被吞了)
# ── §9 PRO 名单建档(新增)
#      · 骑手管理页批量抽屉内「导入名单并建档为 PRO」
#      · 每行 99ID / 姓名 / CPF / 电话,列顺序不限;已存在的只改池不重复建档
#      · 仅总部可用,审计 RIDER_PRO_ROSTER_IMPORTED
# ── H4 锁班前二次池校验(新增)
#      · 名单里混了已出池的人 → 锁定被拦截并列出人名
#      · 可选「强制锁定」,强制会写 Medium 风险审计
# ── T4 两套名额独立(新增)
#      · 加盟商配额卡副标题显示 PRO 小计,PRO 班与普通班分开算,防混拆
# ── T6 应岗未上 + PRO 在线数(新增)
#      · 实时看板红条:已锁名册 ∩ 不在实时快照;名册未锁整块隐藏,不误报
#      · "在岗"卡副标题显示 PRO 在线数(为 0 不显示)
# ── R10 周考核分池(新增)
#      · 考核页周切换旁 pool chip(全部/PRO/普通)
#      · 新 OL 缺 AR 时规则对 null 不加不减 → 自动降级为出勤+完单
# ── A4 活动入口卡(新增,原定 v2.7,提前并入 v2.6)
#      · 后台:APP 配置页(开屏下方)配 标题/副标题/角标/图片/链接/受众/起止日期
#      · 服务端:受众与生效窗口在 rider/home 里判定 —— 过期卡不依赖手机时钟
#      · APP:首页卡片,点击站内进内嵌容器、站外跳系统浏览器
#      · 活动结束服务端下发 null,客户端真的清掉(不会挂在首页下不掉)
# ── A5 WebView 会话注入(新增,硬性三条全部满足)
#      · ① 白名单:只有 *.meponto.com 在 APP 内打开,其余一律系统浏览器
#      · ② CookieManager 注入,Domain 写死 .meponto.com(不跟随 URL)
#      · ③ 活动 H5 自带 CSP —— 服务端责任,验收时一并核对
#      · 另:allowFileAccess/allowContentAccess 关闭,第三方 cookie 关闭
# ── 倒扣待扣账本(新增,原遗留项)
#      · 结算为负 = 骑手当天倒欠(现金单欠款/餐损),以前只被显示层过滤掉,
#        系统里查不到"谁还欠多少"
#      · 对账页出现红色「待扣 R$X(N 人)」→ 抽屉里逐条或整人核销
#      · 账本铁律:导入金额一个字不改,核销只加了结标记;待扣余额永远现算
#      · 仅总部可核销,每笔写 Medium 风险审计 RIDER_DEDUCTION_SETTLED
# ── GA4 属性拆分(2026-08-06)
#      · MePonto 从 descu 共用的 descuai 属性里独立出来:新建 GA 账号 MePonto
#        → 属性 MePonto(São Paulo 时区 / BRL)→ Web + Android 两类流同属性
#      · 网站 Measurement ID 换成 G-2F6D6V9CK8(旧的 G-SKT4QZV5RV 停用)
#      · Firebase 项目已重新关联到新属性;App ID 未变,google-services.json 不用换
#      · 以前网站和 descu 的数据混在一个属性里,任何"MePonto 有多少用户"都是虚高的
# ── 数据库迁移通道闭环(新增)
#      · scripts/migrate.mjs:node-postgres 直连 DIRECT_URL,不再依赖 psql 二进制
#      · schema_migrations 版本表 + 每文件单事务 + 校验和漂移告警
#      · 双击 db-migrate.command 即可;首次会自动打基线(19 个历史迁移只登记不执行)
#      · 起因:旧脚本靠 `command -v psql`,这台 Mac 没有 → 永远静默跳过,
#        代码先上线、DDL 后补,线上可能读一个不存在的列
# ── 验收清单(新增文档)
#      · docs/mode2-acceptance-checklist.md:T8 四链路 + T9 演练 + 六项普通池回归
#
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检(module:guard + build)"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/dispatch/route.ts \
        app/api/mall/route.ts \
        app/api/performance/route.ts \
        app/api/riders/route.ts \
        app/api/slots/route.ts \
        app/api/wallet/route.ts \
        app/api/cron/lock-shifts/route.ts \
        app/api/rider/home/route.ts \
        app/api/app/rider/splash/route.ts \
        app/app-config/page.tsx \
        app/assessment/page.tsx \
        app/components/kit.tsx \
        app/dispatch/page.tsx \
        app/dispatch/franchise/page.tsx \
        app/dispatch/station/page.tsx \
        app/lib/app-config.ts \
        app/lib/data.ts \
        app/lib/dispatch.ts \
        app/lib/i18n.ts \
        app/lib/mall.ts \
        app/lib/performance.ts \
        app/rider-app/wallet/page.tsx \
        app/rider-monitor/page.tsx \
        app/riders/page.tsx \
        app/wallet/page.tsx \
        vercel.json \
        package.json \
        package-lock.json \
        scripts/migrate.mjs \
        db-migrate.command \
        docs/mode2-acceptance-checklist.md \
        docs/mode2-upgrade-closure-matrix.md \
        android-rider-app/app/src/main/java/com/meponto/rider/data/AppStore.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/RiderRepository.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/remote/ApiService.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/data/remote/Dtos.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/i18n/Localization.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/RootScaffold.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/HomeScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/WebViewScreen.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/ShiftsScreen.kt \
        push-mode2-final.command
git commit -m "mode2 PRO pool complete + A4/A5 + deduction ledger: dual-source import, three-tier pool UI, pool-split settlement, shift locking (+pool re-check), PRO roster onboarding, rostered-but-offline panel, pool-split weekly assessment, app v2.6 PRO surface, PWA wallet branch"
git push origin main

echo "==> 构建 APP v2.6 (versionCode 19) release AAB"
cd android-rider-app
./gradlew bundleRelease

echo
echo "==> 全部完成!"
echo "    网站:Vercel 自动部署,约 2 分钟"
echo "    AAB:android-rider-app/app/build/outputs/bundle/release/app-release.aab"
echo "         → Play Console 上传 v2.6 (versionCode 19)"
echo
echo "    上线后验收:"
echo "      1) 骑手列表点 PRO 筛选 → 只剩标记过的 PRO 骑手"
echo "      2) 填报工作台锁一个班次 → 站点端该班次出现 🔒 且提报被拒"
echo "      3) 导入新 OL 报表(account=pro)→ 对账页出现 PRO 小计,骑手端看不到单价"
echo "      4) PRO 账号打开 APP → 见 PRO 徽章 + 双口径单量卡,无任何金额"
echo "      5) 骑手管理 → 批量抽屉 → 粘贴新 OL 名单 → 一键建档为 PRO"
echo "      6) APP 配置页开启活动卡 → APP 首页出现,点击站内链接在 APP 内打开"
echo "      7) 活动卡填一个非 meponto.com 链接 → 点击应跳到系统浏览器"
echo "      8) 对账页若有红色「待扣」→ 点开抽屉能逐条核销,核销后金额不变、条目消失"
echo "      9) 普通账号从头到尾界面与现在完全一致(回归)"
echo "     10) GA4:打开 meponto.com → MePonto 属性实时报表几分钟内出现活跃用户"
echo
echo "    完整验收按 docs/mode2-acceptance-checklist.md 走一遍。"
