# First Build — Android Preview APK against ngrok backend

**Date:** 2026-07-06
**Status:** Approved

## Goal

Produce an installable Android APK via `eas build --profile preview` that talks to
the NestJS backend through an ngrok tunnel, with Google Sign-In working and a way to
repoint the backend URL without rebuilding.

**Backend URL for this build:** `https://5310-182-69-181-46.ngrok-free.app`
(ephemeral — changes if ngrok restarts; the in-app override below is the escape hatch.)

## Decisions

- **Platform:** Android only. iOS deferred (no Apple Developer membership yet).
- **Profile:** `preview` (standalone internal distribution; JS bundled, env baked at build time).
- **Backend URL:** bake the ngrok URL as the default AND add an in-app override.
- **App display name:** "Riddhi" (the app). The in-app chatbot persona remains "Munshi" —
  these are distinct; do not conflate.

## Context (current state)

- Expo SDK 56 (managed workflow). EAS configured: projectId in `app.json`,
  owner `ashutoshgairola26`, logged in.
- `eas.json` has `development` / `preview` / `production` profiles, none with `env`.
- Mobile reads the backend URL from `EXPO_PUBLIC_API_URL` in `mobile/src/api/client.ts`
  and `mobile/src/api/chatStream.ts` (module-level `const BASE_URL`).
- Google Sign-In uses `expo-auth-session/providers/google` (`useIdTokenAuthRequest`) in
  `mobile/src/screens/auth/useGoogleAuth.ts`, with web/iOS/Android client IDs from
  `EXPO_PUBLIC_GOOGLE_*`.
- `mobile/.env` is **gitignored**, so EAS builds do not receive its values.
- Backend `main.ts` listens on `PORT` (3000) and CORS reflects any origin in dev; native
  fetch sends no Origin, so no backend change is needed for ngrok.

## Changes

### 1. In-app backend-URL override

Refactor `mobile/src/api/client.ts` and `mobile/src/api/chatStream.ts` so the base URL is
resolved **per call** from a small store rather than a module-level `const` captured at
import time.

- Store: a single value (e.g. key `backend_url_override`) in SecureStore or AsyncStorage.
- Resolution order: stored override → baked `EXPO_PUBLIC_API_URL` → empty.
- Provide a tiny module (e.g. `mobile/src/api/baseUrl.ts`) exposing
  `getBaseUrl()`, `setBaseUrl(url|null)`, and an in-memory cache hydrated on app start so
  the hot path stays synchronous. Both api clients call `getBaseUrl()` when building the
  request URL.
- UI: a "Backend URL" field on an existing settings/dev surface (Settings or the More/Profile
  sheet), shown on internal/non-production builds. Lets the user paste a new ngrok URL and
  clear back to the baked default. Trim trailing slash on save.

Rationale: a standalone build bakes the URL at build time; the override lets an ephemeral
ngrok URL change without a 10–20 min rebuild.

### 2. ngrok interstitial fix

Free ngrok serves an HTML browser-warning page to requests it treats as browsers, returning
HTML where the app expects JSON. Add request header `ngrok-skip-browser-warning: true` to all
requests in `client.ts` (via `buildHeaders`) and `chatStream.ts`.

### 3. EAS env wiring

In `eas.json`, add `env` to the `preview` and `development` profiles:

- `EXPO_PUBLIC_API_URL` = the ngrok URL above.
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`,
  `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` = values from `mobile/.env`.

Without this, the gitignored `.env` never reaches the build and the APK ships with no backend
URL and broken Google sign-in. (These are public client identifiers, safe to commit in
`eas.json`.)

### 4. App display name → "Riddhi"

Set `expo.name` in `app.json` from "mobile" to "Riddhi".

### 5. Build runbook (docs/)

Document the exact sequence:

1. Start Postgres + backend (`PORT=3000`).
2. `ngrok http 3000` → confirm the URL matches the baked value (or set the in-app override).
3. `eas build -p android --profile preview` → install the APK.
4. **Manual Google step:** get the EAS Android keystore SHA-1 (`eas credentials`, Android →
   keystore) and register it in the Android OAuth client in Google Cloud Console. Google
   Sign-In fails on the APK until this SHA-1 is registered.
5. iOS-later notes: add the reversed iOS client-id URL scheme to
   `app.json` (`ios.infoPlist.CFBundleURLTypes`), Apple Developer membership, and
   `eas device:create` for device registration.

## Out of scope

- iOS build/config (deferred).
- Production profile and app-store submission.
- Any backend code change (ngrok-ready as-is).

## Verification

- APK installs on an Android device.
- App loads data from the ngrok backend (not the HTML interstitial).
- Google Sign-In completes end to end (after the SHA-1 is registered).
- Changing the in-app backend-URL override repoints the app to a new URL without a rebuild.
