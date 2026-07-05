# App Lock — Biometric + PIN Unlock — Design Spec

**Date:** 2026-07-06
**Scope:** Mobile only. Enforce the already-captured PIN and biometric preference with a lock screen, per the follow-up deferred in `2026-07-02-auth-onboarding-design.md` ("PIN lock screen on app resume").

## Problem

Biometric/PIN login is invisible today:

- Launch with a valid refresh token silently enters the app, so the Login screen's "Use Face ID" button is never seen by returning users.
- `logout()` clears the refresh token and PIN, so `canBiometricLogin` is effectively always false.
- The PIN (onboarding Secure step, Settings) is stored but never checked anywhere.

## Design

### Auth state

`AuthProvider` gains a fourth status: `locked`.

- **Launch:** after session restore succeeds (refresh + `/auth/me`), check `hasPin() || getBiometricEnabled()`. If either is set → `locked`, else `signedIn`. `user` and tokens are already in memory; the lock only gates the UI.
- **Resume:** while `signedIn` and lock is enabled, an `AppState` listener records when the app goes to background; on return to active after a **60 s grace period**, status → `locked`.
- **Unlock (biometric):** `LocalAuthentication.authenticateAsync` → success → `signedIn`.
- **Unlock (PIN):** `verifyPin` → success → `signedIn`. **5 consecutive failures → forced `logout()`** (clears tokens + PIN) with a toast; the user signs back in with a password.
- `logout()` behavior is unchanged (clears everything).

`AuthGate` in `Root.tsx` renders `LockScreen` for `locked`.

### LockScreen (`src/screens/auth/LockScreen.tsx`)

Reuses the handoff's Secure-step visual language (`MobileOnboard.jsx` OBSecure): `PageBackground`, wordmark, "Welcome back{, firstName}", PIN dots (supports the stored 4–6 digit length), numeric keypad, spring-in entrance.

- The onboarding keypad + PIN dots are extracted from `src/screens/onboarding/steps.tsx` into a shared component (`src/components/PinPad.tsx`) used by both.
- When biometric is enabled: a biometric button below the keypad, and an automatic prompt on mount. When only the PIN exists: keypad only.
- When biometric is enabled but no PIN exists: biometric button + retry; no keypad.
- "Log out" text link at the bottom (forgot-PIN escape) → confirm → `logout()`.

### Platform-aware biometric labeling

A small helper (`src/auth/biometricLabel.ts`) wraps `supportedAuthenticationTypesAsync`: facial recognition → "Face ID", fingerprint → "Fingerprint" (Android / Touch ID). Used by LockScreen, Login, Welcome, Settings, and the onboarding Secure step copy where it says "Face ID".

### Settings

New row in the Security section next to "Change PIN": toggle **"Unlock with Face ID/Fingerprint"** (label per device).

- Enable: real `authenticateAsync` check first (as onboarding does) → `setBiometricEnabled(true)` locally + persist `biometricEnabled` to backend preferences via the existing prefs API.
- Disable: `setBiometricEnabled(false)` + persist. No auth check needed.
- Hidden when the device has no biometric hardware/enrollment.

### Unchanged / out of scope

- Login and Welcome "Use Face ID" buttons keep their current gating (they now only matter in the rare signed-out-with-token state); labels become platform-aware.
- No backend changes (the `biometricEnabled` preference column already exists).
- No PIN-change flows beyond what Settings already has.
- PIN remains a device-local app lock, never an account credential.

## Error handling

- Biometric prompt cancel/failure on LockScreen: stay locked, keypad (if PIN exists) remains usable; button allows retry.
- `AppState` re-lock never fires during `locked`/`signedOut`/`onboarding`.
- Failed-attempt counter resets on successful unlock and on remount.

## Testing

- `tsc --noEmit` clean (project convention for mobile).
- Manual: cold launch with PIN → lock → wrong PIN ×5 → logout; background >60 s → relock; biometric enable in Settings on Android (fingerprint) and iOS (Face ID).
