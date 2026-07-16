# Android First Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable Android preview APK (`eas build --profile preview`) that reaches the NestJS backend through an ngrok tunnel, with a runtime backend-URL override so an ephemeral ngrok URL never forces a rebuild.

**Architecture:** The two mobile API clients stop capturing the backend URL at import time and instead resolve it per-call from a tiny store module (`baseUrl.ts`) that overlays a persisted override on top of the baked `EXPO_PUBLIC_API_URL`. A dev-only Settings card edits that override. EAS build profiles carry the `EXPO_PUBLIC_*` values (the gitignored `.env` never reaches EAS). All requests send an `ngrok-skip-browser-warning` header so free-ngrok returns JSON, not its HTML interstitial.

**Tech Stack:** Expo SDK 56 (managed), React Native, TypeScript (strict), AsyncStorage, EAS CLI.

## Global Constraints

- **Expo SDK 56** — before touching any Expo/RN API, verify against the versioned docs at `https://docs.expo.dev/versions/v56.0.0/` (repo rule in `mobile/AGENTS.md`).
- **No mobile unit-test harness exists** (no jest, no test files). Verification for each task is `cd mobile && npx tsc --noEmit` passing, plus the explicit manual check stated in the task. Do **not** scaffold jest — out of scope.
- **Backend URL for this build:** `https://5310-182-69-181-46.ngrok-free.app` (ephemeral).
- **Naming:** the app is **"Riddhi"**; the in-app chatbot persona is **"Munshi"**. Never rename the app to Munshi or the bot to Riddhi.
- **TypeScript strict** is on (`mobile/tsconfig.json`) — no implicit `any`, handle `null`.
- **Commit prefs:** do NOT add a `Co-Authored-By` trailer. Commit as author email `gairola.ashutosh26@gmail.com` (e.g. `git -c user.email=gairola.ashutosh26@gmail.com commit ...`). `docs/` is gitignored — force-add doc/plan files with `git add -f`.

## File Structure

