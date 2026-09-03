#!/bin/bash
# 一键:立即恢复两条抓取线 + 安装 VPS 本机看门狗(以后自己恢复) —— 双击运行,需输 VPS 密码
set -e
cd "$(dirname "$0")"
VPS=root@187.77.62.180
scp scraper-watchdog.sh recover-vps.sh $VPS:/tmp/
ssh $VPS 'bash /tmp/recover-vps.sh'
echo "=== 完成:把上面输出发给 Claude(A 段的 uptime 会告诉我们昨晚是不是重启了)==="
