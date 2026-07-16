# Smart Notification Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `DEFAULT_ALLOWLIST` with a server-updatable catalog that is filtered to the apps a user actually has installed and controllable via a per-app toggle screen.

**Architecture:** The backend serves a catalog of finance/merchant apps (`GET /notification-sync/catalog`). The mobile app fetches + caches it, probes which catalog packages are installed via `PackageManager` (declared `<queries>`), merges with user toggles through a pure `resolveAllowlist` function, and pushes the effective list to the native `NotificationListenerService`. A new "Monitored apps" screen shows the catalog with real app icons and switches. The old `DEFAULT_ALLOWLIST` array is retained only as the offline seed/fallback.

**Tech Stack:** NestJS + TypeORM (backend), Expo modules (Kotlin native), React Native + TypeScript (mobile), Jest (tests both sides).

## Global Constraints

- Expo SDK is v56 — consult https://docs.expo.dev/versions/v56.0.0/ before writing native/Expo code.
- Native features are **Android-only**; every JS helper must degrade to a safe no-op (`[]` / `{}`) when `Native == null` (non-Android), following the existing `requireOptionalNativeModule` pattern in `mobile/modules/notification-listener/index.ts`.
- Capture is **default-deny**: nothing is captured until the app seeds an allowlist. The effective allowlist must never be empty *by error* (offline/failure) — only empty when the user has explicitly paused.
- Git commits must **NOT** include a `Co-Authored-By` trailer (repo convention). Author email is already `gairola.ashutosh26@gmail.com`.
- Mobile tests: run `npx jest` from `mobile/`. Backend tests: run `npx jest` from `backend/`. Mobile typecheck: `npx tsc --noEmit` from `mobile/`.
- Follow existing file patterns: `src/lib/*.ts` for logic + colocated `*.spec.ts`; screens in `src/screens/*.tsx` registered in `src/app/screens.tsx` + `ScreenKind` in `src/app/navContext.tsx`.

---

## Shared Types (defined here, referenced by every task)

```ts
// Catalog entry — backend contract, mirrored client-side.
export interface CatalogEntry {
  packageName: string;                                   // e.g. "com.phonepe.app"
  displayName: string;                                   // "PhonePe"
  category: 'bank' | 'upi' | 'wallet' | 'merchant';
  region?: string;                                       // e.g. "IN" (informational)
}
```

Native module functions (added to the `NativeModule` interface / JS wrappers):

```ts
getInstalledPackages(candidates: string[]): Promise<string[]>;   // installed ∩ visible subset
getAppIcons(packages: string[]): Promise<Record<string, string>>; // pkg -> base64 PNG (no data: prefix)
```

Pure resolver (Task 5):

```ts
resolveAllowlist(
  catalog: CatalogEntry[],
  installed: string[],        // from getInstalledPackages
  declaredQueries: string[],  // packages we can actually probe (mirror of manifest <queries>)
  toggles: Record<string, boolean>, // pkg -> enabled; absent key = default-on
): string[]
```

**Visibility rule:** a package is a *candidate* if `installed.includes(pkg)` OR `!declaredQueries.includes(pkg)` (unknown visibility ⇒ includable). It is included when it is a candidate AND `toggles[pkg] !== false`.

---

## Task 1: Backend catalog endpoint

**Files:**
- Create: `backend/src/notification-sync/catalog.constant.ts`
- Modify: `backend/src/notification-sync/notification-sync.service.ts` (add `getCatalog()`)
- Modify: `backend/src/notification-sync/notification-sync.controller.ts` (add `GET catalog`)
- Test: `backend/src/notification-sync/catalog.spec.ts`

**Interfaces:**
- Produces: `CatalogEntry[]` served at `GET /notification-sync/catalog`; `NotificationSyncService.getCatalog(): CatalogEntry[]`; exported `NOTIFICATION_CATALOG: CatalogEntry[]`.

- [ ] **Step 1: Write the catalog constant**