- Create `mobile/src/api/baseUrl.ts` — single source of truth for the backend base URL: synchronous `getBaseUrl()` for the hot path, `getBakedDefault()`, async `setBaseUrl()`, async `hydrateBaseUrl()`. Owns the AsyncStorage override key.
- Modify `mobile/src/api/client.ts` — resolve URL via `getBaseUrl()`; add ngrok header.
- Modify `mobile/src/api/chatStream.ts` — resolve URL via `getBaseUrl()`; add ngrok header.
- Modify `mobile/src/app/Root.tsx` — hydrate the override before rendering providers (before the first API call in `AuthProvider`'s session restore).
- Create `mobile/src/screens/BackendUrlCard.tsx` — dev-only Settings card to edit the override.
- Modify `mobile/src/screens/Settings.tsx` — render `BackendUrlCard` when `EXPO_PUBLIC_SHOW_DEV_SETTINGS === '1'`.
- Modify `mobile/eas.json` — add `env` to `development` + `preview`; force APK for preview.
- Modify `mobile/app.json` — `expo.name` → `"Riddhi"`.
- Create `docs/build-android.md` — the build runbook (incl. the manual Google SHA-1 step).

---

### Task 1: Base-URL resolver + wire both API clients + startup hydration + ngrok header

**Files:**
- Create: `mobile/src/api/baseUrl.ts`
- Modify: `mobile/src/api/client.ts:14` (remove module `BASE_URL`), `:37-47` (`buildHeaders`), `:62-94` (request fns)
- Modify: `mobile/src/api/chatStream.ts:18-20`, `:38-47`
- Modify: `mobile/src/app/Root.tsx:9` (imports), `:48-59` (gate)

**Interfaces:**
- Produces (consumed by Task 2):
  - `getBaseUrl(): string` — sync, returns override if set else baked `EXPO_PUBLIC_API_URL`, trailing slash stripped.
  - `getBakedDefault(): string` — the compile-time `EXPO_PUBLIC_API_URL` (trailing slash stripped).
  - `setBaseUrl(url: string | null): Promise<void>` — persist override; `null`/empty clears it back to the baked default.
  - `hydrateBaseUrl(): Promise<void>` — load persisted override into the in-memory cache; call once at startup.

- [ ] **Step 1: Create the resolver module**

Create `mobile/src/api/baseUrl.ts`:

```ts
/**
 * baseUrl — single source of truth for the backend origin.
 *
 * A standalone build bakes EXPO_PUBLIC_API_URL at build time. To repoint the
 * app at a new backend (e.g. a fresh ngrok URL) without rebuilding, an override
 * is persisted in AsyncStorage and overlaid on the baked default. getBaseUrl()
 * is synchronous for the request hot path; hydrateBaseUrl() loads the override
 * into the in-memory cache at startup (call before the first API request).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const OVERRIDE_KEY = 'riddhi.backendUrlOverride';

const BAKED_DEFAULT = (process.env['EXPO_PUBLIC_API_URL'] ?? '').replace(/\/$/, '');

let current = BAKED_DEFAULT;

function normalize(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/** Sync accessor for the request hot path: override if set, else baked default. */
export function getBaseUrl(): string {
  return current;
}

/** The compile-time EXPO_PUBLIC_API_URL, for the "reset to default" affordance. */
export function getBakedDefault(): string {
  return BAKED_DEFAULT;
}

/** Persist an override (or clear with null/empty) and update the in-memory cache. */
export async function setBaseUrl(url: string | null): Promise<void> {
  const next = url == null ? '' : normalize(url);
  if (next === '') {
    current = BAKED_DEFAULT;
    await AsyncStorage.removeItem(OVERRIDE_KEY);
    return;
  }
  current = next;
  await AsyncStorage.setItem(OVERRIDE_KEY, next);
}

/** Load any persisted override into the cache. Call once at startup. */
export async function hydrateBaseUrl(): Promise<void> {
  const stored = await AsyncStorage.getItem(OVERRIDE_KEY);
  if (stored) current = normalize(stored);
}
```

- [ ] **Step 2: Wire `client.ts` to the resolver and add the ngrok header**

In `mobile/src/api/client.ts`, delete the module-level line:

```ts
const BASE_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? '').replace(/\/$/, '');
```

Add the import near the top (after the file's opening doc comment):

```ts
import { getBaseUrl } from './baseUrl';
```

In `buildHeaders`, add the ngrok header to the base object:

```ts
function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...extra,
  };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }
  return headers;
}
```

In each of `get`, `post`, `patch`, `del`, replace `` `${BASE_URL}${path}` `` with `` `${getBaseUrl()}${path}` ``. Example for `get`:

```ts
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  return handleResponse<T>(res);
}
```

- [ ] **Step 3: Wire `chatStream.ts` to the resolver and add the ngrok header**

In `mobile/src/api/chatStream.ts`, delete:

```ts
const BASE_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? '').replace(/\/$/, '');
```

Update the import line `import { getAuthToken } from './client';` to also pull the resolver:

```ts
import { getAuthToken } from './client';
import { getBaseUrl } from './baseUrl';
```

Update the fetch call:

```ts
  const res = await expoFetch(`${getBaseUrl()}/ai-chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ threadId: opts.threadId, message: opts.message }),
    signal: opts.signal,
  });
```

- [ ] **Step 4: Hydrate the override before providers mount in `Root.tsx`**

The first API call happens inside `AuthProvider`'s session restore, so hydration must finish before providers render. In `mobile/src/app/Root.tsx`, add imports:

```ts
import { useEffect, useState } from 'react';

import { hydrateBaseUrl } from '../api/baseUrl';
```

Replace the fonts-only gate in `Root` with a fonts-and-URL gate:

```ts
export default function Root() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    hydrateBaseUrl().finally(() => setUrlReady(true));
  }, []);

  if (!fontsLoaded || !urlReady) {
    return null;
  }
