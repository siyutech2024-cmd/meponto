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
#   3. 结算单页面(总部/加盟商/站点同一页,自动同步):
#      · 骑手表加「现金欠款」列(PRO 行红色 −R$x,普通行 —)+「净额」列
#      · 加盟商组头部:PRO 欠款小计 + 净额(金棕色)
#      · 顶部 PRO 金色 chip:追加 欠款 −R$x · 净额 R$y;总额旁并列净额
#   三语文案齐(zh/en/pt)。
#
# ── 追加(业务方 2026-08-11 第二条):结算按净额 + 池筛选 + 站点视角
#   4. **净额成为结算口径**:骑手待付 = (应结 − 现金欠款) − 已付;
#      加盟商待付 = (应结合计 − PRO 欠款合计) − 已付。
#      打款弹窗预填、待付/超付徽章、顶部待付合计全部按净额。
#      应结与欠款各自保持原值可追溯,只有"该打多少款"变成净额。
#   5. 池筛选 chips(全部 / PRO / 普通):筛表格展示行,空组自动隐藏;
#      组头部金额保持加盟商全量 —— 免得"看着 PRO 筛选打了全额款"。
#   6. 修站点视角漏洞:weekly 只按加盟商 scope 过滤,**站点账号能看到全网
#      结算数据** —— 现在站点会话只见本站骑手,scoped 标记同步。
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
git commit -m "feat(wallet): PRO settlement surfaces cash-order debt and settles on the net — the import zeroed every money column on pro rows to keep the per-order rate secret, but cash debt is customer money the rider collected and owes the franchise, not compensation, so wiping it made the liability invisible at settlement time; the import now preserves cashDebt on pro rows while every income column stays zeroed, the weekly settlement aggregates it per rider with franchise sub-totals and grand totals, and net-of-debt is now the operative figure everywhere money moves: rider pending, franchise pending, overpaid detection, and the payment dialog prefill all compute from settle minus cash debt while the gross and the debt stay separately visible for auditability; the board gains all-PRO-standard pool chips that filter the displayed rows without touching the franchise-level header amounts so a filtered view can never justify a full-amount payment, and a station-session hole is closed where the weekly view only pinned franchise scope and let a station portal read the network-wide settlement board; re-importing an already-loaded pro daily sheet backfills the zeroed debt because the import upserts idempotently"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  1) 骑手表:「现金欠款」列(PRO 行红色 −R\$x)+「净额」列(=应结−欠款)"
echo "  2) 待付/打款:全部按净额 —— PRO 骑手待付 = 净额−已付;"
echo "     加盟商待付 = 净额合计−已付;打款弹窗预填即净额"
echo "  3) 工具栏:全部/PRO/普通 chips 筛表格;顶部总额旁显示净额(有欠款时)"
echo "  4) 加盟商账号登录:只见自家;站点账号登录:只见本站(此前是全网!)"
echo "  5) 普通骑手行欠款列「—」,应结口径不变"
echo
echo "==> 补数(如 PRO 日报已导过):重新导入同一份 PRO 表格即可回填欠款"
