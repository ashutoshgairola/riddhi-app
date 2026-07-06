# Android build runbook (preview APK against ngrok)

## Prerequisites
- Logged into EAS: `eas whoami` (should show `ashutoshgairola26`).
- Backend runnable locally on port 3000; Postgres up.
- ngrok installed.

## 1. Start backend + tunnel
```bash
# terminal A
cd backend && npm run start:dev    # listens on :3000

# terminal B
ngrok http 3000                    # note the https URL
```
If the ngrok URL differs from the one baked into the build
(`https://5310-182-69-181-46.ngrok-free.app`), you have two choices:
- rebuild with the new URL in `eas.json`, or
- after install, open **Settings → Developer → Backend URL**, paste the current
  ngrok URL, and tap Save (no rebuild).

## 2. Build the APK
```bash
cd mobile
eas build -p android --profile preview
```
Download and install the resulting APK on the device.

## 3. Register the Android Google OAuth SHA-1 (one-time, REQUIRED for sign-in)
Google Sign-In fails on the APK until the EAS Android keystore's SHA-1 is
registered on the Android OAuth client.
```bash
cd mobile
eas credentials      # Android → (preview) → Keystore → view; copy SHA-1
```
Then in Google Cloud Console → APIs & Services → Credentials → the **Android**
OAuth client (`...kcl22...`): set package name `com.ashutoshgairola.riddhi`
and paste the SHA-1. Save; allow a few minutes to propagate.

## 4. Verify end to end
- App opens as **Riddhi**.
- Data loads from the backend (not an ngrok HTML warning page).
- Google Sign-In completes.
- Settings → Developer → Backend URL repoints the app without a rebuild.

## iOS (later)
- Needs an Apple Developer Program membership + `eas device:create` for device UDIDs.
- Add the reversed iOS client-id URL scheme to `app.json`
  (`ios.infoPlist.CFBundleURLTypes`): `com.googleusercontent.apps.868348586460-9hff23rcol3u5av46fb5mv9q966jvc2g`.
- Then `eas build -p ios --profile preview`.