```

(Leave the rest of `Root` unchanged. If `View` becomes unused after edits it is still used by `AuthGate`, so keep existing imports.)

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual smoke check**

Run: `cd mobile && npx expo start` and open the app (Expo Go or dev client). Expected: app loads and data fetches succeed exactly as before (the resolver returns the same value the old `BASE_URL` did). No behavior change yet — this task is a safe refactor.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/api/baseUrl.ts mobile/src/api/client.ts mobile/src/api/chatStream.ts mobile/src/app/Root.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): resolve backend URL at call time with persisted override + ngrok header"
```

---

### Task 2: Dev-only Backend URL card in Settings

**Files:**
- Create: `mobile/src/screens/BackendUrlCard.tsx`
- Modify: `mobile/src/screens/Settings.tsx:613-615` (insert gated card before the Sign out block)

**Interfaces:**
- Consumes (from Task 1): `getBaseUrl()`, `getBakedDefault()`, `setBaseUrl()`.
- Produces: `BackendUrlCard()` React component (default-styled card).

- [ ] **Step 1: Create the card component**

Create `mobile/src/screens/BackendUrlCard.tsx`:

```tsx
/**
 * BackendUrlCard — dev-only control to repoint the app at a different backend
 * (e.g. a fresh ngrok URL) without rebuilding. Rendered in Settings only when
 * EXPO_PUBLIC_SHOW_DEV_SETTINGS === '1' (set on internal EAS build profiles).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getBakedDefault, getBaseUrl, setBaseUrl } from '../api/baseUrl';
import { GlassCard } from '../components/Glass';
import { SectionHead } from '../components/ui';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';

export function BackendUrlCard() {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const [value, setValue] = useState(getBaseUrl());

  const save = async () => {
    await setBaseUrl(value);
    setValue(getBaseUrl());
    toast('Backend URL saved', '🔌');
  };

  const reset = async () => {
    await setBaseUrl(null);
    setValue(getBakedDefault());
    toast('Reset to default backend', '↩️');
  };

  return (
    <View style={styles.section}>
      <SectionHead title="Developer" />
      <GlassCard>
        <Text style={[styles.label, { color: t.text3 }]}>Backend URL</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://xxxx.ngrok-free.app"
          placeholderTextColor={t.text3}
          style={[
            styles.input,
            { color: t.text1, borderColor: t.border, backgroundColor: t.bg2 },
          ]}
        />
        <View style={styles.row}>
          <Pressable
            onPress={() => void save()}
            style={[styles.btn, { backgroundColor: t.bg2, borderColor: t.border }]}
          >
            <Text style={[styles.btnText, { color: t.text1, fontFamily: weight(600) }]}>
              Save
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void reset()}
            style={[styles.btn, { backgroundColor: t.bg2, borderColor: t.border }]}
          >
            <Text style={[styles.btnText, { color: t.text3, fontFamily: weight(600) }]}>
              Reset
            </Text>
          </Pressable>
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 18 },
  label: { fontSize: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnText: { fontSize: 14 },
});
```

Note: `t.text1`, `t.text3`, `t.bg2`, `t.border` are the same theme tokens already used in `Settings.tsx`. `toast(message, emoji)` and `SectionHead` (title-only) match existing usage.

- [ ] **Step 2: Render the card in Settings behind the env flag**

In `mobile/src/screens/Settings.tsx`, add the import alongside the other screen imports (near the `MPageShell` import):

```ts
import { BackendUrlCard } from './BackendUrlCard';
```

Then insert the gated card between the closing `</View>` of the last section and the `{/* Sign out ... */}` comment (currently line 613–615):

```tsx
      </View>

      {process.env['EXPO_PUBLIC_SHOW_DEV_SETTINGS'] === '1' && <BackendUrlCard />}

      {/* Sign out (MobileScreens.jsx:656–661) */}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual check**

Run: `cd mobile && EXPO_PUBLIC_SHOW_DEV_SETTINGS=1 npx expo start`. Open Settings → a "Developer" section with a "Backend URL" field appears. Type a URL, tap Save (toast shows), pull-to-refresh a data screen → requests hit the new URL. Tap Reset → field returns to the baked default. Restart without the flag (`npx expo start`) → the Developer section is hidden.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/BackendUrlCard.tsx mobile/src/screens/Settings.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): dev-only Backend URL override card in Settings"
```

