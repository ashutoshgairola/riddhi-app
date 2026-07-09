# PIN Required With Biometric — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an on-device PIN a mandatory base factor whenever biometric unlock is enabled, so the lock screen always offers a PIN fallback.

**Architecture:** Enforce the invariant `biometric ⟹ PIN` at every point that can turn biometric on: the Settings toggle gains a PIN gate, the lock screen gains a mandatory inline 4-digit PIN backfill for devices already in the biometric-only state, and a small pure policy helper decides when the backfill is needed. AuthProvider's `unlockWithBiometric` is split so a PIN-creation step can sit between "authenticated" and "unlocked".

**Tech Stack:** React Native (Expo v56), TypeScript, jest, expo-local-authentication, expo-secure-store, AsyncStorage.

## Global Constraints

- Mobile only. No backend changes. All lock state is device-local.
- Expo v56 — read `https://docs.expo.dev/versions/v56.0.0/` before writing Expo API code.
- Git commits: author email `gairola.ashutosh26@gmail.com`, author name `Ashutosh`; **no** `Co-Authored-By` trailer. Use `git -c user.email=gairola.ashutosh26@gmail.com -c user.name=Ashutosh commit`.
- PIN rules: digits only; onboarding/backfill uses a fixed **4-digit** PIN; Settings Change PIN allows 4–6. Never store the PIN in plaintext (`tokenStore.savePin` hashes it).
- Invariant is one-directional: `biometric ⟹ PIN`. PIN-alone stays valid.
- Test command: `npm test` (jest) from `mobile/`. Typecheck: `npx tsc --noEmit` from `mobile/`.

---

## File Structure

- **Create** `mobile/src/auth/lockPolicy.ts` — pure helper `needsPinBackfill({ pin, biometric })`. One responsibility: the branch decision, unit-testable without native mocks.
- **Create** `mobile/src/auth/lockPolicy.spec.ts` — unit tests for the helper.
- **Modify** `mobile/src/auth/AuthProvider.tsx` — split `unlockWithBiometric` into `authenticateBiometric()` + `finishUnlock()`; expose both.
- **Modify** `mobile/src/screens/auth/LockScreen.tsx` — biometric-only backfill: inline create→confirm 4-digit PIN mode.
- **Modify** `mobile/src/screens/Settings.tsx` — enable-time PIN gate in `toggleBiometric`; PIN-required hint on the Set-PIN row.

---

### Task 1: Lock policy helper

**Files:**
- Create: `mobile/src/auth/lockPolicy.ts`
- Test: `mobile/src/auth/lockPolicy.spec.ts`

**Interfaces:**
- Produces: `interface LockMethods { pin: boolean; biometric: boolean }` and `function needsPinBackfill(m: LockMethods): boolean` (returns `true` iff `biometric && !pin`).

- [ ] **Step 1: Write the failing test**

Create `mobile/src/auth/lockPolicy.spec.ts`:

```ts
import { needsPinBackfill } from './lockPolicy';

describe('needsPinBackfill', () => {
  it('is true only when biometric is on and no PIN is set', () => {
    expect(needsPinBackfill({ pin: false, biometric: true })).toBe(true);
  });
  it('is false when a PIN exists (with biometric)', () => {
    expect(needsPinBackfill({ pin: true, biometric: true })).toBe(false);
  });
  it('is false when biometric is off (PIN-only is valid)', () => {
    expect(needsPinBackfill({ pin: true, biometric: false })).toBe(false);
  });
  it('is false when neither factor is configured', () => {
    expect(needsPinBackfill({ pin: false, biometric: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- lockPolicy`
Expected: FAIL — cannot find module `./lockPolicy`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/src/auth/lockPolicy.ts`:

```ts
/**
 * lockPolicy — the app-lock invariant `biometric ⟹ PIN`, as a pure decision.
 * Biometric may never be the only on-device unlock factor; a device with
 * biometric on but no PIN must create one before it can enter the app.
 */
export interface LockMethods {
  pin: boolean;
  biometric: boolean;
}

