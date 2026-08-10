#!/bin/bash
# 实时监控列表:按状态优先级排序(业务方 2026-08-10 定"未在线排最前,方便跟进")
#
# 之前列表就是接口返回顺序(≈抓取插入顺序),要人管的骑手散落在各处。
# 现在按跟进优先级排:
#   未上线 → 不及预期 → 不在区域内 → 未知 → 在线 → 配送中
# 逻辑:越需要打电话的越靠前;配送中是最健康的状态,压底。
# 同状态内按名字排,顺序稳定 —— 3 分钟自动刷新不会跳行。
# 状态筛选 chips 不受影响(先筛后排)。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/rider-monitor/page.tsx push-monitor-status-sort.command
git commit -m "feat(monitor): sort the live rider list by follow-up priority — not-online first, then below-expectation, out-of-area, unknown, online, and delivering last, because the list's job is telling operations who to call next and the healthiest riders were interleaved with the ones going unnoticed; ties break by name so the 3-minute refresh never reshuffles rows"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  · 实时监控列表:未上线骑手整块排在最前,配送中沉底"
echo "  · 隔 3 分钟自动刷新,行序稳定不跳"
echo "  · 状态/池筛选 chips 行为不变"
