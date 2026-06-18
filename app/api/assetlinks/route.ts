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

function fingerprints(): string[] {
  return (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(/[,\s]+/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
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