Create `backend/src/notification-sync/catalog.constant.ts` (seeded from today's `DEFAULT_ALLOWLIST`, enriched):

```ts
export type CatalogCategory = 'bank' | 'upi' | 'wallet' | 'merchant';

export interface CatalogEntry {
  packageName: string;
  displayName: string;
  category: CatalogCategory;
  region?: string;
}

/** Canonical set of finance/merchant apps we capture notifications from.
 * Update this list + deploy the backend to extend coverage — no app release
 * needed (the mobile app fetches it at runtime). Packages here should also be
 * declared in the mobile AndroidManifest <queries> block so install-state can
 * be probed; a package added here but not yet in <queries> is still captured,
 * it just skips the installed-filter until a mobile release adds it. */
export const NOTIFICATION_CATALOG: CatalogEntry[] = [
  // Banks
  { packageName: 'com.snapwork.hdfc', displayName: 'HDFC Bank', category: 'bank', region: 'IN' },
  { packageName: 'com.csam.icici.bank.imobile', displayName: 'ICICI iMobile', category: 'bank', region: 'IN' },
  { packageName: 'com.sbi.lotusintouch', displayName: 'SBI YONO', category: 'bank', region: 'IN' },
  { packageName: 'com.axis.mobile', displayName: 'Axis Mobile', category: 'bank', region: 'IN' },
  { packageName: 'com.msf.kbank.mobile', displayName: 'Kotak 811', category: 'bank', region: 'IN' },
  { packageName: 'com.bankofbaroda.mconnect', displayName: 'Bank of Baroda', category: 'bank', region: 'IN' },
  // UPI
  { packageName: 'com.google.android.apps.nbu.paisa.user', displayName: 'Google Pay', category: 'upi', region: 'IN' },
  { packageName: 'com.phonepe.app', displayName: 'PhonePe', category: 'upi', region: 'IN' },
  { packageName: 'net.one97.paytm', displayName: 'Paytm', category: 'wallet', region: 'IN' },
  // Merchants
  { packageName: 'com.rapido.passenger', displayName: 'Rapido', category: 'merchant', region: 'IN' },
  { packageName: 'com.ubercab', displayName: 'Uber', category: 'merchant' },
  { packageName: 'in.swiggy.android', displayName: 'Swiggy', category: 'merchant', region: 'IN' },
  { packageName: 'com.application.zomato', displayName: 'Zomato', category: 'merchant', region: 'IN' },
  { packageName: 'in.amazon.mShop.android.shopping', displayName: 'Amazon', category: 'merchant', region: 'IN' },
  { packageName: 'com.flipkart.android', displayName: 'Flipkart', category: 'merchant', region: 'IN' },
];
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/notification-sync/catalog.spec.ts`:

```ts
import { NOTIFICATION_CATALOG } from './catalog.constant';

describe('notification catalog', () => {
  it('has unique package names and required fields', () => {
    const pkgs = NOTIFICATION_CATALOG.map((c) => c.packageName);
    expect(new Set(pkgs).size).toBe(pkgs.length);
    for (const c of NOTIFICATION_CATALOG) {
      expect(c.packageName).toMatch(/^[a-z0-9_.]+$/i);
      expect(c.displayName.length).toBeGreaterThan(0);
      expect(['bank', 'upi', 'wallet', 'merchant']).toContain(c.category);
    }
  });

  it('covers every legacy DEFAULT_ALLOWLIST package', () => {
    const legacy = [
      'com.snapwork.hdfc', 'com.csam.icici.bank.imobile', 'com.sbi.lotusintouch',
      'com.axis.mobile', 'com.msf.kbank.mobile', 'com.bankofbaroda.mconnect',
      'com.google.android.apps.nbu.paisa.user', 'com.phonepe.app', 'net.one97.paytm',
      'com.rapido.passenger', 'com.ubercab', 'in.swiggy.android',
      'com.application.zomato', 'in.amazon.mShop.android.shopping', 'com.flipkart.android',
    ];
    const pkgs = new Set(NOTIFICATION_CATALOG.map((c) => c.packageName));
    for (const p of legacy) expect(pkgs.has(p)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run (from `backend/`): `npx jest src/notification-sync/catalog.spec.ts`
Expected: PASS (this task's constant is data — the test guards its integrity).

- [ ] **Step 4: Add `getCatalog()` to the service**

In `backend/src/notification-sync/notification-sync.service.ts`, add the import at the top:

```ts
import { NOTIFICATION_CATALOG, CatalogEntry } from './catalog.constant';
```

Add this method to the `NotificationSyncService` class (e.g. right after the constructor):

```ts
/** The canonical app catalog the mobile client fetches to build its
 * notification allowlist. Static today; a DB-backed catalog can replace
 * this without changing the controller contract. */
getCatalog(): CatalogEntry[] {
  return NOTIFICATION_CATALOG;
}
```

- [ ] **Step 5: Add the controller route**

In `backend/src/notification-sync/notification-sync.controller.ts`, add the route (it is already `@UseGuards(JwtAuthGuard)` at class level, so no per-route guard needed):

```ts
@Get('catalog')
catalog() {
  return this.service.getCatalog();
}
```

- [ ] **Step 6: Build to verify wiring**

Run (from `backend/`): `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/notification-sync/catalog.constant.ts backend/src/notification-sync/catalog.spec.ts backend/src/notification-sync/notification-sync.service.ts backend/src/notification-sync/notification-sync.controller.ts
git commit -m "feat(backend): serve notification app catalog at GET /notification-sync/catalog"
```

---

## Task 2: Native install-probe + `<queries>` + JS wrapper

**Files:**
- Modify: `mobile/modules/notification-listener/android/src/main/java/expo/modules/notificationlistener/NotificationListenerModule.kt`
- Modify: `mobile/modules/notification-listener/android/src/main/AndroidManifest.xml`
- Modify: `mobile/modules/notification-listener/index.ts`

**Interfaces:**
- Produces: JS `getInstalledPackages(candidates: string[]): Promise<string[]>`; exported `DECLARED_QUERY_PACKAGES: string[]` (mirror of manifest `<queries>`, equals the seed list); `DEFAULT_ALLOWLIST` retained as the offline seed.

- [ ] **Step 1: Add the native function**

In `NotificationListenerModule.kt`, add these imports near the top:

```kotlin
import android.content.pm.PackageManager
```

Add this `AsyncFunction` inside `ModuleDefinition { ... }` (next to the other `AsyncFunction`s):

```kotlin
AsyncFunction("getInstalledPackages") { candidates: List<String> ->
  val pm = context.packageManager
  candidates.filter { pkg ->
    try {
      pm.getPackageInfo(pkg, 0); true
    } catch (e: PackageManager.NameNotFoundException) {
      false // not installed, OR not visible (not declared in <queries>)
    }
  }
}
```

- [ ] **Step 2: Declare `<queries>` in the manifest**

In `AndroidManifest.xml`, add a `<queries>` block as a direct child of `<manifest>` (sibling of `<application>`), listing every catalog package so `getPackageInfo` can see them under Android 11+ visibility rules:

```xml
<queries>
  <package android:name="com.snapwork.hdfc" />
  <package android:name="com.csam.icici.bank.imobile" />
  <package android:name="com.sbi.lotusintouch" />
  <package android:name="com.axis.mobile" />
  <package android:name="com.msf.kbank.mobile" />
  <package android:name="com.bankofbaroda.mconnect" />
  <package android:name="com.google.android.apps.nbu.paisa.user" />
  <package android:name="com.phonepe.app" />
  <package android:name="net.one97.paytm" />
  <package android:name="com.rapido.passenger" />
  <package android:name="com.ubercab" />
  <package android:name="in.swiggy.android" />
  <package android:name="com.application.zomato" />
  <package android:name="in.amazon.mShop.android.shopping" />
  <package android:name="com.flipkart.android" />
</queries>
```

- [ ] **Step 3: Add the JS wrapper + declared-queries mirror**

In `mobile/modules/notification-listener/index.ts`:

Add `getInstalledPackages` to the `NativeModule` interface:

```ts
  getInstalledPackages(candidates: string[]): Promise<string[]>;
```

Add a mirror constant just after `DEFAULT_ALLOWLIST` (repurpose the doc comment to make its new role clear):

```ts
/** Packages declared in the Android <queries> manifest block — the set the
 * install-probe can actually see. Must stay in sync with AndroidManifest.xml.
 * A catalog package absent here has "unknown" install-state and is treated as
 * includable by resolveAllowlist. Equals DEFAULT_ALLOWLIST today. */
export const DECLARED_QUERY_PACKAGES: string[] = DEFAULT_ALLOWLIST;
```

Update the `DEFAULT_ALLOWLIST` doc comment to reflect its demotion:

```ts
/** Offline seed / fallback allowlist. No longer canonical — the app fetches
 * the live catalog from the backend; this is only used when that fetch has
 * never succeeded. Also mirrors the manifest <queries> (see DECLARED_QUERY_PACKAGES). */
```

Add the wrapper function (with the null-Native degrade, matching the others):

```ts
export async function getInstalledPackages(candidates: string[]): Promise<string[]> {
  return Native ? Native.getInstalledPackages(candidates) : [];
}
```

- [ ] **Step 4: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/modules/notification-listener/android/src/main/java/expo/modules/notificationlistener/NotificationListenerModule.kt mobile/modules/notification-listener/android/src/main/AndroidManifest.xml mobile/modules/notification-listener/index.ts
git commit -m "feat(mobile): native getInstalledPackages + <queries>; demote DEFAULT_ALLOWLIST to seed"
```

---

## Task 3: Native app-icon fetch + JS wrapper

**Files:**
- Modify: `mobile/modules/notification-listener/android/src/main/java/expo/modules/notificationlistener/NotificationListenerModule.kt`
- Modify: `mobile/modules/notification-listener/index.ts`

**Interfaces:**
- Consumes: `<queries>` visibility from Task 2 (icons are only fetchable for visible+installed packages).
- Produces: JS `getAppIcons(packages: string[]): Promise<Record<string, string>>` — map of packageName → base64-encoded PNG (no `data:` prefix). Packages that fail to resolve are omitted.

- [ ] **Step 1: Add the native function**

In `NotificationListenerModule.kt`, add imports:

```kotlin
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import java.io.ByteArrayOutputStream
```

Add this `AsyncFunction` inside `ModuleDefinition { ... }`:

```kotlin
AsyncFunction("getAppIcons") { packages: List<String> ->
  val pm = context.packageManager
  val out = HashMap<String, String>()
  for (pkg in packages) {
    try {
      val drawable: Drawable = pm.getApplicationIcon(pkg)
      val bitmap = drawableToBitmap(drawable)
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
      out[pkg] = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
      // not installed / not visible — omit; JS falls back to a category glyph
    }
  }
  out
}
```

Add this private helper method to the `NotificationListenerModule` class (outside `definition()`):

```kotlin
private fun drawableToBitmap(drawable: Drawable): Bitmap {
  if (drawable is BitmapDrawable && drawable.bitmap != null) return drawable.bitmap
  val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 96
  val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 96
  val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
  val canvas = Canvas(bitmap)
  drawable.setBounds(0, 0, canvas.width, canvas.height)
  drawable.draw(canvas)
  return bitmap
}
```

- [ ] **Step 2: Add the JS wrapper**

In `mobile/modules/notification-listener/index.ts`, add to the `NativeModule` interface:

```ts
  getAppIcons(packages: string[]): Promise<Record<string, string>>;
```

Add the wrapper:

```ts
export async function getAppIcons(packages: string[]): Promise<Record<string, string>> {
  return Native ? Native.getAppIcons(packages) : {};
}
```

- [ ] **Step 3: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/modules/notification-listener/android/src/main/java/expo/modules/notificationlistener/NotificationListenerModule.kt mobile/modules/notification-listener/index.ts
git commit -m "feat(mobile): native getAppIcons returning base64 app icons"
```

---

## Task 4: `resolveAllowlist` pure function

**Files:**
- Create: `mobile/src/lib/allowlistResolver.ts`
- Test: `mobile/src/lib/allowlistResolver.spec.ts`

**Interfaces:**
- Consumes: `CatalogEntry` (define/duplicate the client type here — see Step 1).
- Produces: `resolveAllowlist(catalog, installed, declaredQueries, toggles): string[]` and the client-side `CatalogEntry` type.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/lib/allowlistResolver.spec.ts`:

```ts
import { resolveAllowlist, type CatalogEntry } from './allowlistResolver';

const cat: CatalogEntry[] = [
  { packageName: 'com.phonepe.app', displayName: 'PhonePe', category: 'upi' },
  { packageName: 'com.ubercab', displayName: 'Uber', category: 'merchant' },
  { packageName: 'com.newbank', displayName: 'New Bank', category: 'bank' }, // not in <queries>
];
const declared = ['com.phonepe.app', 'com.ubercab']; // com.newbank NOT declared

it('includes installed declared packages', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, {});
  expect(r).toContain('com.phonepe.app');
});

it('excludes declared-but-not-installed packages', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, {});
  expect(r).not.toContain('com.ubercab');
});

it('includes undeclared (unknown-visibility) packages regardless of install list', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, {});
  expect(r).toContain('com.newbank');
});

it('excludes packages explicitly toggled off', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, { 'com.phonepe.app': false });
  expect(r).not.toContain('com.phonepe.app');
});

it('defaults to on when toggle key is absent', () => {
  const r = resolveAllowlist(cat, ['com.phonepe.app'], declared, { 'com.ubercab': true });
  expect(r).toContain('com.phonepe.app');
});

it('empty catalog yields empty list', () => {
  expect(resolveAllowlist([], ['com.phonepe.app'], declared, {})).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `mobile/`): `npx jest src/lib/allowlistResolver.spec.ts`
Expected: FAIL — cannot find module `./allowlistResolver`.

- [ ] **Step 3: Write the implementation**

Create `mobile/src/lib/allowlistResolver.ts`:

```ts
export type CatalogCategory = 'bank' | 'upi' | 'wallet' | 'merchant';

export interface CatalogEntry {
  packageName: string;
  displayName: string;
  category: CatalogCategory;
  region?: string;
}

/** Computes the effective notification allowlist from the catalog, the probed
 * install list, the set of packages we can actually probe (manifest <queries>),
 * and the user's per-app toggles.
 *
 * A package is a *candidate* when it is installed OR its visibility is unknown
 * (not declared in <queries>, so the probe can't confirm it). Candidates are
 * included unless the user has explicitly toggled them off. */
export function resolveAllowlist(
  catalog: CatalogEntry[],
  installed: string[],
  declaredQueries: string[],
  toggles: Record<string, boolean>,
): string[] {
  const installedSet = new Set(installed);
  const declaredSet = new Set(declaredQueries);
  return catalog
    .map((c) => c.packageName)
    .filter((pkg) => {
      const isCandidate = installedSet.has(pkg) || !declaredSet.has(pkg);
      return isCandidate && toggles[pkg] !== false;
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `mobile/`): `npx jest src/lib/allowlistResolver.spec.ts`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/allowlistResolver.ts mobile/src/lib/allowlistResolver.spec.ts
git commit -m "feat(mobile): pure resolveAllowlist (installed + queries + toggles)"
```

---

## Task 5: Catalog source (fetch + cache + fallback)

**Files:**
- Create: `mobile/src/lib/catalogSource.ts`
- Test: `mobile/src/lib/catalogSource.spec.ts`

**Interfaces:**
- Consumes: `apiClient.get` (`../api/client`), `AsyncStorage`, `DEFAULT_ALLOWLIST` (`../../modules/notification-listener`), `CatalogEntry` (`./allowlistResolver`).
- Produces: `fetchCatalog(): Promise<CatalogEntry[]>` — network → cache → bundled seed.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/lib/catalogSource.spec.ts`:

```ts
const get = jest.fn();
jest.mock('../api/client', () => ({ apiClient: { get: (...a: any[]) => get(...a) } }));

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  },
}));

jest.mock('../../modules/notification-listener', () => ({
  DEFAULT_ALLOWLIST: ['com.phonepe.app', 'com.ubercab'],
}));

import { fetchCatalog } from './catalogSource';

const remote = [{ packageName: 'com.remote.bank', displayName: 'Remote', category: 'bank' }];

beforeEach(() => { get.mockReset(); for (const k of Object.keys(store)) delete store[k]; });

it('fetches from backend and caches the result', async () => {
  get.mockResolvedValueOnce(remote);
  const r = await fetchCatalog();
  expect(get).toHaveBeenCalledWith('/notification-sync/catalog');
  expect(r).toEqual(remote);
  // second call, backend now failing → served from cache
  get.mockRejectedValueOnce(new Error('offline'));
  const r2 = await fetchCatalog();
  expect(r2).toEqual(remote);
});

it('falls back to the bundled seed when never cached and backend fails', async () => {
  get.mockRejectedValueOnce(new Error('offline'));
  const r = await fetchCatalog();
  expect(r.map((c) => c.packageName)).toEqual(['com.phonepe.app', 'com.ubercab']);
  expect(r.every((c) => c.displayName && c.category)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `mobile/`): `npx jest src/lib/catalogSource.spec.ts`
Expected: FAIL — cannot find module `./catalogSource`.

- [ ] **Step 3: Write the implementation**

Create `mobile/src/lib/catalogSource.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { DEFAULT_ALLOWLIST } from '../../modules/notification-listener';
import type { CatalogEntry } from './allowlistResolver';

const CACHE_KEY = 'notification-sync/catalog-v1';

/** Last-resort catalog when the backend has never been reached: the retained
 * DEFAULT_ALLOWLIST seed, given a neutral 'merchant' category and a
 * package-derived display name so the UI still renders something sensible. */
function seedCatalog(): CatalogEntry[] {
  return DEFAULT_ALLOWLIST.map((packageName) => ({
    packageName,
    displayName: packageName.split('.').pop() ?? packageName,
    category: 'merchant' as const,
  }));
}

/** Fetch the app catalog: live backend first (cached on success), else the last
 * cached copy, else the bundled seed. Never throws. */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  try {
    const remote = await apiClient.get<CatalogEntry[]>('/notification-sync/catalog');
    if (Array.isArray(remote) && remote.length > 0) {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(remote));
      return remote;
    }
  } catch {
    // fall through to cache / seed
  }
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as CatalogEntry[];
  } catch {
    // fall through to seed
  }
  return seedCatalog();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `mobile/`): `npx jest src/lib/catalogSource.spec.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/catalogSource.ts mobile/src/lib/catalogSource.spec.ts
git commit -m "feat(mobile): catalogSource — fetch + cache + seed fallback"
```