/** True when biometric is enabled but no PIN exists — a backup PIN is required. */
export function needsPinBackfill(m: LockMethods): boolean {
  return m.biometric && !m.pin;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- lockPolicy`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/auth/lockPolicy.ts mobile/src/auth/lockPolicy.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com -c user.name=Ashutosh commit -m "feat(mobile): lock policy helper for PIN-required-with-biometric"
```

---

### Task 2: Split biometric auth from unlock in AuthProvider

**Files:**
- Modify: `mobile/src/auth/AuthProvider.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: on `AuthContextValue` — `authenticateBiometric(): Promise<boolean>` (runs the biometric prompt only, no status change) and `finishUnlock(): void` (sets status `signedIn`). `unlockWithBiometric(): Promise<boolean>` remains, now = authenticate then finish.

- [ ] **Step 1: Add the two members to the interface**

In `mobile/src/auth/AuthProvider.tsx`, in `interface AuthContextValue` (currently near line 29), add after `unlockWithBiometric(): Promise<boolean>;`:

```ts
  /** Runs the biometric prompt only; does not change status. */
  authenticateBiometric(): Promise<boolean>;
  /** Completes an app-lock unlock (status -> signedIn). */
  finishUnlock(): void;
```

- [ ] **Step 2: Implement the callbacks and re-express unlockWithBiometric**

Replace the existing `unlockWithBiometric` callback (currently lines 169-176):

```ts
  // App-lock unlocks: the session is already in memory; these only gate UI.
  const unlockWithBiometric = useCallback(async (): Promise<boolean> => {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Riddhi',
    });
    if (!auth.success) return false;
    setStatus('signedIn');
    return true;
  }, []);
```

with:

```ts
  // App-lock unlocks: the session is already in memory; these only gate UI.
  // `authenticateBiometric` runs the biometric prompt without unlocking, so
  // callers can require a PIN backfill between "authenticated" and "unlocked".
  const authenticateBiometric = useCallback(async (): Promise<boolean> => {
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Riddhi',
    });
    return auth.success;
  }, []);

  const finishUnlock = useCallback((): void => {
    setStatus('signedIn');
  }, []);

  const unlockWithBiometric = useCallback(async (): Promise<boolean> => {
    const ok = await authenticateBiometric();
    if (ok) finishUnlock();
    return ok;
  }, [authenticateBiometric, finishUnlock]);
```

- [ ] **Step 3: Add both to the memoized context value**

In the `useMemo<AuthContextValue>` object (currently near line 207), add `authenticateBiometric,` and `finishUnlock,` alongside `unlockWithBiometric,`. Add both names to the dependency array as well.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/auth/AuthProvider.tsx
git -c user.email=gairola.ashutosh26@gmail.com -c user.name=Ashutosh commit -m "feat(mobile): split biometric auth from unlock in AuthProvider"
```

---

### Task 3: LockScreen mandatory PIN backfill

**Files:**
- Modify: `mobile/src/screens/auth/LockScreen.tsx`

**Interfaces:**
- Consumes: `authenticateBiometric`, `finishUnlock` from `useAuth()` (Task 2); `needsPinBackfill`, `LockMethods` from `../../auth/lockPolicy` (Task 1); `savePin` from `../../auth/tokenStore`.
- Produces: no exported surface change.

**Context:** The screen currently derives `methods: { pin, biometric }`. When `needsPinBackfill(methods)` is true, a successful biometric auth must NOT unlock directly — it enters an inline `create` → `confirm` 4-digit flow that saves the PIN, then unlocks. The screen already imports `OBKeypad` and renders PIN dots; reuse both. Fixed 4-digit length (matches onboarding) so each step auto-advances at 4 with no "done" button.

- [ ] **Step 1: Add imports and backfill state**

In `mobile/src/screens/auth/LockScreen.tsx`:

Replace the local `interface LockMethods { pin: boolean; biometric: boolean; }` (lines 23-26) — delete it and import from the policy module instead. Update the `tokenStore` import (line 13) to also import `savePin`, and add the policy import:

```ts
import { getBiometricEnabled, getPinLength, hasPin, savePin } from '../../auth/tokenStore';
import { needsPinBackfill, type LockMethods } from '../../auth/lockPolicy';
```

Pull `authenticateBiometric` and `finishUnlock` from `useAuth()` (line 31):

```ts
  const { user, unlockWithBiometric, authenticateBiometric, finishUnlock, unlockWithPin, logout } =
    useAuth();
```

Add backfill state near the other `useState` calls (after line 40):

```ts
  // Backfill mode for biometric-only devices: after biometric auth we make the
  // user create a 4-digit backup PIN before entering the app (spec § invariant).
  const [backfill, setBackfill] = useState<'off' | 'create' | 'confirm'>('off');
  const firstPin = useRef('');
  const BACKFILL_LEN = 4;
```

- [ ] **Step 2: Route biometric success through the backfill branch**

Replace the `promptBiometric` callback (lines 59-63):

```ts
  const promptBiometric = useCallback(async () => {
    const ok = await unlockWithBiometric();
    if (!ok && methods?.pin) toast(`${bioLabel} didn't match — use your PIN`, '⚠️');
    else if (!ok) toast(`${bioLabel} didn't match — try again`, '⚠️');
  }, [unlockWithBiometric, methods, bioLabel, toast]);
