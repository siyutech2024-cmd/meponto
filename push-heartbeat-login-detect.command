#!/bin/bash
# 2026-09-03 取证结论落地:假警报 + 真故障两类修复
#
# ── 假警报(昨晚 21:59 → 今早 10:59 "780 分钟未更新")
#   骑手快照只在看板有人时才有行,收班后/开班前的空看板和"抓取器死了"长得
#   一模一样,横幅还附送"需重新登录"。改用 KPI 行(每轮必写)做心跳,横幅文案
#   改为先重启、日志见 LOGIN_REQUIRED 才重登。
# ── 真故障(今天 11:21 → 12:15)
#   ① 11:21-12:07 日志空白 46 分钟:page.evaluate/title 在 didi 登录页的跳转
#      循环里无限挂起,进程内看门狗靠"下一轮 tick"触发,tick 也被拖住。改:所有
#      无超时的 Playwright 调用加 bounded();每城一个独立计时器硬上限 7 分钟。
#   ② 12:07 起每轮 "nothing captured" 而不是 LOGIN_REQUIRED:看板是客户端二次
#      跳转到 didi pc-login,首次 URL 检查看不到。改:settle 后再查一次 URL。
#   ③ 看门狗:日志见 LOGIN_REQUIRED 时不做无意义重启。
set -e
cd "$(dirname "$0")" || exit 1
rm -f .git/index.lock
VPS=root@187.77.62.180

echo "==> 1/3 Web 预检"
npm run codex:preflight

echo "==> 2/3 提交并推送(仅本次相关文件)"
git add app/api/eastwind/riders-live/route.ts app/rider-monitor/page.tsx app/lib/i18n.ts \
        scraper/eastwind-rider-status.mjs scraper/scraper-watchdog.sh scraper/show-outage-evidence.command \
        push-heartbeat-login-detect.command
git commit -m "fix(live+monitor): scraper liveness now comes from the per-round KPI row instead of rider snapshots, so an empty board (after the last shift, before the first) no longer reads as a dead scraper — the banner claimed 780 stale minutes and demanded a re-login after a night of healthy 0-rider rounds; the banner copy now says restart first and re-login only on LOGIN_REQUIRED; fix(scraper): the didi pc-login bounce happens client-side after domcontentloaded, so the URL is re-checked after settle and reported as LOGIN_REQUIRED instead of 'nothing captured'; every timeout-less Playwright call (evaluate/title) is bounded and each city gets an independent 7-minute hard limit, because a redirect loop left page.evaluate pending and the feed silent for 46 minutes with no tick to fire the in-round watchdog; ops(watchdog): skip the restart when the log shows LOGIN_REQUIRED

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UiRPyfnXq7EH3PVnK1BAtd"
git push origin main

echo "==> 3/3 抓取器 + 看门狗上 VPS(需输 VPS 密码;只动老号,PRO 不碰)"
scp scraper/eastwind-rider-status.mjs scraper/scraper-watchdog.sh $VPS:/opt/eastwind-scraper/
ssh $VPS 'chmod 755 /opt/eastwind-scraper/scraper-watchdog.sh && pm2 restart eastwind-scraper && sleep 30 && pm2 logs eastwind-scraper --lines 8 --nostream | tail -8'
echo
echo "==> 完成。验证:日志有 ingest 200;监控页收班后不再报'已掉线'"
