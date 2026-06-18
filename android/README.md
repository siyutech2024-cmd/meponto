# MePonto — Android app (TWA)

This packages the live PWA at **app.meponto.com** into a Play Store Android app
using a **Trusted Web Activity (TWA)**. The app is a thin native shell that opens
app.meponto.com full-screen (no browser bar). There is no separate native
codebase to maintain — the app always shows the current website, so every web
deploy updates the app instantly.

## What's in this folder

| File | Purpose |
|---|---|
| `twa-manifest.json` | Bubblewrap config (package id, colors, icons, shortcuts). Source of truth. |
| `build-twa.sh` | One-command build: keystore → project → signed `.aab` + `.apk`. |
| `.gitignore` | Keeps the keystore and build artifacts OUT of git. |

The `assetlinks.json` that proves you own app.meponto.com is **already wired in
the web app** — it's served from `/.well-known/assetlinks.json` (route:
`app/api/assetlinks/route.ts`). You only need to feed it your key fingerprint
(step 4 below).

---

## Prerequisites (Mac, one time)

```bash
brew install openjdk@17          # Java 17 (Bubblewrap needs 17+)
# Node 18+ you already have.
```

Bubblewrap downloads the Android SDK itself on first run (~500 MB, one time).

---

## Build

```bash
cd ~/Documents/MePonto/android
./build-twa.sh
```

The script will:

1. Install the Bubblewrap CLI if missing.
2. Create `android.keystore` if you don't have one (it asks you to set a
   password — **write it down and back up the file; losing it means you can
   never update the app**).
3. Scaffold the Android project (first run is interactive — accept defaults,
   keep Application ID `com.meponto.app`).
4. Produce a signed bundle and apk.
5. Print your SHA-256 fingerprint for the next step.

Outputs in this folder:

- `app-release-bundle.aab` → upload to Play Console.
- `app-release-signed.apk` → `adb install app-release-signed.apk` to test on a phone.

> First run only: if Bubblewrap's `init` overwrites `twa-manifest.json` with a
> bare version, restore ours and re-sync:
> ```bash
> cp twa-manifest.reference.json twa-manifest.json && bubblewrap update && bubblewrap build
> ```

---

## After the build — verify ownership (CRITICAL)

The TWA only opens full-screen (instead of in a browser tab) if
`/.well-known/assetlinks.json` lists your app's signing fingerprint.

1. Copy the **SHA-256** printed at the end of the build (format
   `AB:CD:EF:...:90`, 32 byte-pairs).
2. On **Vercel** → MePonto project → Settings → Environment Variables, add:
   - `ANDROID_CERT_FINGERPRINTS` = that SHA-256 string
   - (optional) `ANDROID_PACKAGE_NAME` = `com.meponto.app` (already the default)
3. **Redeploy** so the change takes effect.
4. Confirm it's live:
   ```bash
   curl https://app.meponto.com/.well-known/assetlinks.json
   ```
   You should see your package and fingerprint.

### When you use Play App Signing (recommended)

Google re-signs your app with its own key. After your first upload, go to
**Play Console → Setup → App signing** and copy **both** SHA-256 values
("App signing key certificate" and "Upload key certificate") into
`ANDROID_CERT_FINGERPRINTS`, comma-separated, then redeploy. Otherwise the
installed Play version won't verify and will show the URL bar.

---

## Upload to Play Store

1. Play Console → your app → **Production** (or **Internal testing** first).
2. Create a release, upload `app-release-bundle.aab`.
3. Reuse the store listing assets you already prepared (screenshots +
   pt-BR description).
4. Roll out. Internal testing is the fastest way to validate the TWA verifies
   and opens chrome-less on a real device.

---

## Updating later

- **Content / features:** just deploy the website. The app updates itself; no
  rebuild or resubmission needed.
- **App icon, name, colors, shortcuts, or version:** edit `twa-manifest.json`,
  bump `appVersionCode` (+1) and `appVersionName`, then re-run `./build-twa.sh`
  and upload the new `.aab`.

## Notes

- `enableNotifications: true` lets the TWA deliver web push (the site already
  registers a service worker at `/sw.js`). Push still requires your web push
  setup to be configured; harmless if unused.
- Package id `com.meponto.app` is permanent once published — choose carefully
  (it's already set; don't change it after the first upload).
