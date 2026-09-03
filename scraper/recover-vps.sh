#!/usr/bin/env bash
# 在 VPS 上执行:立即恢复两条抓取线 + 安装看门狗 + 确保开机自启
echo "======== A. 现场状态 ========"
uptime
free -m | head -2
echo "--- pm2 ---"; pm2 ls
echo "--- PRO systemd ---"; systemctl is-active eastwind-scraper-pro; systemctl is-enabled eastwind-scraper-pro 2>/dev/null
echo "--- OOM 证据(内核日志里被杀的进程) ---"
(dmesg -T 2>/dev/null | grep -iE "out of memory|killed process" | tail -5) || true
(journalctl -k --since "-3 days" --no-pager 2>/dev/null | grep -iE "out of memory|killed process" | tail -5) || true
echo "--- swap ---"; swapon --show 2>/dev/null || echo "(无 swap)"
echo "--- 老号 pm2 重启计数/不稳定标记 ---"; pm2 describe eastwind-scraper 2>/dev/null | grep -E "status|restarts|unstable|uptime" || true
echo "--- 残留的登录/VNC 进程(会锁住浏览器 profile、吃内存) ---"
pgrep -af "login.mjs|Xvfb|x11vnc" || echo "(无)"
echo
echo "======== B. 清理残留(不影响正在运行的抓取器) ========"
pkill -f "node login.mjs" 2>/dev/null && echo "killed leftover login.mjs" || true
pkill -f "Xvfb :99" 2>/dev/null && echo "killed Xvfb" || true
pkill x11vnc 2>/dev/null && echo "killed x11vnc" || true
sleep 1
echo
echo "======== C. 重启两条抓取线 ========"
pm2 restart eastwind-scraper 2>/dev/null || (cd /opt/eastwind-scraper && pm2 start ecosystem.config.cjs)
systemctl restart eastwind-scraper-pro
echo
echo "======== D. 开机自启 + 看门狗 ========"
pm2 save >/dev/null 2>&1 && echo "pm2 save ✓"
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 && echo "pm2 startup ✓"
systemctl enable eastwind-scraper-pro >/dev/null 2>&1 && echo "PRO enable ✓"
install -m 755 /tmp/scraper-watchdog.sh /opt/eastwind-scraper/scraper-watchdog.sh
( crontab -l 2>/dev/null | grep -v scraper-watchdog ; echo "*/5 * * * * /opt/eastwind-scraper/scraper-watchdog.sh" ) | crontab -
if ! swapon --show 2>/dev/null | grep -q .; then
  if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null; fi
  if swapon /swapfile 2>/dev/null; then
    grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
    echo "已加 2G swap(4G 内存跑两个 Chromium 太紧,OOM 保险) ✓"
  else
    echo "⚠ swap 启用失败(VPS 可能不允许 swapfile),跳过"
  fi
fi
echo "看门狗 cron 已安装(每 5 分钟检查,15 分钟无 ingest 自动重启;日志 /var/log/scraper-watchdog.log) ✓"
echo
echo "======== E. 40 秒后看两条线的日志 ========"
sleep 40
echo "--- 老号 ---"; pm2 logs eastwind-scraper --lines 8 --nostream | tail -8
echo "--- PRO ---"; journalctl -u eastwind-scraper-pro -n 6 --no-pager | tail -6
echo
echo "======== 恢复完成 ========"