---

### Task 3: EAS build env + APK output + app name

**Files:**
- Modify: `mobile/eas.json` (whole `build` block)
- Modify: `mobile/app.json:3` (`expo.name`)

**Interfaces:** none (build config only).

- [ ] **Step 1: Add env to the `development` and `preview` profiles and force APK**

Replace the contents of `mobile/eas.json` with:

```json
{
  "cli": {
    "version": ">= 20.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://5310-182-69-181-46.ngrok-free.app",
        "EXPO_PUBLIC_SHOW_DEV_SETTINGS": "1",
        "EXPO_PUBLIC_GOOGLE_CLIENT_ID": "868348586460-k6vmn5d41fpont1e1vv8vnvvrb4ufq1d.apps.googleusercontent.com",
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "868348586460-9hff23rcol3u5av46fb5mv9q966jvc2g.apps.googleusercontent.com",
        "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "868348586460-kcl22dgjr0qprji17aiio8d39l9l5tro.apps.googleusercontent.com"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://5310-182-69-181-46.ngrok-free.app",
        "EXPO_PUBLIC_SHOW_DEV_SETTINGS": "1",
        "EXPO_PUBLIC_GOOGLE_CLIENT_ID": "868348586460-k6vmn5d41fpont1e1vv8vnvvrb4ufq1d.apps.googleusercontent.com",
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "868348586460-9hff23rcol3u5av46fb5mv9q966jvc2g.apps.googleusercontent.com",
        "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "868348586460-kcl22dgjr0qprji17aiio8d39l9l5tro.apps.googleusercontent.com"
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

(These `EXPO_PUBLIC_GOOGLE_*` values are public OAuth client identifiers, safe to commit. `buildType: apk` makes the preview build an installable APK rather than an AAB.)

- [ ] **Step 2: Set the app display name to Riddhi**

In `mobile/app.json`, change:

```json
    "name": "mobile",
```

to:

```json
    "name": "Riddhi",
```

- [ ] **Step 3: Validate the config**

Run: `cd mobile && node -e "JSON.parse(require('fs').readFileSync('eas.json','utf8')); JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('json ok')"`
Expected: `json ok`.

Run: `cd mobile && npx expo config --type public > /dev/null && echo "expo config ok"`
Expected: `expo config ok` (config resolves; `name` is "Riddhi").

- [ ] **Step 4: Commit**

```bash
git add mobile/eas.json mobile/app.json
git -c user.email=gairola.ashutosh26@gmail.com commit -m "chore(mobile): EAS build env for internal profiles; APK output; app name Riddhi"
```

---

### Task 4: Build runbook

**Files:**
- Create: `docs/build-android.md`

**Interfaces:** none.

- [ ] **Step 1: Write the runbook**

Create `docs/build-android.md`:

````markdown
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
````

- [ ] **Step 2: Commit (force-add — `docs/` is gitignored)**

```bash
git add -f docs/build-android.md
git -c user.email=gairola.ashutosh26@gmail.com commit -m "docs: Android preview build runbook"
```

---

## Self-Review

**Spec coverage:**
- In-app override (spec §1) → Task 1 (resolver + wiring + hydration) + Task 2 (UI). ✓
- ngrok interstitial header (spec §2) → Task 1 Steps 2–3. ✓
- EAS env wiring (spec §3) → Task 3 Step 1. ✓
- App display name Riddhi (spec §4) → Task 3 Step 2. ✓
- Build runbook incl. Google SHA-1 (spec §5) → Task 4. ✓
- Out of scope (iOS build, production, backend changes) → not implemented; iOS noted in runbook only. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `getBaseUrl` / `getBakedDefault` / `setBaseUrl` / `hydrateBaseUrl` names match across `baseUrl.ts`, `client.ts`, `chatStream.ts`, `Root.tsx`, and `BackendUrlCard.tsx`. Theme tokens (`t.text1/text3/bg2/border`) and `toast(msg, emoji)` / `SectionHead{title}` match existing `Settings.tsx` usage. ✓
