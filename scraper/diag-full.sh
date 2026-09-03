#!/usr/bin/env bash
# 老号抓取链路全面体检 —— 在 VPS 上执行,只读不改
echo "======== 1. pm2 进程状态 ========"
pm2 ls
echo
echo "======== 2. 老号日志 · 最近 120 行 ========"
pm2 logs eastwind-scraper --lines 120 --nostream | tail -130
echo
echo "======== 3. 断流时段关键行(hang/empty/LOGIN/ingest 非200/alert) ========"
grep -aE "hung|nothing captured|LOGIN_REQUIRED|ALERT|ingest [^2]|ingest 2[^0]|error" \
  /root/.pm2/logs/eastwind-scraper-out.log /root/.pm2/logs/eastwind-scraper-error.log 2>/dev/null | tail -30
echo
echo "======== 4. 出错截图 debug-last.png ========"
ls -la /opt/eastwind-scraper/debug-last.png 2>/dev/null || echo "(不存在 —— 说明没走到“nothing captured”分支)"
echo
echo "======== 5. 系统资源 ========"
uptime; free -m | head -2; df -h / | tail -1
echo
echo "======== 6. 老号配置(隐去密钥) ========"
grep -vE "TOKEN|KEY|PASS" /opt/eastwind-scraper/.env 2>/dev/null
echo
echo "======== 7. PRO 实例对照 · 最近 10 行 ========"
journalctl -u eastwind-scraper-pro -n 10 --no-pager 2>/dev/null | tail -10
echo
echo "======== 体检结束 ========"
