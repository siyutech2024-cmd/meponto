#!/bin/bash
# 收尾批次:三级 KPI 副值同步 + 一笔漏网的旧修复(2026-08-10)
#
# ⚠️ 只跑这一个 —— 之前四个脚本(pro-autotag / monitor-status-sort /
# ranking-pro-badge / today-pro-badge)都已推送,git log 已确认,别重复跑。
#
# ── ① 加盟商/站点 KPI 条的 PRO 副值(总部那份已上线,这是补齐三级)
# 总部副值 = kpiPro(PRO 账号城市读数);加盟商/站点副值 = scopeKpiPro:
# **自家 PRO 骑手**按 scope 同一套 Eastwind 公式单独聚合 ——
# 谁看都只数自己的,不会把全网 PRO 错标到自家头上。
#
# ── ② 修 bug:未上线卡虚高(用户 2026-08-10 实锤"这个数据肯定不对")
# 状态归类把 "Ausente"(离开/挂起)并进了未上线 —— 但 DB 实查:Ausente
# 骑手有 28 分钟在线 + 28 分钟休息记录,是**登录后的暂离状态**。
# 看板显示 23,真实未上线只有 19(主号 18 + PRO 1),多出的 4 全是 Ausente。
# 修法:Ausente 归"在线"档(与 Em pausa 同类)。
# 修完:未上线卡 = 99 官方看板 Não está online 的原数,一一对得上。
#
# ── ③ 漏网修复:骑手端"我的状态"同日双行合并
# push-kpi-pro-series 当天写的最后一处小修,脚本跑在前、改动写在后,
# 一直悬在工作区没提交:骑手周中入池、同一天有 main+pro 两行时,
# "我的状态"只取其中一行,单量偏少。合并同日所有行,
# 百分率复用 aggregateKpis(与看板同一口径)。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/api/eastwind/riders-live/route.ts \
        app/rider-monitor/page.tsx \
        app/api/performance/route.ts \
        push-scope-pro-sub.command
git commit -m "feat(monitor): franchise and station portals get their own gold PRO sub-values on the KPI strip — aggregated from just that scope's pro riders with the same Eastwind formulas as the scope KPI itself, while HQ keeps the pro account's city reading, so every portal's sub-value counts its own fleet; fix(monitor): Ausente is not offline — the status classifier filed the away state under not-online, inflating that card past what the 99 board itself shows, but an Ausente rider carries online and rest minutes (28/28 in the batch that exposed it) so it now lands in the online bucket beside Em pausa and the not-online card matches Não está online exactly; fix(rider-app): my-status merged same-date rows — a rider entering the pool mid-week carries a main and a pro row for the same day and showing one row undercounted their orders, so all rows of the latest date are combined with rates recomputed via aggregateKpis to keep a single formula across app and board"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  1) 加盟商账号登录实时页:KPI 条金色副值 = 自家 PRO 的数"
echo "     (Clayton 家 5 个 PRO,副值就只数这 5 个)"
echo "  2) 站点账号同理;总部视角与现在一致(全网 PRO)"
echo "  3) 骑手 APP「我的状态」:入池骑手当日单量 = main+pro 之和"
echo "  4) 【本次主诉】实时页未上线卡应与 99 官方 Não está online 同数"
echo "     (Ausente 的人挪到了在线档;当下这批应为 19,不再是 23)"
