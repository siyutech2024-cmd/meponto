#!/bin/bash
# 未上线骑手也入清单 + 查 Boa Vista 抓取器为什么 11:39 后停了 —— 双击运行(第 2 步输 VPS 密码)
#   1) 发布网站:看板上的所有骑手(FL + 先锋,不论在不在线)都建档进 Boa Vista 清单;
#      不在线骑手不再被「热区外」过滤掉(他们的 GPS 是旧位置)
#   2) 只读查看 Boa Vista 抓取器日志(不重启任何东西)
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock
echo "==> 1/2 发布网站"
npm run codex:preflight
git add app/api/eastwind/rider-status/route.ts push-offline-riders-and-check.command
git commit -m "fix(boavista): every rider on the Boa Vista board goes on the riders list — the roster binding runs over all parsed riders (FL + pioneer, any status) before the area filter, and not-online riders (stale last position) are no longer dropped by the area filter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Fo2xoFt1cNfzxqpziCU7eE"
git push origin main
set +e
echo
echo "==> 2/2 Boa Vista 抓取器日志(输 VPS 密码)"
ssh root@187.77.62.180 'echo "服务: $(systemctl is-active eastwind-scraper-sjbv)  VPS时间: $(date -u +%H:%M) UTC"; ls -la /opt/eastwind-scraper-sjbv/eastwind-rider-status.mjs*; journalctl -u eastwind-scraper-sjbv --since "-6 hours" --no-pager | grep -E "pioneer|ingest|LOGIN|ALERT|nothing|starting|Error|error|failed|city" | tail -30'
echo
echo "=== 完成:把上面全部输出发给 Claude ==="
