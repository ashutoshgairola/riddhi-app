# Mobile 401 → refresh → retry → session-expired

**Date:** 2026-07-11
**Scope:** `mobile/` — transparent access-token refresh on `401 Unauthorized`.

## Goal

When any authenticated request returns `401`, transparently refresh the access
token and retry the request once. If the refresh cannot produce a working token
(refresh fails, or the retried request still `401`s), end the session and route
the user to Login. The retry is invisible to the user on the happy path.

## Behaviour contract

1. Request returns non-`401` → unchanged from today.
2. Request returns `401` **and** the path is **not** under `/auth/*`:
   - Refresh the access token (deduped — see below).
   - If a new token is obtained → **retry the original request exactly once**.
   - If refresh yields no token, **or** the retry still returns `401` →
     trigger session-expired, then reject as `ApiError(401)` (the in-flight
     promise still rejects, so callers' error handling is unchanged).
3. Retry is capped at **once**. No loops.
4. `/auth/*` paths (`login`, `register`, `refresh`, `google`,
   `forgot-password`, `reset-password`) are **excluded** from the refresh path:
   a `401` there is a real failure (e.g. bad credentials, dead refresh token)
   and must surface directly. This also prevents the refresh call itself from
   recursing.

## Session-expired = clear tokens, **keep** the PIN

"Forward to login" is a *session-expired* reset, not a full logout:

```
clearTokens();        // AsyncStorage access+refresh tokens
setAuthToken(null);   // in-memory bearer
setUser(null);
setStatus('signedOut');   // navigator already routes 'signedOut' → Login
```

It deliberately does **not** call `clearPin()` — the on-device PIN / biometric
config survives, per product decision. (A dead refresh token disables
biometric/quick-login anyway, so the user re-enters credentials regardless; the
PIN is a device-level lock, not an account credential.)

## Architecture — injected handlers (no import cycle)

All coordination lives in `mobile/src/api/client.ts`, the single REST choke
point. It must stay free of imports on `authApi` / `tokenStore` / AuthProvider
(`authApi` already imports `client`, so importing back would cycle). The
dependencies are **injected** by AuthProvider on mount:

`client.ts` adds:

- `setSessionHandlers({ onRefresh, onSessionExpired })` — registration setter.
  - `onRefresh: () => Promise<string | null>` — returns a fresh access token,
    or `null` when refresh is impossible.
  - `onSessionExpired: () => void` — the session-expired reset above.
- `refreshAccessToken(): Promise<string | null>` — **deduped** wrapper around
  `onRefresh`: collapses concurrent callers onto one in-flight promise so N
  simultaneous `401`s cause exactly one refresh. Cleared when it settles.
  Exported so the chat stream shares the same dedup.
- `notifySessionExpired(): void` — calls the registered `onSessionExpired`.
  Exported for the chat stream.
- Handlers are held in module state; if a `401` arrives before registration
  (very early launch), refresh is skipped and the request rejects normally.

`get`/`post`/`patch`/`del` collapse into one internal `request(method, path,
body?)` runner implementing the contract above. `buildHeaders()` already reads
the module `_token`, so the retry automatically uses the refreshed token after
`onRefresh` calls `setAuthToken`.

### AuthProvider wiring

On mount (effect), register:

- `onRefresh`: `loadTokens()` → if no refresh token, return `null`; else
  `authApi.refresh(refreshToken)` → `saveTokens()` → `setAuthToken(new)` →
  return the new access token. Any throw → return `null`.
- `onSessionExpired`: the keep-PIN reset above (uses the component's
  `setUser`/`setStatus`).

Handlers are stored via a ref so the latest closure is always invoked.

### Chat stream (`chatStream.ts`)

Same shape, reusing the exports. On a `401` response from `expoFetch`:
`await refreshAccessToken()`; on a new token, replay the `expoFetch` once with
the updated `getAuthToken()`; if still `401` → `notifySessionExpired()` and
throw. Because it calls the shared `refreshAccessToken()`, a REST call and a
chat start that `401` together trigger only one refresh.

## Testing

Repo jest runs pure-logic `*.spec.ts` in `node`, mocking `global.fetch`. New
`mobile/src/api/client.spec.ts`:

- `401` → refresh → retry succeeds (original request replayed once, resolves).
- Refresh returns `null` → `onSessionExpired` called, rejects `ApiError(401)`.
- Retry still `401` → `onSessionExpired` called, rejects.
- Two concurrent `401`s share a single `onRefresh` call (dedup).
- `/auth/login` `401` passes straight through — no refresh, no session-expired.
- Non-`401` error unchanged (throws `ApiError` with its status).

## Out of scope

- Changing the launch/restore refresh flow (AuthProvider already refreshes on
  boot) or the biometric quick-login flow.
- Any server-side change.
