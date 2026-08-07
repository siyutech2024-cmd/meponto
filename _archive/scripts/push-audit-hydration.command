#!/bin/bash
# 审计日志退出冷启动水合 —— 砍掉 74% 的启动内存
#
# 起因:每个 serverless 冷实例启动都会把整张 app_state_records 拉进内存。
# 实测 auditEntries 39,888 行 / 10 MB,占全部行数的 74%,却从不参与任何业务
# 计算 —— 要查一个骑手今天的 KPI,先得把三年审计日志搬一遍。那次 Postgres
# OOM 最可能就是这么被顶上去的(实测 CPU 只有 1%,纯内存尖峰)。
#
# 改了什么:
#  · persistence.ts:HYDRATION_EXCLUDED = {auditEntries}
#      - 在数据库侧就 .neq 掉,连传输都省(不是拉回来再丢)
#      - 水合循环里整个跳过,特别避开"数据库没有就把种子推上去"那条分支
#      - refreshCollectionsFromDatabase 也拒绝它,防止谁顺手又拉回来
#      - 排查用后门:HYDRATE_AUDIT_ENTRIES=true 可临时恢复旧行为
#  · 写入语义不变:appendServerAudit 照旧 push,flush 逐条 upsert,
#    不会碰数据库里的历史行
#  · 审计页改为直读数据库(倒序,默认 200 条,?limit= 上限 1000),
#    再和本实例内存里的新条目按 id 去重合并 —— 刚做完的操作立刻能看到
#  · ⚠️ 关键连带修复:appendServerAudit 原本用 `memory.auditEntries.length + 1`
#    生成 id。审计不再水合后内存长度会从 0 重新数,每次冷启动都从 aud-1 开始,
#    upsert 会**覆盖数据库里的历史审计**。已改成时间戳+随机后缀。
#
# 同批还带上:
#  · Kotlin 编译修复(v2.6 AAB 已用这两个修复构建成功):
#      - RiderSnapshot 补 activityCard 字段 + DTO→Snapshot 映射
#        (之前只给 RiderHomeDto 加了字段,中间隔着一层映射没接上)
#      - HomeScreen 补 import LaunchedEffect
#        (连带解决"suspend 函数只能在协程里调用" —— LaunchedEffect 解析不了时,
#         编译器把那个 lambda 当普通 lambda)
#  · app/layout.tsx:GA4 换成新属性 MePonto 的 G-2F6D6V9CK8
#  · app/api/assessment/route.ts:R10 周考核分池(pool 参数)
#
# 不动的:数据库档位没升(实测 used 34% / CPU 1% / 连接 23-of-120,不危险),
# CORE_MODE 也没切(要走 dualwrite 观察 7 天的正规流程,不和模式二挤同一周)。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/lib/server/persistence.ts \
        app/lib/server/memory.ts \
        app/api/audit/route.ts \
        app/layout.tsx \
        app/api/assessment/route.ts \
        android-rider-app/app/src/main/java/com/meponto/rider/data/RiderRepository.kt \
        android-rider-app/app/src/main/java/com/meponto/rider/ui/screens/HomeScreen.kt \
        build-app-log.command \
        push-audit-hydration.command
git commit -m "perf(persistence) + app build fixes: exclude auditEntries from cold-start hydration (74% of rows, never used in business logic); audit page reads the DB directly; fix audit id generation that would overwrite history once memory no longer holds the full collection"
git push origin main

echo
echo "==> 完成。Vercel 自动部署,约 2 分钟。"
echo "    验收:"
echo "      1) 审计页照常显示历史记录(现在是直读数据库,默认 200 条)"
echo "      2) 随便做一个操作(比如改一个骑手的站点)→ 刷新审计页能立刻看到那条"
echo "      3) Supabase → Observability → Database:观察冷启动时的内存尖峰是否变小"
echo "         (对比基准:改之前 Memory usage 3.74 GB / commit 3.05 of 3.23 GB)"
echo
echo "    然后:Play Console 上传 v2.6 (versionCode 19)"
echo "      android-rider-app/app/build/outputs/bundle/release/app-release.aab (26 MB)"
