#!/bin/bash
# 模式二规则升级:新 Eastwind(PRO 账号)看板上的骑手 = PRO 骑手,自动标记
# (业务方 2026-08-10 定,PRO 抓取器当天首次产出数据后)
#
# ── ① 入库自动标记(档案层)
# PRO 抓取器每批入库时,把这批骑手的档案 pool 批量置 'pro'
# (RPC eastwind_autotag_pro,DB 端定点 UPDATE)。从此 PRO 名单不用人工维护:
# 运营在新 Eastwind 账号下加了骑手,3 分钟内档案自动变 PRO,
# 排班过滤、提报、配额、看板全部自动跟上。
# 幂等;失败不阻塞入库(下一批自动补)。不创建档案、不整表写回 ——
# 避开 7/21 过期内存写回事故那类风险;没建档的骑手仍走人工建档队列。
#
# ── ② 实时页行级 pool 认 source(显示层)
# 之前每行的池只看档案匹配 —— 新看板上没建档/没标记的骑手会被误归普通池。
# 现在快照 source=pro 直接定池,档案匹配只是补充。
#
# ── ③ 顺手排雷:KPI 条分源统计(PRO 上线当天就会发作)
# 实时页 KPI 条把两个源的 rider_kpi_snapshots 混成一个序列做换班检测。
# PRO 城市计数是个位数,混进主号几百的序列,"计数明显回落"判定被反复
# 误触发,班段起点乱跳。现在按源分组各自检测:计数(接单/完单)可加
# (两账号骑手集不相交),比率(AR/CAA/%TSH/超时)取主导源(完单多者=主号)。
#
# ═══ 执行顺序 ═══
#  1. 本脚本(推代码)
#  2. **db-migrate.command 立刻跑**(建 RPC;没跑之前入库会在结果里带
#     autoTagError,快照本身不受影响)
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add supabase/migrations/20260810120000_pro_autotag_rpc.sql \
        app/api/eastwind/rider-status/route.ts \
        app/api/eastwind/riders-live/route.ts \
        push-pro-autotag.command
git commit -m "feat(mode2): riders on the new Eastwind board ARE pro riders — presence on the PRO account's board is now the source of truth for pool membership, so each pro-source ingest batch auto-tags the matched rider profiles via a targeted in-database update (idempotent, non-blocking, no profile creation and no full-collection write-back, avoiding the 7/21 stale-memory class of incident) and the live board derives the row's pool from the snapshot source directly so an unprofiled rider on the pro board can never be misfiled as standard; fix(realtime): the KPI strip mixed both sources' city counters into one series, and the pro account's single-digit readings tripped the counter-fallback shift detection against the main account's hundreds on every interleave — the strip now detects the current slot per source, sums the addable counts across the disjoint fleets, and takes rates from the dominant source"
git push origin main

echo
echo "==> 完成。接着跑 db-migrate.command(建 RPC)"
echo
echo "==> 验收(部署 + 迁移完成后):"
echo "  1) 实时监控页 PRO 筛选:8 人全在(现在就对,因为名单是批量建档过的)"
echo "  2) 【关键】在新 Eastwind 账号下新增一个测试骑手 → 3 分钟内:"
echo "     · 实时页该骑手直接显示在 PRO 池(即使档案还是普通/没建档)"
echo "     · 骑手档案页该骑手 pool 自动变 PRO(已建档的情况)"
echo "  3) KPI 条数值稳定,不再受 PRO 小计数干扰(接单/完单为两源之和,"
echo "     比率仍为主号读数)"
