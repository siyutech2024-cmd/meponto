#!/bin/bash
# PRO 结算单显示现金单欠款(业务方 2026-08-11 定,"方便加盟商系统的结算")
#
# ── 根因:PRO 导入把 cashDebt 也清零了
# v3.0 R6"PRO 金额列一律清零"执行得太宽:保密的本意是**薪酬费率**,
# 而现金单欠款是骑手代收的顾客现金 —— 欠加盟商的债务,不是薪酬。
# 清掉它 = 结算时这笔账凭空消失,加盟商只能拿 99 后台手抄核对。
#
# ── 改动(三层)
#   1. 导入:PRO 行保留 cashDebt 原值(其余金额列仍强制清零,费率保密不变)
#   2. 结算接口(weekly):PRO 骑手按窗口累计 cashDebt;
#      行级 cashDebt、加盟商 proCashDebt 小计、全局 proCashDebtTotal
#      —— **纯显示,不改任何入账金额**:PRO 应结仍 = 完单 × 费率,
#      净额(应结 − 欠款)由页面呈现,加盟商照净额打款
#   3. 结算单页面(总部/加盟商同一页,自动同步):
#      · 骑手表加「现金欠款」列(PRO 行红色 −R$x,普通行 —)
#      · 加盟商组头部:PRO 欠款小计(金棕色)
#      · 顶部 PRO 金色 chip:追加 欠款 −R$x · 净额 R$y
#   三语文案齐(zh/en/pt)。
#
# ── ⚠ 已导入的 PRO 日报补数
# 此前导入的 PRO 日报 cashDebt 已被清零存库。导入是幂等 upsert ——
# **重新导一遍同一份表格**即可回填欠款,其他数字不会变。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/performance/route.ts \
        app/api/wallet/route.ts \
        app/wallet/page.tsx \
        app/lib/i18n.ts \
        push-pro-cash-debt.command
git commit -m "feat(wallet): PRO settlement statements surface cash-order debt — the import zeroed every money column on pro rows to keep the per-order rate secret, but cash debt is customer money the rider collected and owes the franchise, not compensation, so wiping it made the liability invisible at settlement time; the import now preserves cashDebt on pro rows while every income column stays zeroed, the weekly settlement aggregates it per rider with franchise sub-totals and a grand total, and the board renders a cash-debt column on rider rows plus net-of-debt figures on the franchise header and the gold PRO chip — display only, no booked amount changes, since pro payable remains orders times rate and the franchise simply pays the net; re-importing an already-loaded pro daily sheet backfills the zeroed debt because the import upserts idempotently"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  1) 结算与提现页:骑手表多「现金欠款」列,PRO 行显示红色 −R\$x"
echo "  2) 加盟商组头部:出现「现金欠款 −R\$x」小计(金棕色)"
echo "  3) 顶部 PRO 金色 chip:PRO R\$a · n单×费率 · 欠款 −R\$x · 净额 R\$y"
echo "  4) 加盟商账号登录:同一页同口径,只见自家数据"
echo "  5) 普通骑手行欠款列为「—」,应结口径不变"
echo
echo "==> 补数(如 PRO 日报已导过):重新导入同一份 PRO 表格即可回填欠款"
