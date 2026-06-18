/**
 * Digital Asset Links for the Android TWA (Trusted Web Activity).
 *
 * Served at https://app.meponto.com/.well-known/assetlinks.json (the proxy
 * rewrites that path to this route). It links the web origin to the Android
 * package so Chrome opens the TWA full-screen (no browser URL bar).
 *
 * The signing-key fingerprint(s) come from the env var ANDROID_CERT_FINGERPRINTS
 * (SHA-256, colon-separated hex). Multiple keys (e.g. your upload key AND the
 * Play App Signing key) are comma- or whitespace-separated. Get them with:
 *   keytool -list -v -keystore android.keystore -alias meponto | grep SHA256
 * and, after upload, copy the "App signing key certificate" SHA-256 from
 * Play Console → Setup → App signing.
 */

const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME ?? "com.meponto.app";

// Upload-key fingerprint from the PWABuilder package that signed MePonto.aab.
// Kept as the built-in default so the published app verifies even before any
// env var is set. If you enroll in Play App Signing, ADD Google's "App signing
// key certificate" SHA-256 via the ANDROID_CERT_FINGERPRINTS env var (comma
// separated) — both fingerprints are then served.
const DEFAULT_FINGERPRINT = "0F:66:36:18:59:D0:18:84:68:5D:49:1E:67:F3:1B:0E:F9:3F:3A:F5:7B:79:A7:13:51:1B:C1:28:BB:80:85:6A";

function fingerprints(): string[] {
  const fromEnv = (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(/[,\s]+/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  // Built-in default first, then any extra keys (e.g. Play App Signing), deduped.
  return [...new Set([DEFAULT_FINGERPRINT, ...fromEnv])];
}

export function GET() {
  const sha256 = fingerprints();
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: sha256,
      },
    },
  ];

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Asset Links must be cacheable but not stale forever — 1h is plenty.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
