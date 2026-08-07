#!/bin/bash
# 修迁移通道的静默吞迁移 bug(20260807 事故复盘)
#
# ── 事故经过
# db-migrate.command 每次都先跑 `npm run migrate:baseline`,而 baseline 的
# 语义是"只登记版本表、不执行 SQL"。于是新迁移 20260807150000 被登记为
# 已应用却从未执行 → migrate 看到 0 待应用,输出"✓ schema 已是最新" ——
# 实际 accept_cnt 列不存在,抓取入库连续 500。
# 已在 SQL 编辑器手工补齐(4 列 + 28.4 万行回填),线上已恢复。
#
# ── 修复
# migrate.mjs baseline 分支加硬守卫:版本表已有记录(基线打过)就直接跳过,
# 新迁移一律交给 migrate 真正执行。静默跳过比报错更危险。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

git add scripts/migrate.mjs push-migrate-guard.command
git commit -m "fix(migrate): baseline is one-shot — db-migrate.command runs baseline before every migrate, and baseline records files as applied without executing them, so any migration added after the first baseline got swallowed silently: recorded, never executed, and migrate then reported the schema up to date while the columns were missing (20260807150000 lost its accept_cnt columns this way and ingest 500ed until a manual patch). Baseline now refuses to run when schema_migrations already has rows"
git push origin main
echo "==> 完成"
