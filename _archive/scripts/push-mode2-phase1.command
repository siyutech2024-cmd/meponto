#!/bin/bash
# 模式二 Phase 1(服务端,零发版,flag 默认关):
#  S0: riders.pool 字段("standard"|"pro")+ 骑手管理 assign 支持设置 pool
#      + 出入池独立审计(RIDER_POOL_CHANGED)+ rider/home 下发 pool(只增)
#  S1: slots 按池过滤 —— flag MODE2_POOL=on 时生效(Vercel 环境变量,默认关,
#      关闭时行为与现在完全一致)
#  S3: splash 支持 audience:"pro" 定向 —— 服务端按 session 门禁,老版本 APP
#      拿到的直接是 enabled=false,永远不会给普通骑手看到 PRO 欢迎页
#  VPS 实时监控接入口(为下午的 PRO realtime 监控 VPS 预留):
#   - riders-live 每行带 pool + 支持 ?pool=pro 过滤(后台 PRO 监控视图数据口)
#   - 新端点 GET /api/rider/live-count:骑手自查今日实时单量(A3 双口径卡,
#     只回本人一行,无金额字段,30分钟新鲜度门槛)
#  双 VPS 双源隔离(关键修复):
#   - ingest 原来"按批次先删后插"会让两台 VPS 每5分钟互删对方数据;现按
#     (captured_at, source) 隔离,source 由 token 区分:
#       EASTWIND_INGEST_TOKEN      → main(现有 VPS,不用改任何东西)
#       EASTWIND_INGEST_TOKEN_PRO  → pro (新 VPS 的 .env 用这个新 token)
#   - riders-live 取每源各自最新批次做并集(一台落后不遮蔽另一台)
#   - 需要 DDL:snapshots 两表加 source 列(脚本自动执行)
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> DDL:realtime 快照表加 source 维度(幂等,可重复执行)"
DIRECT_URL=$(grep -E '^DIRECT_URL=' .env.local | cut -d= -f2-)
if [ -n "$DIRECT_URL" ] && command -v psql >/dev/null; then
  psql "$DIRECT_URL" -f supabase/migrations/20260806120000_realtime_source_dimension.sql
else
  echo "  !! 未找到 DIRECT_URL 或 psql — 请到 Supabase SQL Editor 手动执行:"
  echo "     supabase/migrations/20260806120000_realtime_source_dimension.sql"
fi

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add docs/mode2-launch-runbook.md docs/mode2-upgrade-closure-matrix.md docs/rider-app-update-plan-v2.md docs/mode2-pro-pool-final-v3.md \
        app/lib/data.ts app/lib/dispatch.ts app/lib/app-config.ts \
        app/api/riders/route.ts app/api/slots/route.ts \
        app/api/rider/home/route.ts app/api/app/rider/splash/route.ts \
        app/api/eastwind/riders-live/route.ts app/api/rider/live-count/route.ts \
        app/api/eastwind/rider-status/route.ts \
        supabase/migrations/20260806120000_realtime_source_dimension.sql \
        push-mode2-phase1.command
git commit -m "mode2 phase1: rider/shift pool field + pool-change audit, pool-filtered slots behind MODE2_POOL flag, audience-gated PRO splash, pool in rider/home payload"
git push origin main

echo "==> 完成。启用步骤:"
echo "  [下午 VPS 上线前,一次性]"
echo "    a. openssl rand -hex 24 生成新 token"
echo "    b. Vercel 加环境变量 EASTWIND_INGEST_TOKEN_PRO=<新token> 并重新部署"
echo "    c. 新 VPS 照 scraper/DEPLOY.md 部署,.env 里 MEPONTO_INGEST_TOKEN 用<新token>"
echo "       (现有 VPS 什么都不用动)"
echo "  [要开模式二时]"
echo "    1. 骑手管理里把 PRO 骑手 pool 设为 pro(自动留审计)"
echo "    2. 排班计划标记 pool=pro(PRO 专属班表)"
echo "    3. Vercel 加 MODE2_POOL=on → 班表按池隔离即刻生效"
echo "    4. 后台 splash 设 audience=pro → 入池欢迎页仅 PRO 可见"
