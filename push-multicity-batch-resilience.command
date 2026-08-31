#!/bin/bash
# 多城市抓取:同轮同批次 + 崩溃自愈 + KPI 分城统计(2026-08-31 全面检查结论)
#
# ── 三个根因
#   1. 看板跳变(开营前必修):两城各打各的批次时间戳,而实时看板只取每源
#      "最新一批" —— São João 一有骑手,主号最新批将在两城间交替,看板每
#      3 分钟在"只见 SP"和"只见 SJ"之间跳。
#   2. 崩溃躺平:8/31 VPS 重启后浏览器上下文死掉,抓取器既不能进程内恢复
#      也没退出,静默 66 分钟直到人工重启(8/28 同签名崩溃一次)。
#   3. KPI 串城:riders-live 的 KPI 只按"源"分组,新城小读数会被换班检测
#      误判、并可能以"最新有读数批次"身份顶掉主城读数。
#
# ── 修法(三层各一刀)
#   scraper: round() 生成唯一 capturedAt 传给每城;ctx.newPage 抛错不再卡死
#            pulling 标志;检测到 browser closed 类致命错误直接 exit(1) 交给
#            pm2 秒级拉起 —— 与挂死看门狗同一策略
#   ingest:  delete 范围 (captured_at, source) → (captured_at, source, city_id),
#            同批次里两城共存而不是后到者清掉先到者;单城 feed 行为不变
#   riders-live: KPI 分组键 source → source|city,主导读数仍取完单最多的组
#            (即主城),计数合计现在跨源跨城求和;另 findKpiRecord 容错解析
#            多城市数组形态的 KPI payload(8/28 只显示 PRO 的根因防复发)
#
# ── 部署顺序(本脚本按此执行)
#   ① 预检 → ② 提交推送(Vercel 先上 ingest,向后兼容旧抓取器)
#   ③ rsync 抓取器到 VPS 并 pm2 重启(需输 VPS 密码)
set -e
cd "$(dirname "$0")" || exit 1
rm -f .git/index.lock

echo "==> 1/3 Web 预检"
npm run codex:preflight

echo "==> 2/3 提交并推送(仅本次相关文件)"
git add scraper/eastwind-rider-status.mjs \
        app/api/eastwind/rider-status/route.ts \
        app/api/eastwind/riders-live/route.ts \
        app/lib/eastwind.ts \
        docs/eastwind-multicity-plan.md \
        push-multicity-batch-resilience.command
git commit -m "fix(scraper+ingest+live): multi-city rounds share one batch key with city-scoped idempotent deletes — each city used to stamp its own capture minute, so the live board (latest batch per source) would flip between cities the moment São João gains riders; fix(scraper): a closed browser context now exits for a clean pm2 restart instead of sitting silent (66-min outage on 2026-08-31 after a VPS reboot killed Chromium mid-round), and a newPage failure no longer wedges the pulling flag; fix(live): KPI rows group by source AND city so the new city's small counters neither confuse the shift-slot detection nor displace the main city's headline rates, day totals now sum across cities; fix(lib): findKpiRecord tolerantly unwraps the multi-city per-city-array KPI payload shape (root cause of the 2026-08-28 PRO-only KPI strip)"
git push origin main

echo "==> 3/3 抓取器上 VPS(需输 VPS 密码;只动老号 pm2 实例,PRO 不碰)"
scp scraper/eastwind-rider-status.mjs root@187.77.62.180:/opt/eastwind-scraper/
ssh root@187.77.62.180 'pm2 restart eastwind-scraper && sleep 25 && pm2 logs eastwind-scraper --lines 12 --nostream'

echo
echo "==> 完成。验证:"
echo "  · 上面日志应出现两城各一条 ingest 200,且 capturedAt 相同"
echo "  · sys.meponto.com/rider-monitor 在班骑手 = SP+SJ 合计,3 分钟后仍稳定"
