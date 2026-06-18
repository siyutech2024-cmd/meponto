#!/usr/bin/env bash
#
# build-twa.sh — build the MePonto Android app (TWA) from app.meponto.com.
#
# Run this on your Mac (NOT in the sandbox). It wraps the live PWA into a
# signed Android App Bundle (.aab) you upload to the Play Console, plus a
# signed .apk for sideload testing.
#
# Usage:
#   cd ~/Documents/MePonto/android
#   ./build-twa.sh
#
# Requirements (the script checks and guides you):
#   - Node.js 18+        (you already have it)
#   - Java JDK 17+       (brew install openjdk@17)
#   - Bubblewrap CLI     (auto-installed if missing; downloads Android SDK on
#                         first run, ~500MB, one time)
#
set -euo pipefail
cd "$(dirname "$0")"

KEYSTORE="android.keystore"
ALIAS="meponto"

echo "==> 1/5  Checking tools"
command -v node >/dev/null || { echo "Node.js missing — install from https://nodejs.org"; exit 1; }
command -v java >/dev/null || { echo "Java JDK missing — run: brew install openjdk@17"; exit 1; }
if ! command -v bubblewrap >/dev/null; then
  echo "    Installing Bubblewrap CLI globally..."
  npm install -g @bubblewrap/cli
fi

echo "==> 2/5  Signing keystore"
if [ ! -f "$KEYSTORE" ]; then
  echo "    No keystore found — creating one. KEEP THIS FILE + PASSWORD FOREVER."
  echo "    (Losing it means you can never update the app on Play Store.)"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 9125 \
    -dname "CN=MePonto, O=MePonto, L=Sao Paulo, C=BR"
else
  echo "    Reusing existing $KEYSTORE"
fi

echo "==> 3/5  Scaffolding / updating the Android project"
if [ ! -f "gradlew" ]; then
  # First run: generate the Android project from the live web manifest, then
  # overlay our tuned twa-manifest.json and regenerate.
  cp twa-manifest.json twa-manifest.reference.json
  bubblewrap init --manifest https://app.meponto.com/manifest.webmanifest
  echo ""
  echo "    >> If init created a fresh twa-manifest.json, restore ours:"
  echo "       cp twa-manifest.reference.json twa-manifest.json && bubblewrap update"
else
  bubblewrap update
fi

echo "==> 4/5  Building the signed bundle"
bubblewrap build

echo "==> 5/5  Your SHA-256 fingerprint (for Digital Asset Links)"
echo "    Set this on Vercel as ANDROID_CERT_FINGERPRINTS, then redeploy:"
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" 2>/dev/null \
  | grep -i "SHA256:" | head -1 | sed 's/.*SHA256: //'

echo ""
echo "Done. Artifacts in this folder:"
echo "  app-release-bundle.aab   -> upload to Play Console (Production/Internal testing)"
echo "  app-release-signed.apk   -> install on a phone to test (adb install ...)"
echo ""
echo "Next: see README.md section 'After the build'."
