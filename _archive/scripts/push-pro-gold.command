#!/bin/bash
# PRO 骑手在后台整行标金 —— 混合列表里一眼可辨
#
# 之前只有一个小 PRO 徽章,在几十行里扫过去很容易漏。现在:
#   · 名字变金色 (#eda100,和徽章同色)
#   · 整行一道金色左边框 + 极淡金底 (6% 透明度)
#
# 覆盖四张会出现"PRO 和普通混在一起"的表:
#   · 骑手管理 (app/riders)
#   · 对账/结算 (app/wallet)
#   · 实时监控 (app/rider-monitor)
#   · 绩效 KPI (app/performance)
#
# 两个 DataTable 组件(components/kit 和 components/ui)各加了一个 rowAccent
# 钩子,共用同一套视觉 —— 两张表看起来得是一回事,不能一张描边一张铺底。
#
# 三个刻意的克制:
#  1) 不整行铺满金色。整行铺金会压掉状态色,让"缺 PIX""风险""应岗未上"
#     这些真正需要人立刻处理的标记失效 —— 身份色不该盖住待办色。
#  2) 骑手管理页里,缺 PIX 的警告色**优先于** PRO 金色。缺 PIX 是要马上补的,
#     PRO 只是身份。
#  3) 绩效页按行自带的 account 判定,不回头 join 骑手当前的 pool ——
#     行上的账号记录的是"这条数据出自哪份日报",骑手转池后历史行不该被追溯改色。
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
        push-pro-gold.command
git commit -m "ui(mode2): mark PRO riders in gold across the back office — gold name plus a gold left border and faint tint on the row, in the four tables where PRO and standard riders appear side by side; both DataTable components share one rowAccent hook so the two tables look like the same thing"
git push origin main

echo
echo "==> 完成。验收:"
echo "  1) 骑手管理:PRO 骑手名字金色,整行左侧一道金边"
echo "  2) 同一行如果缺 PIX → 名字应该是警告色而不是金色(待办优先于身份)"
echo "  3) 实时监控 / 对账页 / 绩效页:同样的金名字 + 金边"
echo "  4) 普通骑手的行与改动前完全一致"
