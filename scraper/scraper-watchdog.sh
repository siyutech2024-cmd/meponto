#!/usr/bin/env bash
# VPS 本机看门狗 —— 每 5 分钟由 cron 调用,只读日志 + 必要时重启抓取器
# 判定:班次窗口内,某条抓取线 15 分钟没有 "ingest 200" → 重启它(15 分钟内最多一次)
# 例外:正在 VNC 登录(node login.mjs 在跑)时不动手,避免打断人工重登。
set -u
LOG=/var/log/scraper-watchdog.log
STATE=/tmp/scraper-watchdog.state
STALE_SEC=900
now=$(date -u +%s)
log(){ echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

# 班次窗口(圣保罗时间 10:30-22:30),窗口外不判定
hm=$(TZ=America/Sao_Paulo date +%H%M)
if [ "$hm" -lt 1030 ] || [ "$hm" -ge 2230 ]; then exit 0; fi

# 人工 VNC 登录进行中 → 跳过
if pgrep -f "node login.mjs" >/dev/null 2>&1; then log "login in progress — skip"; exit 0; fi

# 15 分钟内已重启过 → 跳过(防抖)
last_restart=$(cat "$STATE" 2>/dev/null || echo 0)
if [ $((now - last_restart)) -lt "$STALE_SEC" ]; then exit 0; fi

# 取一段日志里最后一条 ingest 200 的时间戳(ISO,scraper 自己打的)
age_of_last_ingest(){ # $1 = 日志文本
  local ts
  ts=$(echo "$1" | grep -a "ingest 200" | tail -1 | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}\.[0-9]+Z" | tail -1)
  if [ -z "$ts" ]; then echo 999999; return; fi
  echo $((now - $(date -u -d "$ts" +%s)))
}

restarted=0
# ── 老号(pm2)
main_log=$(tail -n 400 /root/.pm2/logs/eastwind-scraper-out.log 2>/dev/null)
main_age=$(age_of_last_ingest "$main_log")
main_online=$(pm2 jlist 2>/dev/null | grep -o '"name":"eastwind-scraper"[^}]*"status":"online"' | head -1)
if [ -z "$main_online" ] || [ "$main_age" -gt "$STALE_SEC" ]; then
  log "MAIN stale (last ingest ${main_age}s ago, online=${main_online:+yes}${main_online:-no}) — restarting"
  pm2 restart eastwind-scraper >/dev/null 2>&1 || (cd /opt/eastwind-scraper && pm2 start ecosystem.config.cjs >/dev/null 2>&1)
  restarted=1
fi
# ── PRO(systemd)
pro_log=$(journalctl -u eastwind-scraper-pro -n 400 --no-pager 2>/dev/null)
pro_age=$(age_of_last_ingest "$pro_log")
if ! systemctl is-active --quiet eastwind-scraper-pro || [ "$pro_age" -gt "$STALE_SEC" ]; then
  log "PRO stale (last ingest ${pro_age}s ago, active=$(systemctl is-active eastwind-scraper-pro)) — restarting"
  systemctl restart eastwind-scraper-pro
  restarted=1
fi
[ "$restarted" = 1 ] && echo "$now" > "$STATE"
exit 0
