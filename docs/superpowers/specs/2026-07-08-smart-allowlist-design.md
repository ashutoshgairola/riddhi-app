# Smart Notification Allowlist — Design

**Date:** 2026-07-08
**Status:** Approved (pending spec review)
**Area:** mobile (`notification-listener` module, `notificationSync`, Sync screen) + backend (`notification-sync`)

## Problem

The set of apps we capture notifications from is a hardcoded array,
`DEFAULT_ALLOWLIST`, in `mobile/modules/notification-listener/index.ts`. It is
pushed verbatim to the native `NotificationListenerService`, which runs
**default-deny** (captures nothing until seeded) for privacy.

Three pain points:

1. **Staleness / releases** — a new bank or merchant requires an app-store
   release before it is ever captured.
2. **Per-user relevance** — the one-size list is pushed to every device
   regardless of which finance/shopping apps the user actually has installed,
   widening the capture surface unnecessarily.
3. **User control** — users cannot see or choose which apps are monitored.

Note the structural constraint: because capture is default-deny, we cannot
"learn" which apps matter purely from captured data — an app we never capture
from produces no signal. Coverage must come from a maintained catalog, not
from observation.

## Approach

Server-updatable catalog → client install-probe → user toggles → effective
allowlist, with the current hardcoded array kept only as an offline fallback.

```
GET /notification-sync/catalog ──▶ catalogSource (fetch + cache + fallback)
                                        │
                     PackageManager ◀── getInstalledPackages(candidates)
                                        │
   AsyncStorage toggles ──▶ resolveAllowlist(catalog, installed, toggles)
                                        │
                                   setAllowlist(effective)  ──▶ native store
```

### Units (each independently testable)

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| Backend `GET /notification-sync/catalog` | Serve the canonical catalog | in-code catalog constant |
| `catalogSource` (JS) | Fetch catalog, cache in AsyncStorage, fall back to bundled seed | apiClient, AsyncStorage |
| native `getInstalledPackages(candidates)` | Return which candidate packages are installed | Android PackageManager + manifest `<queries>` |
| `resolveAllowlist(catalog, installed, toggles)` | **Pure** function → effective package list | none |
| toggle store (JS) | Read/write per-app on/off | AsyncStorage |
| Monitored-apps screen | Show catalog apps + installed state + switches | above units |

## Component detail

### 1. Backend catalog (in-code constant)

- New endpoint `GET /notification-sync/catalog` on the existing
  `NotificationSyncController` (JWT-guarded like its siblings).
- Returns `CatalogEntry[]`:
  ```ts
  interface CatalogEntry {
    packageName: string;   // e.g. "com.phonepe.app"
    displayName: string;   // "PhonePe"
    category: 'bank' | 'upi' | 'wallet' | 'merchant';
    region?: string;       // e.g. "IN"; optional, informational for now
  }
  ```
- The catalog is a typed constant (seeded from today's `DEFAULT_ALLOWLIST`,
  enriched with display names/categories) served by the service. Updating
  coverage = a backend deploy — no app-store release. A DB-backed,
  admin-editable catalog is a deliberate later step, not in this slice.

### 2. Client catalog source

- `catalogSource.ts`: `fetchCatalog(): Promise<CatalogEntry[]>`
  - GET the endpoint; on success cache the array in AsyncStorage under a
    versioned key and return it.
  - On failure (offline / first run / error) return the last cached array, or
    if none, a **bundled seed** derived from the retained `DEFAULT_ALLOWLIST`.
- `DEFAULT_ALLOWLIST` stays in the module but is demoted to the offline seed;
  it is no longer the canonical source.

### 3. Native install probe

- New `AsyncFunction("getInstalledPackages") { candidates: List<String> -> ... }`
  on `NotificationListenerModule`, using `PackageManager.getPackageInfo`
  per candidate, returning the subset that resolve. This is the lightweight
  call on the allowlist-push hot path — names only, no icons.
- Separate `AsyncFunction("getAppIcons") { packages: List<String> -> ... }`
  returning `{ packageName -> base64 PNG }` via
  `PackageManager.getApplicationIcon` (drawable → bitmap → PNG → base64).
  Called **only** when the Monitored-apps screen opens, never on the push
  path, so per-notification/config work stays cheap. Catalog is small
  (~15-30 apps) so a one-shot base64 batch is fine; the screen may cache the
  result in memory for the session.
- Manifest gains a `<queries>` block listing the catalog package names so the
  probe is visible under Android 11+ package-visibility rules.
- **Graceful degradation:** a catalog package **not** present in `<queries>`
  cannot be probed, so the probe reports it as "unknown", not "absent". The
  JS layer treats unknown-visibility packages as *includable* (see
  `resolveAllowlist`), so the server can still add a brand-new package and have
  it captured before a release adds it to `<queries>` — it simply won't get the
  install filter until then.
