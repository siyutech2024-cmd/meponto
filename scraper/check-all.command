#!/bin/bash
# 老号抓取链路全面体检 —— 双击运行(需输 VPS 密码,只读,不重启任何东西)
set -e
cd "$(dirname "$0")"
VPS=root@187.77.62.180
scp diag-full.sh $VPS:/tmp/
ssh $VPS 'bash /tmp/diag-full.sh'
echo
echo "==> 若第 4 节显示 debug-last.png 存在,顺手拉回本地供 Claude 查看:"
scp $VPS:/opt/eastwind-scraper/debug-last.png ./debug-last-vps.png 2>/dev/null && echo "已保存到 scraper/debug-last-vps.png" || echo "(无截图可拉,跳过)"
echo "=== 完成:把上面全部输出发给 Claude ==="
