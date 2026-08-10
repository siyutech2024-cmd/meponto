#!/bin/bash
# 实时监控:状态优先级排序 + 地图点位 PRO 金环(业务方 2026-08-10 两条)
#
# ── ① 列表按跟进优先级排序("未在线排最前,方便跟进")
# 之前列表就是接口返回顺序(≈抓取插入顺序),要人管的骑手散落在各处。
# 现在按跟进优先级排:
#   未上线 → 不及预期 → 不在区域内 → 未知 → 在线 → 配送中
# 逻辑:越需要打电话的越靠前;配送中是最健康的状态,压底。
# 同状态内按名字排,顺序稳定 —— 3 分钟自动刷新不会跳行。
# 状态筛选 chips 不受影响(先筛后排)。
#
# ── ② 地图点位区分 PRO("图标也先显示出pro的标志")
# 点位的**填充色**继续表状态(绿配送/蓝在线/灰未上线…),PRO 在此之上
# 加**金色描边环**(加粗加大一号)—— 一个维度一个视觉通道,身份和状态
# 互不挤占。悬浮卡和点击弹窗的名字旁也加金色 PRO 徽章(与列表同款)。
# pool 被入库自动标记流转(普通→PRO)时,已存在点位的环也会跟着更新。
#
# ── ③ KPI 条金色 PRO 副值("显示更简洁一些",业务方选定方案)
# KPI 条保持一行不变,每格下方加一行金色小字(如 完单 997 / PRO 13),
# 与 T+1 看板顶卡的 PRO 小计同一套视觉语言:不加按钮、不加状态、一眼全览。
# PRO 数据存在才渲染(收班/断供时自动消失,不占空行)。
# 只在总部城市视角显示 —— 加盟商/站点的 scopeKpi 已按视角聚合,
# 再叠全网 PRO 会数错对象。数据来自接口新增的 kpiPro 字段
# (见 push-pro-autotag.command 那半边,**两个脚本都要跑**)。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/rider-monitor/page.tsx app/rider-monitor/RiderMap.tsx push-monitor-status-sort.command
git commit -m "feat(monitor): sort the live rider list by follow-up priority — not-online first, then below-expectation, out-of-area, unknown, online, and delivering last, because the list's job is telling operations who to call next and the healthiest riders were interleaved with the ones going unnoticed; ties break by name so the 3-minute refresh never reshuffles rows; feat(monitor): pro riders get a thicker gold ring on their map dots while the fill keeps encoding status — identity and state each own a visual channel instead of fighting over one — with the same gold badge added to the dot's hover card and popup, and rings restyle in place when the ingest auto-tagging flips a rider's pool; feat(monitor): the city KPI strip gains gold PRO sub-values under each pill — same visual language as the T+1 board's stat-card sub-counts, rendered only when the pro feed has a current-shift reading and only on the HQ view since franchise and station scopes already aggregate their own riders"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  · 实时监控列表:未上线骑手整块排在最前,配送中沉底"
echo "  · 隔 3 分钟自动刷新,行序稳定不跳"
echo "  · 状态/池筛选 chips 行为不变"
echo "  · 地图:PRO 骑手点位带金色粗描边环,填充色仍表状态;"
echo "    悬浮/点击点位,名字旁有金色 PRO 徽章"
echo "  · KPI 条(总部视角):每格下方金色小字 PRO 副值(如 PRO 13);"
echo "    需 push-pro-autotag.command 也已推送(kpiPro 字段在那边)"
