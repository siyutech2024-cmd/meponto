#!/bin/bash
# 补三个真缺口 —— 业务方 2026-08-06 提问时暴露的
#
# 背景:上一批我说"代码侧没有已知缺口",这是错的。你问「PRO 日报在哪导入 /
# KPI 看板分不分开 / PRO 排班计划在哪建」,三个地方两个不存在、一个是断的。
#
# ── ① PRO 排班表(最严重:整条链路是断的)
#      症状:DispatchShift 有 pool 字段、UI 会显示 PRO 徽章、slots 按池下发、
#            跨池提报拦截、锁班二次校验 —— 但**没有任何入口能把班次标成 PRO**。
#            setWeek/import 都不收 pool,全库 `pool: "pro"` 只出现在骑手身上。
#            结果:建出来的班永远是 standard,上面那一堆判断永远走不到。
#      修法(业务方定:"单独的排班表"):
#        · 排班页顶部加排班表切换(普通 / PRO),切到 PRO 就是独立工作区:
#          四个 tab 看到的、以及新建的班次都属于 PRO 池
#        · 配额与提报跟着班次一起过滤 —— 防止 PRO 班的配额混进普通池视图,
#          否则加盟商会按错误的总数分人头
#        · 服务端 setWeek/import 收 pool
#        · ⚠️ 顺带修了一个最隐蔽的坑:手工建班的 id 是「日期+时段+热区」拼的,
#          不含池。PRO 是独立排班表,同日同时段撞车几乎必然 —— 两边会写进
#          同一条记录、互相覆盖 plannedCount。id 已加 -pro 后缀,查找也按池。
#
# ── ② PRO 日报导入(服务端早就支持,缺的是界面开关)
#      绩效页上传框正上方加「报表来源账号」:旧 OL(普通)/ 新 OL(PRO)。
#      选错池不会报错,数据会静静进另一个池 —— 所以选 PRO 时整块金色高亮,
#      并写明"只记单量,金额一律落库为 0"。
#
# ── ③ KPI 看板分池
#      绩效页 tab 行加 全部/PRO/普通 筛选(?account=)。
#      按行自带的 account 过滤,不回头 join 骑手当前 pool —— 行上的账号记录的是
#      "这条数据出自哪份日报",骑手中途转池时历史行不会被追溯改写。
#      为什么必须分开:PRO 行金额恒为 0,混在一起会把加盟商/站点的人均收入
#      直接拉垮,那个数字会变成假的。
#
# 考核规则按业务方决定不动:同一套阈值,只是分开看数。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/dispatch/route.ts \
        app/api/performance/route.ts \
        app/dispatch/page.tsx \
        app/performance/page.tsx \
        app/lib/i18n.ts \
        push-pro-gaps.command
git commit -m "mode2: close three real gaps found in review — PRO roster is now a separate schedule workspace (setWeek/import accept pool, shift ids carry a pool suffix so PRO and standard can share a slot), daily-report import gets the account selector the T2 backend was already waiting for, and the KPI board can be split by pool so zero-money PRO rows stop dragging down per-rider revenue"
git push origin main

echo
echo "==> 完成。验收:"
echo "  1) 排班页顶部切到「PRO」→ 建一个班 → 该班带 PRO 徽章"
echo "     再切回「普通」→ 看不到刚才那个 PRO 班(两张表互不干扰)"
echo "  2) 同一天同一时段,在两张表各建一个班 → 两条独立记录,人数互不覆盖"
echo "  3) 绩效页导入区选「新 OL(PRO)」→ 导入后该批行金额全为 0"
echo "  4) 绩效页 tab 行点「PRO」→ 只剩 PRO 的数;点「普通」→ 人均收入恢复正常"
echo
echo "  ⚠️ 还差一步配置:Vercel 环境变量 MODE2_POOL=on"
echo "     没有它,骑手端的按池过滤不生效 —— PRO 骑手仍会看到普通池的班次。"
