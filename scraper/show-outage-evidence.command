#!/bin/bash
# 断流时段取证:两次断流(9/2 21:59、9/3 11:21 圣保罗时间)前后,VPS 上发生了什么 —— 只读
VPS=root@187.77.62.180
ssh $VPS 'bash -s' <<'REMOTE'
echo "======== 1. 昨晚 21:40-22:20(UTC 00:40-01:20)老号日志 ========"
grep -a "2026-09-03T00:[45]\|2026-09-03T01:[01]" /root/.pm2/logs/eastwind-scraper-out.log | grep -av "outside shift" | tail -25
echo
echo "======== 2. 今天 11:10-12:25(UTC 14:10-15:25)老号日志 ========"
grep -a "2026-09-03T14:[1-5]\|2026-09-03T15:[0-2]" /root/.pm2/logs/eastwind-scraper-out.log | tail -30
echo
echo "======== 3. pm2 自己的事件记录(stop/restart/start,带时间) ========"
grep -a "eastwind-scraper" /root/.pm2/pm2.log | grep -aiE "stop|start|restart|exited|kill" | tail -25
echo
echo "======== 4. 最近手动执行过的命令(vnc-login / pm2 / 抓取器相关) ========"
grep -aE "vnc-login|pm2 |login.mjs|eastwind" /root/.bash_history 2>/dev/null | tail -20
echo
echo "======== 5. 最近 SSH 登录时间 ========"
last -n 12 2>/dev/null | head -12
REMOTE
echo "=== 完成:整段发给 Claude ==="
