#!/bin/bash
# T+1 考核看板:PRO 金色曲线 + PRO 数据单独显示(总部/加盟商/站点三视角同步)
#
# ═══════════════════════════════════════════════════════════
# ⚠️ 顺带排掉一个下周必炸的雷(这部分比曲线重要)
# ═══════════════════════════════════════════════════════════
# T+1 事实表 t1_rider_daily_kpis / t1_rider_daily_earnings 是 W2 时建的,
# 当时定了 UNIQUE (rider99_id, date),而且**没有 account 列**。
# 模式二的 PRO 日报行 id 是 kpi-pro-<date>-<id> —— 同一骑手同一天两行。
# 后果:下周一第一次导 PRO 日报,双写进事实表就撞唯一约束**直接报错**;
# 就算不撞,表里也分不出谁是 PRO,?account=pro 过滤永远筛不出东西。
# 这个雷埋在"PRO 数据下周才有"的时间差里,今天不修下周就炸。
#
# 迁移 20260807130000_t1_account_dimension.sql:
#   · 两表加 account 列(默认 main,存量行语义正确)
#   · 唯一约束换成 (rider99_id, date, account)
#   · perf_trend_t / perf_trend 两个趋势函数都输出 proOrders
# 配套:performance-repo 的行映射带上 account(不带的话列永远是默认值)。
#
# ═══════════════════════════════════════════════════════════
# ⚠️ 第二个雷:加盟商/站点视角的趋势曲线一直是**全网数据**(用户实测发现)
# ═══════════════════════════════════════════════════════════
# Clayton 加盟商登录:顶部卡片 47 人 / 400 单(已按视角过滤),
# 趋势图末点却写着「完单 957 | R$ 7901」—— 全网的数。站点视角同样。
# 根因:趋势查询(perf_trend / perf_trend_t)从来没接过 franchise/station 参数。
#
# 修法:两个趋势函数加可选参数 p_rider_ids text[]。骑手→加盟商/站点的归属
# 存在 riders 档案里(不在事实表),所以由接口先取档案、算出"自家骑手的
# 99ID 数组"传进去过滤;总部视角传 NULL 不过滤。内存兜底路径同一口径。
# 注意:旧的单参数函数必须 DROP —— 同名不同签名是重载,并存时
# PostgREST 按参数名调用会报 "function is not unique"。
#
# ═══════════════════════════════════════════════════════════
# 看板改动(三个视角是同一段代码,自动同步)
# ═══════════════════════════════════════════════════════════
# · 趋势图:PRO 金色曲线(#eda100),与总完单**共用同一坐标轴** ——
#   PRO 是总数的一部分,同轴才能直接读出占比;分轴会把两条线画一样高,误导。
#   右下角末点标签加"PRO n"。
# · 顶部卡:骑手数、完单两张卡加金色小字"PRO n" —— 不另开第八张卡,
#   否则会有人把总数和 PRO 相加。
# · 站点 / 加盟商分组表:骑手数、完单列附金色 PRO 小计。
# · 全部按"PRO 数据存在才显示":金线、图例、小字在 PRO 导入前一概不出现,
#   一条贴 0 的金线只会引人来问。
#
# Stat 组件的 hint 从 string 放宽为 ReactNode(共享组件,最小无破坏改动)。
#
# ═══════════════════════════════════════════════════════════
# 执行顺序(重要)
# ═══════════════════════════════════════════════════════════
#  1. 本脚本(推代码)
#  2. **db-migrate.command**(应用迁移 —— 不跑的话唯一约束还是旧的,雷还在)
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add supabase/migrations/20260807130000_t1_account_dimension.sql \
        app/lib/server/db/performance-repo.ts \
        app/lib/performance.ts \
        app/api/performance/route.ts \
        app/performance/page.tsx \
        app/components/kit.tsx \
        push-kpi-pro-series.command
git commit -m "feat(kpi): gold PRO series on the T+1 board — trend line on the shared orders axis so the share is readable, PRO sub-counts on the stat cards and the station/franchise group tables, all rendered only once PRO data exists; fix(kpi): the 30-day trend ignored the franchise/station scope entirely — a franchise whose cards said 400 orders saw a curve ending at the network-wide 957, so both trend functions take an optional rider-id array resolved from the rider profiles (ownership lives there, not in the fact tables) and the old single-arg functions are dropped to avoid PostgREST overload ambiguity; fix(t1): the fact tables carried UNIQUE(rider99_id,date) with no account column, so the first PRO daily import (same rider, same day, second row) would have violated the constraint outright — account is now a real column in the key and the row mappers carry the field so the dimension survives the round trip"
git push origin main

echo
echo "==> 完成。接着跑 db-migrate.command(必须,否则唯一约束还是旧的)"
echo
echo "==> 验收(PRO 日报导入之前):看板应与现在完全一样,没有任何金色元素"
echo "==> 验收(下周 PRO 日报导入之后):"
echo "    1) 趋势图出现金色 PRO 曲线,右下角有「PRO n」"
echo "    2) 顶部「骑手数」「完单」卡出现金色 PRO 小字"
echo "    3) 站点/加盟商 tab 的骑手数、完单列出现金色 PRO 小计"
echo "    4) 用加盟商、站点账号各登录看一次 —— 数字应只含自家骑手"
echo "    ★) 【现在就能验】加盟商账号登录:趋势图末点应≈自家完单(Clayton ≈400),"
echo "       不再是全网 957;顶卡与曲线终于说同一件事"
echo "    5) 导入不报错(唯一约束已带 account 维度)"