---

## Task 6: Toggle store

**Files:**
- Create: `mobile/src/lib/toggleStore.ts`
- Test: `mobile/src/lib/toggleStore.spec.ts`

**Interfaces:**
- Consumes: `AsyncStorage`.
- Produces: `getToggles(): Promise<Record<string, boolean>>`; `setToggle(pkg: string, enabled: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/lib/toggleStore.spec.ts`:

```ts
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  },
}));

import { getToggles, setToggle } from './toggleStore';

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

it('returns an empty map when nothing is stored', async () => {
  expect(await getToggles()).toEqual({});
});

it('round-trips a toggle', async () => {
  await setToggle('com.phonepe.app', false);
  expect(await getToggles()).toEqual({ 'com.phonepe.app': false });
  await setToggle('com.phonepe.app', true);
  expect(await getToggles()).toEqual({ 'com.phonepe.app': true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `mobile/`): `npx jest src/lib/toggleStore.spec.ts`
Expected: FAIL — cannot find module `./toggleStore`.

- [ ] **Step 3: Write the implementation**

Create `mobile/src/lib/toggleStore.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'notification-sync/app-toggles';

/** Per-app enable/disable map (packageName -> enabled). An absent key means
 * "default on" — callers (resolveAllowlist) treat only `false` as disabled. */