```

with:

```ts
  const promptBiometric = useCallback(async () => {
    // Biometric-only device: authenticate, then require a backup PIN instead
    // of unlocking straight into the app.
    if (methods && needsPinBackfill(methods)) {
      const ok = await authenticateBiometric();
      if (ok) {
        setPin('');
        firstPin.current = '';
        setBackfill('create');
      } else {
        toast(`${bioLabel} didn't match — try again`, '⚠️');
      }
      return;
    }
    const ok = await unlockWithBiometric();
    if (!ok && methods?.pin) toast(`${bioLabel} didn't match — use your PIN`, '⚠️');
    else if (!ok) toast(`${bioLabel} didn't match — try again`, '⚠️');
  }, [unlockWithBiometric, authenticateBiometric, methods, bioLabel, toast]);
```

- [ ] **Step 3: Handle keypad input during backfill**

Replace the `onKey` handler (lines 90-100) so it feeds either the unlock path (existing) or the backfill create/confirm path:

```ts
  const onKey = (k: string) => {
    if (checking.current) return;
    const len = backfill === 'off' ? pinLength : BACKFILL_LEN;
    setPin((p) => {
      if (k === 'del') return p.slice(0, -1);
      if (k === '.') return p;
      if (p.length >= len) return p;
      const next = p + k;
      if (next.length === len) {
        if (backfill === 'off') void submit(next);
        else void onBackfillComplete(next);
      }
      return next;
    });
  };

  const onBackfillComplete = async (candidate: string) => {
    if (backfill === 'create') {
      firstPin.current = candidate;
      setPin('');
      setBackfill('confirm');
      return;
    }
    // confirm
    if (candidate !== firstPin.current) {
      toast("PINs don't match — try again", '⚠️');
      firstPin.current = '';
      setPin('');
      setBackfill('create');
      return;
    }
    await savePin(candidate);
    finishUnlock();
  };
```

- [ ] **Step 4: Render the backfill UI**

The screen's body currently shows the keypad only when `methods.pin` (line 144 `{methods.pin ? (...) : null}`) and the biometric button when `methods.biometric`. Update the subtitle and the two conditionals so backfill mode shows dots + keypad and hides the biometric button.

Change the subtitle line (lines 138-140) to:

```tsx
          <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>
            {backfill === 'create'
              ? 'Create a backup PIN'
              : backfill === 'confirm'
                ? 'Confirm your backup PIN'
                : methods.pin
                  ? 'Enter your PIN to unlock'
                  : `Unlock with ${bioLabel}`}
          </Text>
