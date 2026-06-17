#!/usr/bin/env bash
# Interactive login ON the VPS via a virtual display + VNC, so the Eastwind/99
# session is created from the VPS's own IP (the copied desktop session is not
# accepted from a different IP).
#
# Run on the VPS, inside the scraper dir, in an interactive SSH session:
#   cd /opt/eastwind-scraper && bash vnc-login.sh
#
# Then, from your Mac (separate terminal), tunnel + open a VNC viewer:
#   ssh -L 5900:localhost:5900 root@187.77.62.180 -N
#   open vnc://localhost:5900            # macOS Screen Sharing
# Log in in the VNC window until you see the rider board, then come back to the
# SSH terminal running this script and press Enter.
set -e

echo "==> installing xvfb + x11vnc"
apt-get update -y >/dev/null
apt-get install -y xvfb x11vnc >/dev/null

echo "==> stopping scraper (frees the browser profile)"
pm2 stop eastwind-scraper || true
pkill -f "Xvfb :99" 2>/dev/null || true
pkill x11vnc 2>/dev/null || true
sleep 1

export DISPLAY=:99
echo "==> starting virtual display :99"
Xvfb :99 -screen 0 1440x900x24 >/tmp/xvfb.log 2>&1 &
sleep 2

echo "==> starting VNC on localhost:5900 (reach it through the SSH tunnel)"
# macOS Screen Sharing refuses no-auth VNC, so set a password.
VNC_PW="eastwind99"
x11vnc -storepasswd "$VNC_PW" /tmp/.vncpw >/dev/null 2>&1
x11vnc -display :99 -localhost -rfbport 5900 -rfbauth /tmp/.vncpw -forever -bg >/tmp/x11vnc.log 2>&1
echo "    VNC password: $VNC_PW"

cat <<'TXT'

============================================================
VNC is ready. Now, on your Mac (a SEPARATE terminal):
  ssh -L 5900:localhost:5900 root@187.77.62.180 -N
Then open the viewer:
  open vnc://localhost:5900
A browser window will show the 99/Didi login. Log in by hand
until you see the rider board. Then return HERE and press Enter.
============================================================

TXT

HEADLESS=false DISPLAY=:99 node login.mjs

echo "==> session saved. Restarting scraper..."
pm2 restart eastwind-scraper
echo "Done. Check:  pm2 logs eastwind-scraper --lines 10 --nostream"
