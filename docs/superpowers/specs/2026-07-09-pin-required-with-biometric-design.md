# PIN Required With Biometric — Design Spec

**Date:** 2026-07-09
**Scope:** Mobile only. Follow-up to `2026-07-06-app-lock-design.md`. Make the on-device PIN a mandatory base factor whenever biometric unlock is enabled, so the lock screen always offers a PIN fallback.

## Problem

The two on-device unlock factors are independent flags:

- `biometricEnabled` — an AsyncStorage flag (`tokenStore.setBiometricEnabled`).
- PIN — a hashed secret in SecureStore (`tokenStore.savePin` / `hasPin`).

Nothing ties them together. `Settings.toggleBiometric` ([Settings.tsx:220](../../../mobile/src/screens/Settings.tsx)) proves the fingerprint works and flips the flag — it never checks for a PIN. A user without a PIN (e.g. reached the app via `skipToApp`, or a legacy/skip path) can therefore enable biometric alone.

The result is the reported state: **biometric on, no PIN set.** `LockScreen` only renders the keypad when a PIN exists (`methods.pin`), so a failed fingerprint leaves the user with nothing but **Log out** — which clears the session and forces a full re-login. There is no PIN fallback because no PIN exists to fall back to.

Onboarding already forces a PIN (the Secure step's "Finish setup" is gated on `pin.length === 4`), so the gaps are only the Settings toggle and devices already sitting in the biometric-only state.

## Invariant

**biometric ⟹ PIN.** Biometric can never be the only on-device unlock factor. PIN-alone remains valid; the rule is one-directional. Enforced at every entry point that can turn biometric on, plus a mandatory backfill for devices already violating it.

## Design

### 1. AuthProvider — split biometric auth from unlock

Today `unlockWithBiometric` ([AuthProvider.tsx:169](../../../mobile/src/auth/AuthProvider.tsx)) authenticates **and** sets `status = 'signedIn'` in one step, so the caller can't insert a PIN-creation step between "authenticated" and "unlocked".

Split it:

- `authenticateBiometric(): Promise<boolean>` — runs `LocalAuthentication.authenticateAsync` only; returns success; **no status change.**
- `finishUnlock(): void` — sets `status = 'signedIn'`.
- `unlockWithBiometric()` stays, re-expressed as `authenticateBiometric()` then, on success, `finishUnlock()`. Existing callers (the PIN-present path) are unaffected.

Both new members are added to `AuthContextValue` and the memoized `value`.

### 2. LockScreen — mandatory PIN backfill

Add a local UI mode to `LockScreen` for the biometric-only case (`methods.biometric && !methods.pin`):

- **Auth first.** The one auto-prompt on mount, and the "Use {bioLabel}" button, call `authenticateBiometric()` (not `unlockWithBiometric`) when biometric-only. On failure: keep existing toast behaviour and stay on the screen.
- **Create-PIN mode.** On success, instead of unlocking, switch into an inline create-PIN flow reusing the existing dots + `OBKeypad`. The backfill PIN is a **fixed 4 digits** (matching onboarding's Secure step, which also caps at 4), so each step auto-advances at 4 with no extra "done" affordance. Users can lengthen it to 6 later via Settings → Change PIN.
  1. `create` step — subtitle "Create a backup PIN", enter 4 digits, auto-advance to `confirm` at length 4.
  2. `confirm` step — subtitle "Confirm your backup PIN", re-enter 4 digits. On match: `savePin(pin)` then `finishUnlock()`. On mismatch: toast "PINs don't match", clear and reset to the `create` step.
- **Non-dismissible by construction.** This *is* the lock screen; nothing renders behind it. The only escape is **Log out**, which clears the session (`clearTokens` + `clearPin`) — so a biometric-only session can never slip through into the app.
- Existing PIN-present and mixed (PIN + biometric) paths are unchanged: keypad shows immediately, biometric button uses `unlockWithBiometric`.

### 3. Settings — enable-time gate

In `toggleBiometric(true)` ([Settings.tsx:220](../../../mobile/src/screens/Settings.tsx)):

- After the existing biometric hardware proof, if `!(await hasPin())`, require a PIN before enabling. Open the Set-PIN form (same fields/validation as `changePin`'s "Set PIN" branch: 4–6 digits, confirm match). Only on a successful `savePin` do we proceed to `setBiometricEnabled(true)` and the `biometricEnabled: true` pref sync, then set `pinSet` true.
- If the user cancels/dismisses the PIN form, biometric stays **off**: the toggle reverts to its prior state and no flag/pref is written.
- If a PIN already exists, behaviour is unchanged (proof → enable).

### 4. Settings — PIN-required hint

The "Set PIN" row ([Settings.tsx:433](../../../mobile/src/screens/Settings.tsx)) already shows sub "No PIN set on this device" when `!pinSet`. When biometric is on **and** no PIN is set (a state that can persist for legacy devices until their next unlock), strengthen the hint so it reads as required rather than optional — e.g. sub becomes "Required — biometric needs a backup PIN" and/or the row/icon adopts a warning affordance (`t.amber` is already used). Tapping still opens the Set-PIN form. This is belt-and-suspenders surfacing of the invariant inside Settings; the enforcing logic lives in the toggle gate and the lock-screen backfill.

## Non-goals / unchanged

- `useAppLockSetup` — handles the *no-factor* divergence (account wants a lock, device has neither PIN nor biometric); dismissible, and not a violation of this invariant. Left as-is.
- PIN hashing, length storage, and `verifyPin` in `tokenStore` — unchanged.
- Onboarding — already enforces a PIN; unchanged.
- Backend — none. All state is device-local.

## Edge cases

- **Biometric no longer enrolled, flag on, no PIN.** Auto-prompt and button both fail; user can only Log out. Pre-existing; acceptable (logout is a clean escape). The invariant reduces how often this state is created going forward.
- **User cancels biometric during backfill.** Stays on the lock screen; can retry or log out. No partial state written.
- **Mismat­ched confirm PIN.** No `savePin`; user retried from the create step. Nothing persisted until a matched pair.

## Testing

The repo's jest specs cover pure lib/api modules, not RN screens. Extract the branch decision into a small pure helper (e.g. `needsPinBackfill({ pin, biometric })` → `biometric && !pin`) and unit-test it. Verify the three flows — Settings enable gate, lock-screen backfill, PIN-required hint — end-to-end via the `verify` skill. Typecheck with `tsc`.
