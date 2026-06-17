#!/usr/bin/env bash
# Interactive login ON the VPS via a virtual display + password-protected VNC.
# Run inside tmux so it survives SSH disconnects:
#   ssh root@187.77.62.180
#   tmux new -s login
#   cd /opt/eastwind-scraper && bash novnc-login.sh
# (reconnect later:  ssh root@187.77.62.180 ; tmux attach -t login)
set -e

echo "==> installing xvfb + x11vnc"
apt-get update -y >/dev/null
apt-get install -y xvfb x11vnc >/dev/null

echo "==> cleanup previous"
pm2 stop eastwind-scraper || true
pkill -f "Xvfb :99" 2>/dev/null || true
pkill x11vnc 2>/dev/null || true
sleep 1

export DISPLAY=:99
echo "==> virtual display :99"
nohup Xvfb :99 -screen 0 1440x900x24 >/tmp/xvfb.log 2>&1 &
sleep 2

VNC_PW="eastwind99"
x11vnc -storepasswd "$VNC_PW" /tmp/.vncpw >/dev/null 2>&1
x11vnc -display :99 -localhost -rfbport 5900 -rfbauth /tmp/.vncpw -forever -bg >/tmp/x11vnc.log 2>&1
sleep 2
if ss -ltn | grep -q ":5900"; then
  echo "    x11vnc listening on 5900 OK"
else
  echo "!! x11vnc NOT listening:"; tail -8 /tmp/x11vnc.log; exit 1
fi

cat <<TXT

============================================================
On your Mac (separate terminal) open the tunnel:
   ssh -L 5901:localhost:5900 root@187.77.62.180 -N
Then connect a VNC viewer to  localhost:5901   (password: $VNC_PW)
   - macOS:  open vnc://localhost:5901
   - or RealVNC Viewer / TigerVNC -> localhost:5901
You'll see the 99/Didi login in the VPS browser. Log in until you
see the rider board, then return to THIS tmux pane and press Enter.
============================================================

TXT

HEADLESS=false DISPLAY=:99 node login.mjs

echo "==> session saved. Restarting scraper..."
pkill x11vnc 2>/dev/null || true
pm2 restart eastwind-scraper
sleep 40
pm2 logs eastwind-scraper --lines 8 --nostream
