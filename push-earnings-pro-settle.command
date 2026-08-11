#!/bin/bash
# T+1 看板「收入结算」:PRO 显示推导结算额(业务方 2026-08-11 截图指出全是 R$0)
#
# ── 根因
# 该视图直接汇总表格金额,而 PRO 行金额按设计恒为 0(v3.0 R6)。
# 费率推导的金额(完单 × HqProRate)此前只在钱包周结里算,这个视图没接。
#
# ── 改动
#   1. 接口(DB 直读 + 内存两条路径同改):PRO 行的展示结算额
#      = 完单 × HqProRate —— 与钱包周结同一费率配置(mall-config),
#      两处数字永远一致。骑手行、加盟商/站点汇总、结算合计卡自动跟上。
#      只改读出的展示值,事实表/JSONB 里的 0 一个字节不动。
#   2. 防重复记账:该页的逐骑手「标记打款」排除 PRO 行 ——
#      PRO 的钱走加盟商整体转账(钱包周结,净额=应结−现金欠款),
#      不逐骑手日结;选中 PRO 行会被计入"跳过"而不是打款。
#
# 现金欠款列此前已在该视图显示(截图里 Quality R$55.08 就是),不动。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/performance/route.ts app/performance/page.tsx push-earnings-pro-settle.command
git commit -m "feat(kpi): the earnings-settlement view shows PRO derived amounts — pro sheet rows carry zero money by design, so the board summed zeros and answered the reasonable question of what HQ owes the franchise with R\$0.00; the read path now derives the display settle as orders times HqProRate from the same mall-config the weekly wallet uses so the two boards can never disagree, applied in both the direct-read and legacy paths with rider rows, franchise and station groups and the total card following automatically while the stored zeros stay untouched; the per-rider daily mark-paid on this tab now excludes pro rows because pro money moves as one net franchise transfer on the weekly board and a derived per-rider figure must not become a second payment path"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收(收入结算 tab,PRO 筛选,08-10):"
echo "  1) 结算合计卡:R\$ 0 → 217 单 × 费率(默认 12 → R\$ 2604.00)"
echo "  2) 按加盟商汇总:Quality 86 单 → R\$ 1032.00;Clayton 131 单 → R\$ 1572.00"
echo "  3) 现金欠款列照旧(Quality R\$ 55.08);转给加盟商的数 = 钱包周结净额"
echo "  4) 勾选 PRO 骑手点「标记打款」→ 计入跳过,不产生打款记录"
echo "  5) 普通池数字与之前完全一致"