- JS wrapper: `getInstalledPackages(candidates: string[]): Promise<string[]>`;
  returns `[]` on non-Android (existing null-Native pattern).

### 4. `resolveAllowlist` (pure)

```ts
function resolveAllowlist(
  catalog: CatalogEntry[],
  probeResult: { installed: string[]; probed: string[] }, // probed = packages we could see (in <queries>)
  toggles: Record<string, boolean>,                        // pkg -> enabled; absent = default
): string[]
```

Rules:
- A catalog package is **candidate** if it is installed, OR it was not probable
  (`!probed.includes(pkg)` → unknown visibility).
- Default enabled = true; a package is included when `toggles[pkg] !== false`.
- Effective allowlist = candidates that are enabled.

Pure and deterministic → unit-tested in isolation with no native/HTTP mocks.

### 5. Toggle store

- `toggleStore.ts`: `getToggles()` / `setToggle(pkg, enabled)` over AsyncStorage
  (single JSON blob keyed by package). Absent key = default-on.

### 6. `configureAllowlist()` rewrite

`notificationSync.ts::configureAllowlist()` becomes the orchestrator:

```
catalog   = await fetchCatalog()
probe     = await getInstalledPackages(catalog.map(c => c.packageName))
toggles   = await getToggles()
effective = resolveAllowlist(catalog, probe, toggles)
await setAllowlist(effective)
```

The existing "paused" path (`setAllowlist([])`) is unchanged.

### 7. Monitored-apps screen

- New push screen (matches the `CardDetail` pattern already in the repo:
  registered in `screens.tsx`, navigated via `navContext`).
- **Entry point:** a `ListRow` in the notification-access settings area of the
  Sync screen (beside the listener-permission controls, not in the
  transaction-review flow), showing a chevron and an "N apps monitored" count
  (enabled ∩ installed). Tapping pushes the Monitored-apps screen.
- Lists catalog apps grouped by `category`; each row shows the **app icon**
  (from `getAppIcons`, fetched once on screen open), display name,
  installed/not-installed state, and a `Toggle` (reuses `components/ui`).
- Icon fallback: not-installed apps (no PackageManager icon) render a
  category glyph from `components/icons`.
- Not-installed apps render disabled/greyed (informational).
- Flipping a toggle writes via `setToggle` and re-runs `configureAllowlist()`
  so the native allowlist updates immediately.

## Data flow (runtime)

1. Sync screen opens → `configureAllowlist()` runs (existing behavior).
2. Orchestrator fetches catalog (cached), probes installs, reads toggles,
   computes effective list, pushes to native.
3. User opens Monitored-apps, toggles an app off → persisted → allowlist
   re-pushed → native stops capturing that package.

## Error handling

- Catalog fetch failure → cached, else bundled seed (never empty-by-error).
- Native probe on non-Android or null module → `[]`; combined with the
  "unknown ⇒ includable" rule this means non-probeable environments fall back
  to the full enabled catalog (safe: matches today's behavior of pushing the
  whole list).
- AsyncStorage read failure → treat as no toggles (all default-on).

## Testing

- `resolveAllowlist` — pure unit tests: installed-only, unknown-visibility
  inclusion, explicit disable, empty catalog.
- `catalogSource` — mock apiClient + AsyncStorage: success caches; failure
  falls back to cache then seed.
- `toggleStore` — round-trip and default-on-when-absent.
- `notificationSync.spec.ts` — extend existing mock so `configureAllowlist`
  pushes the resolved list (not the raw `DEFAULT_ALLOWLIST`).
- Backend — controller test for `GET /notification-sync/catalog` shape.

## Out of scope (YAGNI)

- DB-backed / admin-editable catalog.
- `QUERY_ALL_PACKAGES` full enumeration (rejected: Play sensitive permission).
- Region-based filtering logic (field carried, not acted on yet).
- Learning coverage from confirmed detections.

## Files touched

**Backend**
- `notification-sync.controller.ts` — add `GET catalog`
- `notification-sync.service.ts` — `getCatalog()`
- new `catalog.constant.ts` (or similar)
- new controller/service spec coverage

**Mobile — native**
- `NotificationListenerModule.kt` — `getInstalledPackages`, `getAppIcons`
- `AndroidManifest.xml` — `<queries>` block

**Mobile — JS**
- `modules/notification-listener/index.ts` — `getInstalledPackages` +
  `getAppIcons` wrappers; `DEFAULT_ALLOWLIST` demoted to seed
- new `src/lib/catalogSource.ts`, `src/lib/allowlistResolver.ts`,
  `src/lib/toggleStore.ts` (+ specs)
- `src/lib/notificationSync.ts` — rewrite `configureAllowlist`
- new `src/screens/MonitoredApps.tsx`; register in `app/screens.tsx`; Sync row
