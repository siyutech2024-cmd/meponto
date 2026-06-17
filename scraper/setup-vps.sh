#!/usr/bin/env bash
# One-shot VPS setup for the Eastwind scraper (Ubuntu 22.04/24.04).
# Run from inside the scraper directory AFTER the files (incl. .env and
# .eastwind-profile) are present:
#
#   cd /opt/eastwind-scraper && bash setup-vps.sh
#
set -euo pipefail

# Use sudo only when not already root (Hostinger VPS logs in as root).
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

echo "==> 0/5 base tools"
$SUDO apt-get update -y
$SUDO apt-get install -y curl ca-certificates

echo "==> 1/5 Node 20 LTS"
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 18 ]; then
  if [ -n "$SUDO" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
  else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  fi
  $SUDO apt-get install -y nodejs
fi
node -v

echo "==> 2/5 npm deps"
npm install

echo "==> 3/5 Playwright + Chromium (with system libs)"
$SUDO npx --yes playwright install --with-deps chromium

echo "==> 4/5 pm2"
$SUDO npm install -g pm2

echo "==> 5/5 sanity checks"
[ -f .env ] || { echo "!! .env missing — copy it from your Mac first"; exit 1; }
[ -d .eastwind-profile ] || { echo "!! .eastwind-profile missing — rsync it from your Mac (it holds the login session)"; exit 1; }
grep -q "MEPONTO_INGEST_TOKEN=db1e" .env || echo "?? check MEPONTO_INGEST_TOKEN in .env matches the server"

echo
echo "Starting under pm2..."
pm2 start ecosystem.config.cjs
pm2 save
echo
echo "Run the line pm2 prints below to enable boot-autostart:"
pm2 startup
echo
echo "Done. Follow logs with:  pm2 logs eastwind-scraper"