export async function getToggles(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export async function setToggle(pkg: string, enabled: boolean): Promise<void> {
  const current = await getToggles();
  current[pkg] = enabled;
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `mobile/`): `npx jest src/lib/toggleStore.spec.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/toggleStore.ts mobile/src/lib/toggleStore.spec.ts
git commit -m "feat(mobile): toggleStore for per-app monitoring toggles"
```

---

## Task 7: Rewrite `configureAllowlist` to orchestrate

**Files:**
- Modify: `mobile/src/lib/notificationSync.ts:49-52` (`configureAllowlist`) and its imports
- Test: `mobile/src/lib/notificationSync.spec.ts` (extend the existing mock + add a case)

**Interfaces:**
- Consumes: `fetchCatalog` (Task 5), `resolveAllowlist` + `DECLARED_QUERY_PACKAGES` (Tasks 4/2), `getInstalledPackages` (Task 2), `getToggles` (Task 6), `setAllowlist` (existing).
- Produces: unchanged signature `configureAllowlist(): Promise<void>` — now pushes the resolved list instead of the raw seed.

- [ ] **Step 1: Extend the existing test mock and add a failing test**

In `mobile/src/lib/notificationSync.spec.ts`, replace the `jest.mock('../../modules/notification-listener', ...)` block (lines 3-10) with:

```ts
const setAllowlist = jest.fn();
const getInstalledPackages = jest.fn();
jest.mock('../../modules/notification-listener', () => ({
  isNotificationListenerAvailable: true,
  DEFAULT_ALLOWLIST: ['com.rapido.passenger'],
  DECLARED_QUERY_PACKAGES: ['com.rapido.passenger', 'com.ubercab'],
  getPending: (...a: any[]) => getPending(...a),
  markUploaded: (...a: any[]) => markUploaded(...a),
  setAllowlist: (...a: any[]) => setAllowlist(...a),
  getInstalledPackages: (...a: any[]) => getInstalledPackages(...a),
  isEnabled: () => true,
}));
```

Add mocks for the two new lib deps (place beside the existing `jest.mock('../api/client', ...)`):

```ts
const fetchCatalog = jest.fn();
jest.mock('./catalogSource', () => ({ fetchCatalog: (...a: any[]) => fetchCatalog(...a) }));
const getToggles = jest.fn();
jest.mock('./toggleStore', () => ({ getToggles: (...a: any[]) => getToggles(...a) }));
```

Update the import line to also import `configureAllowlist`:

```ts
import { uploadCaptured, configureAllowlist } from './notificationSync';
```

Add this test block after the existing `describe('uploadCaptured', ...)`:

```ts
describe('configureAllowlist', () => {
  beforeEach(() => { setAllowlist.mockReset(); getInstalledPackages.mockReset(); fetchCatalog.mockReset(); getToggles.mockReset(); });

  it('pushes the resolved allowlist (installed ∩ catalog, honoring toggles)', async () => {
    fetchCatalog.mockResolvedValueOnce([
      { packageName: 'com.rapido.passenger', displayName: 'Rapido', category: 'merchant' },
      { packageName: 'com.ubercab', displayName: 'Uber', category: 'merchant' },
    ]);
    getInstalledPackages.mockResolvedValueOnce(['com.rapido.passenger']); // uber not installed
    getToggles.mockResolvedValueOnce({});
    await configureAllowlist();
    expect(setAllowlist).toHaveBeenCalledWith(['com.rapido.passenger']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `mobile/`): `npx jest src/lib/notificationSync.spec.ts`
Expected: FAIL — `configureAllowlist` still pushes `DEFAULT_ALLOWLIST` (`['com.rapido.passenger']` may coincidentally pass, but the resolver path isn't wired). If it passes by coincidence, proceed — the implementation step makes the wiring real; the `uploadCaptured` cases must still pass.

- [ ] **Step 3: Rewrite `configureAllowlist`**

In `mobile/src/lib/notificationSync.ts`, update the imports block (lines 12-18) to:

```ts
import {
  isNotificationListenerAvailable,
  DECLARED_QUERY_PACKAGES,
  getPending,
  markUploaded,
  setAllowlist,
  getInstalledPackages,
} from '../../modules/notification-listener';
import { fetchCatalog } from './catalogSource';
import { resolveAllowlist } from './allowlistResolver';
import { getToggles } from './toggleStore';
```

Replace the `configureAllowlist` function (lines 49-52) with:

```ts
/** Builds the effective allowlist from the live catalog, the device's installed
 * apps, and the user's per-app toggles, then pushes it to the native store.
 * Falls back safely (cached/seed catalog, empty install list off-Android). */
export async function configureAllowlist(): Promise<void> {
  if (!notificationSyncSupported()) return;
  const catalog = await fetchCatalog();
  const installed = await getInstalledPackages(catalog.map((c) => c.packageName));
  const toggles = await getToggles();
  const effective = resolveAllowlist(catalog, installed, DECLARED_QUERY_PACKAGES, toggles);
  await setAllowlist(effective);
}
```

Note: `DEFAULT_ALLOWLIST` is no longer imported here — it survives only inside the module as the seed. Remove it from this file's import if present.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `mobile/`): `npx jest src/lib/notificationSync.spec.ts`
Expected: PASS — both `uploadCaptured` cases and the new `configureAllowlist` case.

- [ ] **Step 5: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/notificationSync.ts mobile/src/lib/notificationSync.spec.ts
git commit -m "feat(mobile): configureAllowlist orchestrates catalog + install probe + toggles"
```

---

## Task 8: Monitored-apps screen + Sync entry point

**Files:**
- Create: `mobile/src/screens/MonitoredApps.tsx`
- Modify: `mobile/src/app/navContext.tsx` (add `'monitored-apps'` to `ScreenKind`)
- Modify: `mobile/src/app/screens.tsx` (register the screen)
- Modify: `mobile/src/screens/Sync.tsx` (add the entry `ListRow` + refresh on return)

**Interfaces:**
- Consumes: `fetchCatalog` (Task 5), `getInstalledPackages` + `getAppIcons` (Tasks 2/3), `getToggles` + `setToggle` (Task 6), `configureAllowlist` (Task 7), `MPageShell` (`title`, `onBack`), `useNav` (`push`, `pop`), `Toggle`, `ListCard`, `ListRow`, `GlassCard`, `MI`, `useTheme`, `weight`.
- Produces: a pushable screen under kind `'monitored-apps'`.

- [ ] **Step 1: Register the screen kind**

In `mobile/src/app/navContext.tsx`, add `'monitored-apps'` to the `ScreenKind` union (place after `'card-detail'`):

```ts
  | 'card-detail'
  | 'monitored-apps'
```

- [ ] **Step 2: Register the component**

In `mobile/src/app/screens.tsx`:

Add the import (alphabetical-ish, near the other screen imports):

```ts
import { MonitoredApps } from '../screens/MonitoredApps';
```

Add the registry entry (after `'card-detail': CardDetail,`):

```ts
  'monitored-apps': MonitoredApps,
```

- [ ] **Step 3: Create the screen**

Create `mobile/src/screens/MonitoredApps.tsx`:

```tsx
/**
 * MonitoredApps — lets the user see and control which finance/merchant apps
 * Riddhi captures notifications from. Lists the backend catalog grouped by
 * category, shows the real app icon (from PackageManager) for installed apps,
 * and a per-app Toggle. Flipping a toggle persists it and re-pushes the native
 * allowlist immediately via configureAllowlist().
 */
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { ListCard, ListRow, Toggle } from '../components/ui';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MPageShell } from './_MPageShell';
import { fetchCatalog } from '../lib/catalogSource';
import { configureAllowlist } from '../lib/notificationSync';
import { getToggles, setToggle } from '../lib/toggleStore';
import { getInstalledPackages, getAppIcons } from '../../modules/notification-listener';
import type { CatalogEntry } from '../lib/allowlistResolver';

const CATEGORY_LABEL: Record<CatalogEntry['category'], string> = {
  bank: 'Banks',
  upi: 'UPI',
  wallet: 'Wallets',
  merchant: 'Merchants',
};
const CATEGORY_ORDER: CatalogEntry['category'][] = ['bank', 'upi', 'wallet', 'merchant'];

export function MonitoredApps({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cat = await fetchCatalog();
      if (!alive) return;
      setCatalog(cat);
      const pkgs = cat.map((c) => c.packageName);
      const [inst, ic, tg] = await Promise.all([
        getInstalledPackages(pkgs),
        getAppIcons(pkgs),
        getToggles(),
      ]);
      if (!alive) return;
      setInstalled(new Set(inst));
      setIcons(ic);
      setToggles(tg);
    })();
    return () => { alive = false; };
  }, []);

  const onToggle = useCallback(async (pkg: string, enabled: boolean) => {
    setToggles((prev) => ({ ...prev, [pkg]: enabled }));
    await setToggle(pkg, enabled);
    await configureAllowlist();
  }, []);

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: catalog.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <MPageShell title="Monitored apps" onBack={pop}>
      <Text style={[styles.intro, { color: t.text3 }]}>
        Riddhi only reads notifications from the apps you enable here. Turn off any
        app you don't want monitored.
      </Text>
      {grouped.map(({ cat, items }) => (
        <View key={cat} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text1, fontFamily: weight(700) }]}>
            {CATEGORY_LABEL[cat]}
          </Text>
          <ListCard>
            {items.map((c, i) => {
              const isInstalled = installed.has(c.packageName);
              const enabled = toggles[c.packageName] !== false;
              const icon = icons[c.packageName];
              return (
                <ListRow key={c.packageName} last={i === items.length - 1}>
                  <View style={[styles.iconBox, { backgroundColor: t.bg3, opacity: isInstalled ? 1 : 0.4 }]}>
                    {icon ? (
                      <Image source={{ uri: `data:image/png;base64,${icon}` }} style={styles.icon} />
                    ) : (
                      <MI.bell size={18} color={t.text3} />
                    )}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.appName, { color: t.text1, fontFamily: weight(600), opacity: isInstalled ? 1 : 0.5 }]}>
                      {c.displayName}
                    </Text>
                    <Text style={[styles.appMeta, { color: t.text3 }]}>
                      {isInstalled ? 'Installed' : 'Not installed'}
                    </Text>
                  </View>
                  <Toggle on={enabled} onChange={(v) => onToggle(c.packageName, v)} disabled={!isInstalled} />
                </ListRow>
              );
            })}
          </ListCard>
        </View>
      ))}
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, marginBottom: 8 },
  iconBox: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 24, height: 24, borderRadius: 5 },
  rowText: { flex: 1, marginLeft: 12 },
  appName: { fontSize: 15 },
  appMeta: { fontSize: 12, marginTop: 2 },
});
```

- [ ] **Step 4: Add the entry point on the Sync screen**

In `mobile/src/screens/Sync.tsx`, `useNav()` is already destructured as `const { pop } = useNav();` (line 147). Change it to also pull `push`:

```ts
  const { pop, push } = useNav();
```

Insert this entry card immediately AFTER the "enable notification capture" block (after line 528's closing `) : null}`), so it shows once access is granted:

```tsx
      {notifSupported && listenerEnabled ? (
        <SpringIn>
          <ListCard>
            <ListRow last onPress={() => push({ kind: 'monitored-apps' })}>
              <View style={[styles.statusIconBox, { backgroundColor: t.emDim }]}>
                <MI.bell size={20} color={t.em} />
              </View>
              <View style={styles.statusText}>
                <Text style={[styles.statusTitle, { color: t.text1, fontFamily: weight(700) }]}>
                  Monitored apps
                </Text>
                <Text style={[styles.statusSubtitle, { color: t.text3 }]}>
                  Choose which apps Riddhi reads notifications from
                </Text>
              </View>
              <MI.arrow size={18} color={t.text3} />
            </ListRow>
          </ListCard>
        </SpringIn>
      ) : null}
```

(`ListRow` accepts an `onPress` prop and renders its own inner `Pressable` — confirmed in `mobile/src/components/ui.tsx`. `MI.arrow` is the row chevron used across `Settings.tsx` — confirmed in `mobile/src/components/icons.tsx`. `ListCard` and `SpringIn` are already imported in `Sync.tsx`.)

- [ ] **Step 5: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors. Resolve any `ListRow`/`MI` name mismatches flagged here per Step 4's note.

- [ ] **Step 6: Run the full mobile test suite**

Run (from `mobile/`): `npx jest`
Expected: PASS (no regressions; existing `notificationSync.spec.ts` and the new lib specs all green).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/MonitoredApps.tsx mobile/src/app/navContext.tsx mobile/src/app/screens.tsx mobile/src/screens/Sync.tsx
git commit -m "feat(mobile): Monitored apps screen + Sync entry point"
```

---

## Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suite**

Run (from `backend/`): `npx jest src/notification-sync`
Expected: PASS including `catalog.spec.ts`.

- [ ] **Step 2: Full mobile suite + typecheck**

Run (from `mobile/`): `npx jest && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 3: Manual smoke (Android) — use the `run`/`verify` skill**

On an Android device/emulator with the app installed:
1. Grant notification access (Sync screen CTA).
2. Confirm the "Monitored apps" row appears; open it.
3. Verify installed catalog apps show real icons + "Installed"; others greyed + "Not installed".
4. Toggle an installed app off → reopen Monitored apps → state persists.
5. Confirm captures from a toggled-off app stop appearing on the Sync review queue.

Record the result. If any step fails, treat it as a bug and debug before marking the plan complete.

---

## Notes on decomposition

- Tasks 1-3 (backend + native) have no interdependency and can be built in parallel; Tasks 4-6 (pure libs) likewise. Task 7 depends on 2/4/5/6; Task 8 depends on 2/3/5/6/7. Task 9 is final.
- The `CatalogEntry` type is defined twice on purpose (backend `catalog.constant.ts`, mobile `allowlistResolver.ts`) because the two codebases don't share a types package — this matches the existing split between `backend` DTOs and `mobile/src/api/types.ts`.