```

Change the keypad conditional (line 144) from `{methods.pin ? (` to `{methods.pin || backfill !== 'off' ? (`, and inside it make the dots count use the active length:

```tsx
                {Array.from({ length: backfill === 'off' ? pinLength : BACKFILL_LEN }).map((_, i) => (
```

Change the biometric-button conditional (line 166) from `{methods.biometric ? (` to `{methods.biometric && backfill === 'off' ? (` so it disappears once the user is creating their PIN.

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify the flow end-to-end**

Invoke the `verify` skill (or manually drive the app): set a device into the biometric-on/no-PIN state, launch to the lock screen, authenticate biometrically, and confirm you are forced through create → confirm before the app opens; confirm a mismatched confirm resets to create; confirm "Log out" still exits. Confirm PIN-present devices unlock exactly as before.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/auth/LockScreen.tsx
git -c user.email=gairola.ashutosh26@gmail.com -c user.name=Ashutosh commit -m "feat(mobile): mandatory backup-PIN setup on biometric-only lock screen"
```

---

### Task 4: Settings enable-time PIN gate

**Files:**
- Modify: `mobile/src/screens/Settings.tsx`

**Interfaces:**
- Consumes: existing `savePin`, `hasPin`, `setBiometricEnabled`, `getBiometricEnabled` from `tokenStore`; `form`, `toast` from `useFeedback`; `setPref` local helper.
- Produces: no exported change. After this task, enabling biometric with no PIN opens a Set-PIN form and only enables biometric once the PIN is saved.

**Context:** `toggleBiometric` (lines 220-244) currently proves the biometric then unconditionally calls `setBiometricEnabled(true)` + `setBioOn(true)` + `setPref`. The `Toggle` is controlled by `bioOn`, so simply *not* setting `bioOn` leaves the switch visually off — no explicit revert needed. We insert a PIN requirement between the proof and enabling.

- [ ] **Step 1: Extract the "finish enabling" step and gate on a PIN**

Replace the `toggleBiometric` function (lines 220-244) with:

```ts
  // Enable biometric only once a PIN exists — biometric may never be the sole
  // unlock factor (spec: PIN Required With Biometric).
  const enableBiometric = () => {
    void setBiometricEnabled(true).then(() => {
      setBioOn(true);
      setPref({ biometricEnabled: true }, `${bioLabel} unlock on`, '🔒');
    });
  };

  const promptSetPinThenEnable = () => {
    form({
      title: 'Set a backup PIN',
      fields: [
        { key: 'pin', label: 'New PIN (4–6 digits)' },
        { key: 'confirm', label: 'Confirm new PIN' },
      ],
      submitLabel: 'Set PIN & enable',
      onSubmit: async (v) => {
        if (!/^\d{4,6}$/.test(v['pin'] ?? '')) throw new Error('PIN must be 4–6 digits');
        if (v['pin'] !== v['confirm']) throw new Error("PINs don't match");
        await savePin(v['pin']!);
        setPinSet(true);
        enableBiometric();
        toast('Backup PIN set — app lock is on', '🔒');
      },
    });
  };

  const toggleBiometric = async (v: boolean) => {
    if (!v) {
      await setBiometricEnabled(false);
      setBioOn(false);
      setPref({ biometricEnabled: false }, `${bioLabel} unlock off`, '🔒');
      return;
    }
    // Needs an enrolled face/fingerprint before it can be an unlock method.
    if (!(await LocalAuthentication.isEnrolledAsync())) {
      toast(`Set up ${bioLabel} in your device settings first`, '🔒');
      return;
    }
    // Prove the biometric works before trusting it as an unlock method,
    // mirroring the onboarding Secure step.
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm to enable app lock',
    });
    if (!auth.success) {
      toast(`${bioLabel} check failed`, '⚠️');
      return;
    }
    // Biometric can't stand alone — require a backup PIN first if none exists.
    if (!(await hasPin())) {
      promptSetPinThenEnable();
      return;
    }
    enableBiometric();
  };
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the gate**

Invoke `verify` (or manually): on a device with no PIN, toggle biometric on → confirm the biometric proof runs, then the Set-PIN form appears; cancelling it leaves biometric **off**; completing it enables biometric and sets the PIN. On a device with a PIN already, toggling on enables directly after the proof (no form).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/Settings.tsx
git -c user.email=gairola.ashutosh26@gmail.com -c user.name=Ashutosh commit -m "feat(mobile): require a backup PIN before enabling biometric in Settings"
```

---

### Task 5: Settings PIN-required hint

**Files:**
- Modify: `mobile/src/screens/Settings.tsx`

**Interfaces:**
- Consumes: existing `bioOn`, `pinSet` state; theme `t.amber`.
- Produces: no exported change.

**Context:** The Set-PIN row (lines 433-440) shows sub "No PIN set on this device" when `!pinSet`. When biometric is on but no PIN exists — a state legacy devices can sit in until their next unlock — surface it as *required* with an amber affordance.

- [ ] **Step 1: Make the row reflect the required state**

Replace the Set-PIN `Row` (lines 433-440):

```tsx
          <Row
            icon="🔑"
            color={t.amber}
            title={pinSet ? "Change PIN" : "Set PIN"}
            sub={pinSet ? undefined : "No PIN set on this device"}
            last
            onPress={() => void changePin()}
          />
```

with:

```tsx
          <Row
            icon="🔑"
            color={t.amber}
            title={pinSet ? "Change PIN" : "Set PIN"}
            sub={
              pinSet
                ? undefined
                : bioOn
                  ? "Required — biometric needs a backup PIN"
                  : "No PIN set on this device"
            }
            last
            onPress={() => void changePin()}
          />
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the hint**

Invoke `verify` (or manually): view Settings with biometric on and no PIN → the Set-PIN row reads "Required — biometric needs a backup PIN". With a PIN set, the row reads "Change PIN" with no sub. With biometric off and no PIN, it reads "No PIN set on this device".

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/Settings.tsx
git -c user.email=gairola.ashutosh26@gmail.com -c user.name=Ashutosh commit -m "feat(mobile): flag Set PIN as required when biometric is on without a PIN"
```

---

## Self-Review

**Spec coverage:**
- Invariant `biometric ⟹ PIN` → Task 1 (helper), enforced in Tasks 3 & 4. ✓
- AuthProvider split (`authenticateBiometric` / `finishUnlock`) → Task 2. ✓
- LockScreen mandatory backfill, fixed 4-digit, create→confirm, non-dismissible, biometric button hidden during backfill → Task 3. ✓
- Settings enable-time gate, cancel = stays off → Task 4. ✓
- Settings PIN-required hint → Task 5. ✓
- Non-goals (`useAppLockSetup`, tokenStore hashing, onboarding, backend) untouched — no task modifies them. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `LockMethods`/`needsPinBackfill` defined in Task 1 and imported in Task 3; `authenticateBiometric`/`finishUnlock` defined in Task 2 and consumed in Task 3; `backfill` state type `'off' | 'create' | 'confirm'` used consistently; `BACKFILL_LEN` used for both dots and input cap. ✓
